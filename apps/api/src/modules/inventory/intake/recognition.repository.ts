import { Inject, Injectable } from "@nestjs/common";
import type {
  IntakeRecognitionStatus,
  IntakeRecognitionRun,
  IntakeRecapture,
  IntakeGroupDecision,
  IntakeRecognitionAttemptMetric,
} from "@simply-clean/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@simply-clean/database";
import { sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { DATABASE_CONNECTION } from "../../../platform/database.module.js";
import {
  FILES_OPERATIONS,
  type FilesOperations,
} from "../../files/files.service.js";
import {
  IDEMPOTENCY_COORDINATOR,
  MUTATION_RECORDER,
  requestFingerprint,
  type IdempotencyCoordinator,
  type MutationRecorder,
} from "../../operations/operations.ports.js";
import type { InventoryActorContext } from "../inventory.repository.js";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((item): item is Row => !!item && typeof item === "object")
    : value && typeof value === "object" && "rows" in value
      ? rows((value as { rows: unknown }).rows)
      : [];
const iso = (value: unknown) => new Date(value as string | Date).toISOString();
const nullable = (value: unknown) => (typeof value === "string" ? value : null);

function inputFingerprint(
  inputVersion: number,
  photos: ReadonlyArray<Row>,
): string {
  const orderedEntries = photos.map(
    (photo) =>
      `${photo.photo_id}:${photo.file_id}:${String(photo.sha256 ?? "missing")}`,
  );
  return createHash("sha256")
    .update(`${inputVersion}|${orderedEntries.join("|")}`)
    .digest("hex");
}

function runFromRow(row: Row): IntakeRecognitionRun {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    photoId: nullable(row.photo_id),
    candidateId: nullable(row.candidate_id),
    candidateRevision:
      row.candidate_revision === null || row.candidate_revision === undefined
        ? null
        : Number(row.candidate_revision),
    state: row.state as IntakeRecognitionRun["state"],
    inputVersion: Number(row.input_version),
    policyVersion: String(row.policy_version),
    provider: String(row.provider),
    model: String(row.model),
    errorCode: nullable(row.error_code) as IntakeRecognitionRun["errorCode"],
    groups: (row.groups ?? []) as IntakeGroupDecision[],
    ...(row.provenance && Object.keys(row.provenance as object).length
      ? { provenance: row.provenance as IntakeRecognitionRun["provenance"] }
      : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function recaptureFromRow(row: Row): IntakeRecapture {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    batchId: String(row.batch_id),
    candidateId: nullable(row.candidate_id),
    photoIds: (row.photo_ids ?? []) as string[],
    field: nullable(row.field) as IntakeRecapture["field"],
    reason: String(row.reason) as IntakeRecapture["reason"],
    instruction: String(row.instruction),
    state: row.state as IntakeRecapture["state"],
    resolvedByUserId: nullable(row.resolved_by_user_id),
  };
}

@Injectable()
export class IntakeRecognitionRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    @Inject(FILES_OPERATIONS) private readonly files: FilesOperations,
    @Inject(MUTATION_RECORDER) private readonly recorder: MutationRecorder,
    @Inject(IDEMPOTENCY_COORDINATOR)
    private readonly idempotency: IdempotencyCoordinator,
  ) {}

  async status(
    batchId: string,
    enabled: boolean,
  ): Promise<IntakeRecognitionStatus> {
    const batch = rows(
      await this.connection.database.execute(
        sql`select id from inventory_intake_batch where id = ${batchId}`,
      ),
    )[0];
    if (!batch) throw new Error("INTAKE_BATCH_NOT_FOUND");
    const runs = rows(
      await this.connection.database.execute(
        sql`select * from inventory_intake_recognition_run where batch_id = ${batchId} order by created_at desc, id desc limit 200`,
      ),
    ).map(runFromRow);
    const recaptures = rows(
      await this.connection.database.execute(
        sql`select * from inventory_intake_recapture where batch_id = ${batchId} order by created_at, id`,
      ),
    ).map(recaptureFromRow);
    return {
      enabled,
      latestRun: runs[0] ?? null,
      runs,
      recaptures,
    };
  }

  async request(
    batchId: string,
    expectedVersion: number,
    retry: boolean,
    context: InventoryActorContext,
    config: {
      provider: string;
      model: string;
      verifier: string;
      verifierModel: string;
      policyVersion: string;
    },
    target?: { photoId: string; candidateId: string },
  ): Promise<IntakeRecognitionRun> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.recognition.request",
        { batchId, expectedVersion, retry, target },
        context,
      );
      if (reservation.existingTargetId) {
        const existing = rows(
          await database.execute(
            sql`select * from inventory_intake_recognition_run where id = ${reservation.existingTargetId}`,
          ),
        )[0];
        if (existing) return runFromRow(existing);
      }
      const batch = rows(
        await database.execute(
          sql`select * from inventory_intake_batch where id = ${batchId} and state = 'open' for update`,
        ),
      )[0];
      if (!batch) throw new Error("INTAKE_BATCH_NOT_FOUND");
      if (Number(batch.version) !== expectedVersion)
        throw new Error("INTAKE_VERSION_CONFLICT");
      if (target) {
        const targetRows = rows(
          await database.execute(sql`
            select p.id as photo_id, p.file_id, c.id as candidate_id, c.version as candidate_revision
            from inventory_intake_photo p
            inner join inventory_intake_candidate c on c.id = p.candidate_id and c.batch_id = p.batch_id
            where p.id = ${target.photoId} and c.id = ${target.candidateId}
              and p.batch_id = ${batchId} and p.disposition = 'assigned'
          `),
        );
        const targetRow = targetRows[0];
        if (!targetRow) throw new Error("INTAKE_TARGET_NOT_FOUND");
        const targetFile = (
          await this.files.findIntakeEvidence(
            database,
            [String(targetRow.file_id)],
            String(batch.load_id),
          )
        )[0];
        if (!targetFile || targetFile.state !== "ready")
          throw new Error("INTAKE_FILE_INVALID");
        const fingerprint = createHash("sha256")
          .update(
            `${targetRow.file_id}|${targetFile.sha256}|${target.candidateId}|${targetRow.candidate_revision}|${config.provider}|${config.model}|${config.verifier}|${config.verifierModel}|${config.policyVersion}`,
          )
          .digest("hex");
        let existing = rows(
          await database.execute(
            sql`select * from inventory_intake_recognition_run where batch_id = ${batchId} and photo_id = ${target.photoId} and candidate_id = ${target.candidateId} and candidate_revision = ${targetRow.candidate_revision} and input_fingerprint = ${fingerprint} order by created_at desc limit 1`,
          ),
        )[0];
        if (
          existing &&
          (!retry || ["queued", "running"].includes(String(existing.state)))
        ) {
          if (reservation.recordId)
            await this.idempotency.complete(database, {
              recordId: reservation.recordId,
              targetType: "intake_recognition_run",
              targetId: String(existing.id),
            });
          return runFromRow(existing);
        }
        const runId = randomUUID();
        const provenance = {
          provider: config.provider,
          model: config.model,
          schemaVersion: "intake-nameplate-v2",
          verifier: config.verifier,
          verifierModel: config.verifierModel,
          policyVersion: config.policyVersion,
          inputFingerprint: fingerprint,
          sourceChecksums: { [target.photoId]: targetFile.sha256 },
        };
        const result = await database.execute(sql`
          insert into inventory_intake_recognition_run
            (id, batch_id, photo_id, candidate_id, candidate_revision, input_version, input_fingerprint, provider, model, verifier, verifier_model, schema_version, policy_version, provenance)
          values
            (${runId}, ${batchId}, ${target.photoId}, ${target.candidateId}, ${targetRow.candidate_revision}, ${expectedVersion}, ${fingerprint}, ${config.provider}, ${config.model}, ${config.verifier}, ${config.verifierModel}, 'intake-nameplate-v2', ${config.policyVersion}, ${JSON.stringify(provenance)}::jsonb)
          returning *
        `);
        existing = rows(result)[0];
        await this.recorder.record(database, {
          actorKind: "user",
          actorUserId: context.actorUserId,
          action: "inventory.intake.recognition.requested",
          targetType: "intake_recognition_run",
          targetId: runId,
          requestId: context.requestId,
          summary: { changedFields: ["recognition_run"], outcome: "queued" },
        });
        if (reservation.recordId)
          await this.idempotency.complete(database, {
            recordId: reservation.recordId,
            targetType: "intake_recognition_run",
            targetId: runId,
          });
        return runFromRow(existing!);
      }
      const photos = rows(
        await database.execute(
          sql`select p.id, p.file_id, p.photo_order from inventory_intake_photo p where p.batch_id = ${batchId} and p.disposition <> 'excluded' order by p.photo_order`,
        ),
      );
      if (!photos.length) throw new Error("INTAKE_PHOTO_REQUIRED");
      const files = await this.files.findIntakeEvidence(
        database,
        photos.map((photo) => String(photo.file_id)),
        String(batch.load_id),
      );
      if (
        files.length !== photos.length ||
        files.some((file) => file.state !== "ready")
      )
        throw new Error("INTAKE_FILE_INVALID");
      const evidenceByFileId = new Map(files.map((file) => [file.id, file]));
      const fingerprint = inputFingerprint(
        expectedVersion,
        photos.map((photo) => ({
          photo_id: photo.id,
          file_id: photo.file_id,
          sha256: evidenceByFileId.get(String(photo.file_id))?.sha256,
        })),
      );
      const sourceChecksums = Object.fromEntries(
        photos.map((photo) => [
          String(photo.id),
          evidenceByFileId.get(String(photo.file_id))?.sha256 ?? "",
        ]),
      );
      const provenance = {
        provider: config.provider,
        model: config.model,
        schemaVersion: "intake-nameplate-v2",
        verifier: config.verifier,
        verifierModel: config.verifierModel,
        policyVersion: config.policyVersion,
        inputFingerprint: fingerprint,
        sourceChecksums,
      };
      let existing = rows(
        await database.execute(
          sql`select * from inventory_intake_recognition_run where batch_id = ${batchId} and input_version = ${expectedVersion} and input_fingerprint = ${fingerprint} order by created_at desc limit 1`,
        ),
      )[0];
      if (
        existing &&
        (!retry || ["queued", "running"].includes(String(existing.state)))
      ) {
        if (reservation.recordId)
          await this.idempotency.complete(database, {
            recordId: reservation.recordId,
            targetType: "intake_recognition_run",
            targetId: String(existing.id),
          });
        return runFromRow(existing);
      }
      const runId = randomUUID();
      const result = await database.execute(
        sql`insert into inventory_intake_recognition_run (id, batch_id, input_version, input_fingerprint, provider, model, verifier, verifier_model, schema_version, policy_version, provenance) values (${runId}, ${batchId}, ${expectedVersion}, ${fingerprint}, ${config.provider}, ${config.model}, ${config.verifier}, ${config.verifierModel}, 'intake-nameplate-v2', ${config.policyVersion}, ${JSON.stringify(provenance)}::jsonb) returning *`,
      );
      existing = rows(result)[0];
      await this.recorder.record(database, {
        actorKind: "user",
        actorUserId: context.actorUserId,
        action: "inventory.intake.recognition.requested",
        targetType: "intake_recognition_run",
        targetId: runId,
        requestId: context.requestId,
        summary: { changedFields: ["recognition_run"], outcome: "queued" },
      });
      if (reservation.recordId)
        await this.idempotency.complete(database, {
          recordId: reservation.recordId,
          targetType: "intake_recognition_run",
          targetId: runId,
        });
      return runFromRow(existing!);
    });
  }

  async claim(
    runId: string,
    options: {
      recoverAbandonedRunning?: boolean;
      workerClaim: string;
    },
  ): Promise<
    | {
        run: IntakeRecognitionRun;
        batchId: string;
        loadId: string;
        photos: { photoId: string; fileId: string }[];
        workerClaim: string;
      }
    | undefined
  > {
    return this.connection.transaction(async (database) => {
      const row = rows(
        await database.execute(
          sql`select r.*, b.load_id from inventory_intake_recognition_run r inner join inventory_intake_batch b on b.id = r.batch_id where r.id = ${runId} and (r.state = 'queued' or (r.state = 'running' and ${options.recoverAbandonedRunning === true})) limit 1 for update`,
        ),
      )[0];
      if (!row) return undefined;
      const updated = rows(
        await database.execute(
          sql`update inventory_intake_recognition_run set state = 'running', provenance = coalesce(provenance, '{}'::jsonb) || jsonb_build_object('workerClaim', ${options.workerClaim}::text), updated_at = now() where id = ${row.id} and (state = 'queued' or (state = 'running' and ${options.recoverAbandonedRunning === true})) returning *`,
        ),
      )[0];
      if (!updated) return undefined;
      const photos = rows(
        await database.execute(
          row.photo_id
            ? sql`select id as photo_id, file_id from inventory_intake_photo where id = ${row.photo_id} and batch_id = ${row.batch_id} and disposition <> 'excluded'`
            : sql`select id as photo_id, file_id from inventory_intake_photo where batch_id = ${row.batch_id} and disposition <> 'excluded' order by photo_order`,
        ),
      );
      return {
        run: runFromRow(updated),
        batchId: String(row.batch_id),
        loadId: String(row.load_id),
        workerClaim: options.workerClaim,
        photos: photos.map((photo) => ({
          photoId: String(photo.photo_id),
          fileId: String(photo.file_id),
        })),
      };
    });
  }

  async apply(
    runId: string,
    batchId: string,
    decisions: IntakeGroupDecision[],
    provenance: Record<string, unknown>,
    sourceChecksums: Record<string, string>,
    context: InventoryActorContext,
    workerClaim: string,
    attempt: IntakeRecognitionAttemptMetric,
  ): Promise<IntakeRecognitionRun> {
    return this.connection.transaction(async (database) => {
      const row = rows(
        await database.execute(
          sql`select r.*, b.version as batch_version, b.state as batch_state from inventory_intake_recognition_run r inner join inventory_intake_batch b on b.id = r.batch_id where r.id = ${runId} and r.batch_id = ${batchId} for update`,
        ),
      )[0];
      if (!row) throw new Error("INTAKE_RECOGNITION_NOT_FOUND");
      // A lease can expire while the original handler is still finishing.
      // Once another delivery has completed the run, late work must be a
      // read-only no-op so it cannot duplicate recognition artifacts.
      if (
        row.state !== "running" ||
        !row.provenance ||
        typeof row.provenance !== "object" ||
        (row.provenance as { workerClaim?: unknown }).workerClaim !==
          workerClaim
      )
        return runFromRow(row);
      const priorAttempts =
        (row.provenance as { attempts?: IntakeRecognitionAttemptMetric[] })
          .attempts ?? [];
      const completedProvenance = {
        ...provenance,
        attempts: [...priorAttempts, attempt].slice(-20),
      };
      if (row.photo_id && row.candidate_id)
        return this.applyTargeted(
          database,
          row,
          decisions,
          completedProvenance,
          sourceChecksums,
        );
      if (
        row.batch_state === "committed" ||
        Number(row.input_version) !== Number(row.batch_version)
      ) {
        await database.execute(
          sql`update inventory_intake_recognition_run set state = 'stale', error_code = 'stale_input', provenance = ${JSON.stringify(completedProvenance)}::jsonb, updated_at = now() where id = ${runId}`,
        );
        return runFromRow({
          ...row,
          state: "stale",
          error_code: "stale_input",
        });
      }
      const currentPhotos = rows(
        await database.execute(
          sql`select p.id as photo_id, p.file_id, f.sha256 from inventory_intake_photo p inner join file_attachment f on f.id = p.file_id where p.batch_id = ${batchId} and p.disposition <> 'excluded' order by p.photo_order`,
        ),
      );
      const currentFingerprint = inputFingerprint(
        Number(row.input_version),
        currentPhotos,
      );
      const stale =
        currentFingerprint !== String(row.input_fingerprint) ||
        currentPhotos.length !== Object.keys(sourceChecksums).length ||
        currentPhotos.some(
          (photo) =>
            sourceChecksums[String(photo.photo_id)] !== String(photo.sha256),
        );
      if (stale) {
        await database.execute(
          sql`update inventory_intake_recognition_run set state = 'stale', error_code = 'stale_input', provenance = ${JSON.stringify(completedProvenance)}::jsonb, updated_at = now() where id = ${runId}`,
        );
        return runFromRow({
          ...row,
          state: "stale",
          error_code: "stale_input",
        });
      }
      let allAccepted = decisions.length > 0;
      let appliedAny = false;
      const currentPhotoIds = new Set(
        currentPhotos.map((photo) => String(photo.photo_id)),
      );
      const pendingRecaptures = rows(
        await database.execute(
          sql`select id, run_id, photo_ids from inventory_intake_recapture where batch_id = ${batchId} and state = 'evidence_received'`,
        ),
      );
      for (const recapture of pendingRecaptures) {
        const originPhotoRows = rows(
          await database.execute(
            sql`select gp.photo_id from inventory_intake_recognition_group_photo gp inner join inventory_intake_recognition_group g on g.id = gp.group_id where g.run_id = ${recapture.run_id}`,
          ),
        );
        const originPhotoIds = new Set(
          originPhotoRows.map((photo) => String(photo.photo_id)),
        );
        const addressed = (recapture.photo_ids as unknown[]).some(
          (photoId) =>
            currentPhotoIds.has(String(photoId)) &&
            !originPhotoIds.has(String(photoId)),
        );
        if (addressed)
          await database.execute(
            sql`update inventory_intake_recapture set state = 'resolved', resolved_by_user_id = ${context.actorUserId === "system" ? null : context.actorUserId}, updated_at = now() where id = ${recapture.id} and batch_id = ${batchId} and state = 'evidence_received'`,
          );
      }
      const validPhotoRows = rows(
        await database.execute(
          sql`select id from inventory_intake_photo where batch_id = ${batchId}`,
        ),
      );
      const validPhotoIds = new Set(
        validPhotoRows.map((photo) => String(photo.id)),
      );
      const persistedDecisions: IntakeGroupDecision[] = [];
      for (const decision of decisions) {
        const identity = new Map(
          decision.fields
            .filter((field) => field.accepted)
            .map((field) => [field.field, field.value]),
        );
        const acceptedPhotoIds = decision.photoIds.filter((photoId) =>
          validPhotoIds.has(photoId),
        );
        const currentDecisionPhotos = acceptedPhotoIds.length
          ? rows(
              await database.execute(
                sql`select id, candidate_id, disposition from inventory_intake_photo where batch_id = ${batchId} and id in (${sql.join(
                  acceptedPhotoIds.map((photoId) => sql`${photoId}`),
                  sql`, `,
                )})`,
              ),
            )
          : [];
        const assignedCandidateIds = new Set(
          currentDecisionPhotos
            .map((photo) =>
              photo.candidate_id === null || photo.candidate_id === undefined
                ? null
                : String(photo.candidate_id),
            )
            .filter(
              (candidateId): candidateId is string => candidateId !== null,
            ),
        );
        const candidateId =
          assignedCandidateIds.size === 1 &&
          acceptedPhotoIds.length === decision.photoIds.length &&
          currentDecisionPhotos.length === acceptedPhotoIds.length &&
          currentDecisionPhotos.every(
            (photo) => photo.disposition === "assigned" && photo.candidate_id,
          )
            ? [...assignedCandidateIds][0]
            : undefined;
        const preservedCandidate = candidateId
          ? rows(
              await database.execute(
                sql`select id from inventory_intake_candidate where id = ${candidateId} and batch_id = ${batchId} and confirmation_source = 'recognition'`,
              ),
            )[0]
          : undefined;
        const preservedCandidateId = preservedCandidate
          ? String(preservedCandidate.id)
          : undefined;
        const workerChangedPhotos =
          acceptedPhotoIds.length !== decision.photoIds.length ||
          currentDecisionPhotos.length !== acceptedPhotoIds.length ||
          (currentDecisionPhotos.some(
            (photo) =>
              (photo.candidate_id !== null &&
                photo.candidate_id !== undefined) ||
              photo.disposition !== "unassigned",
          ) &&
            !preservedCandidateId);
        const persistedDecision = workerChangedPhotos
          ? {
              ...decision,
              accepted: false,
              fields: decision.fields.map((field) => ({
                ...field,
                accepted: false,
              })),
              reasons: [
                ...new Set([...decision.reasons, "stale_input" as const]),
              ],
            }
          : decision;
        const groupId = randomUUID();
        await database.execute(
          sql`insert into inventory_intake_recognition_group (id, run_id, group_key, accepted, reasons) values (${groupId}, ${runId}, ${persistedDecision.key}, ${persistedDecision.accepted}, ${JSON.stringify(persistedDecision.reasons)}::jsonb)`,
        );
        for (const photoId of persistedDecision.photoIds)
          if (validPhotoIds.has(photoId))
            await database.execute(
              sql`insert into inventory_intake_recognition_group_photo (group_id, photo_id) values (${groupId}, ${photoId})`,
            );
        for (const field of persistedDecision.fields)
          await database.execute(
            sql`insert into inventory_intake_recognition_field (id, group_id, field, value, accepted, reason, photo_id, evidence_box, verification) values (${randomUUID()}, ${groupId}, ${field.field}, ${field.value}, ${field.accepted}, ${field.reason}, ${validPhotoIds.has(field.photoId ?? "") ? field.photoId : null}, ${field.box ? JSON.stringify(field.box) : null}::jsonb, ${JSON.stringify(field.verification ?? { verifierAgreement: field.verifierAgreement })}::jsonb)`,
          );
        const effectiveAccepted =
          persistedDecision.accepted &&
          !workerChangedPhotos &&
          identity.size > 0;
        if (!effectiveAccepted) allAccepted = false;
        persistedDecisions.push(persistedDecision);
        if (effectiveAccepted && identity.size > 0) {
          if (preservedCandidateId) continue;
          const values = identity;
          const candidateId = randomUUID();
          await database.execute(
            sql`insert into inventory_intake_candidate (id, batch_id, state, machine_type, manufacturer, model, serial, voltage, phase, fuel, capacity_lb, confirmation_source) values (${candidateId}, ${batchId}, 'confirmed', ${values.get("machineType")}, ${values.get("manufacturer")}, ${values.get("model")}, ${values.get("serial")}, ${values.get("voltage")}, ${values.get("phase")}, ${values.get("fuel")}, ${values.get("capacityLb") ? Number(values.get("capacityLb")) : null}, 'recognition')`,
          );
          if (acceptedPhotoIds.length) {
            await database.execute(
              sql`update inventory_intake_photo set candidate_id = ${candidateId}, disposition = 'assigned' where batch_id = ${batchId} and candidate_id is null and id in (${sql.join(
                acceptedPhotoIds.map((photoId) => sql`${photoId}`),
                sql`, `,
              )}) and candidate_id is null`,
            );
            appliedAny = true;
          }
        } else {
          const reason = workerChangedPhotos
            ? "stale_input"
            : (decision.reasons[0] ?? "missing_critical_fact");
          const recaptureField =
            decision.fields.find(
              (field) => !field.accepted && field.reason === reason,
            )?.field ?? null;
          await database.execute(
            sql`insert into inventory_intake_recapture (id, run_id, batch_id, photo_ids, field, reason, instruction) values (${randomUUID()}, ${runId}, ${batchId}, ${JSON.stringify(persistedDecision.photoIds)}::jsonb, ${recaptureField}, ${reason}, ${this.instruction(reason)})`,
          );
        }
      }
      const state = allAccepted ? "ready" : "needs_recapture";
      const nextVersion = appliedAny
        ? Number(row.batch_version) + 1
        : Number(row.batch_version);
      if (nextVersion !== Number(row.batch_version))
        await database.execute(
          sql`update inventory_intake_batch set version = version + 1, updated_at = now() where id = ${batchId} and version = ${row.batch_version}`,
        );
      const updated = rows(
        await database.execute(
          sql`update inventory_intake_recognition_run set state = ${state}, error_code = null, groups = ${JSON.stringify(persistedDecisions)}::jsonb, provenance = ${JSON.stringify(completedProvenance)}::jsonb, updated_at = now() where id = ${runId} returning *`,
        ),
      )[0]!;
      await this.recorder.record(database, {
        actorKind: "system",
        action: "inventory.intake.recognition.completed",
        targetType: "intake_recognition_run",
        targetId: runId,
        requestId: `recognition:${runId}`,
        summary: { changedFields: ["recognition_run"], outcome: state },
      });
      return runFromRow(updated);
    });
  }

  private async applyTargeted(
    database: DatabaseExecutor,
    row: Row,
    decisions: IntakeGroupDecision[],
    provenance: Record<string, unknown>,
    sourceChecksums: Record<string, string>,
  ): Promise<IntakeRecognitionRun> {
    const target = rows(
      await database.execute(sql`
        select r.*, b.state as batch_state, b.version as batch_version,
               c.version as current_candidate_revision,
               c.batch_id as candidate_batch_id,
               f.sha256 as current_checksum
        from inventory_intake_recognition_run r
        inner join inventory_intake_batch b on b.id = r.batch_id
        inner join inventory_intake_candidate c on c.id = r.candidate_id
        inner join inventory_intake_photo p on p.id = r.photo_id
        inner join file_attachment f on f.id = p.file_id
        where r.id = ${String(row.id)} and p.candidate_id = r.candidate_id
          and p.batch_id = r.batch_id and c.batch_id = r.batch_id
        for update
      `),
    )[0];
    if (!target || target.batch_state === "committed")
      throw new Error("INTAKE_RECOGNITION_NOT_FOUND");
    const targetPhotoId = String(target.photo_id);
    const targetCandidateId = String(target.candidate_id);
    const expectedChecksum = sourceChecksums[targetPhotoId];
    if (
      Number(target.current_candidate_revision) !==
        Number(target.candidate_revision) ||
      !expectedChecksum ||
      expectedChecksum !== String(target.current_checksum)
    ) {
      const stale = rows(
        await database.execute(
          sql`update inventory_intake_recognition_run set state = 'stale', error_code = 'stale_input', provenance = ${JSON.stringify(provenance)}::jsonb, updated_at = now() where id = ${row.id} returning *`,
        ),
      )[0]!;
      return runFromRow(stale);
    }
    const decision =
      decisions.find((item) => item.photoIds.includes(targetPhotoId)) ??
      decisions[0];
    const identity = new Map(
      (decision?.fields ?? [])
        .filter((field) => field.accepted && field.field !== "machineType")
        .map((field) => [field.field, field.value]),
    );
    const accepted = Boolean(decision?.accepted && identity.size > 0);
    const persistedDecision = decision ?? {
      key: `photo-${targetPhotoId}`,
      photoIds: [targetPhotoId],
      accepted: false,
      reasons: ["missing_critical_fact" as const],
      fields: [],
    };
    const failureReason =
      persistedDecision.reasons[0] ?? "missing_critical_fact";
    const groupId = randomUUID();
    await database.execute(
      sql`insert into inventory_intake_recognition_group (id, run_id, group_key, accepted, reasons) values (${groupId}, ${row.id}, ${persistedDecision.key}, ${persistedDecision.accepted}, ${JSON.stringify(persistedDecision.reasons)}::jsonb)`,
    );
    for (const photoId of persistedDecision.photoIds)
      if (photoId === targetPhotoId)
        await database.execute(
          sql`insert into inventory_intake_recognition_group_photo (group_id, photo_id) values (${groupId}, ${photoId})`,
        );
    for (const field of persistedDecision.fields)
      await database.execute(
        sql`insert into inventory_intake_recognition_field (id, group_id, field, value, accepted, reason, photo_id, evidence_box, verification) values (${randomUUID()}, ${groupId}, ${field.field}, ${field.value}, ${field.accepted}, ${field.reason}, ${field.photoId === targetPhotoId ? targetPhotoId : null}, ${field.box ? JSON.stringify(field.box) : null}::jsonb, ${JSON.stringify(field.verification ?? { verifierAgreement: field.verifierAgreement })}::jsonb)`,
      );
    if (accepted) {
      const value = (
        field:
          "manufacturer" | "model" | "serial" | "voltage" | "phase" | "fuel",
      ) => identity.get(field) ?? null;
      // A worker-confirmed capacity is authoritative for this Candidate. A
      // targeted recognition retry may fill an unknown value, but must not
      // replace a value the worker already selected (including a later
      // recapture with a conflicting reading).
      const recognizedCapacity = identity.get("capacityLb");
      const capacityLb = recognizedCapacity ? Number(recognizedCapacity) : null;
      await database.execute(
        sql`update inventory_intake_candidate set manufacturer = ${value("manufacturer")}, model = ${value("model")}, serial = ${value("serial")}, voltage = ${value("voltage")}, phase = ${value("phase")}, fuel = ${value("fuel")}, capacity_lb = coalesce(capacity_lb, ${capacityLb}), confirmation_source = 'recognition', state = 'confirmed', version = version + 1, updated_at = now() where id = ${targetCandidateId} and version = ${target.candidate_revision}`,
      );
      const candidateUpdated = rows(
        await database.execute(
          sql`select id from inventory_intake_candidate where id = ${targetCandidateId} and version = ${Number(target.candidate_revision) + 1}`,
        ),
      );
      if (!candidateUpdated.length)
        throw new Error("INTAKE_CANDIDATE_REVISION_CONFLICT");
    }
    await database.execute(
      sql`update inventory_intake_batch set version = version + 1, updated_at = now() where id = ${row.batch_id} and state = 'open'`,
    );
    const updated = rows(
      await database.execute(
        sql`update inventory_intake_recognition_run set state = ${accepted ? "ready" : "failed"}, error_code = ${accepted ? null : failureReason}, groups = ${JSON.stringify([persistedDecision])}::jsonb, provenance = ${JSON.stringify(provenance)}::jsonb, updated_at = now() where id = ${row.id} returning *`,
      ),
    )[0]!;
    await this.recorder.record(database, {
      actorKind: "system",
      action: "inventory.intake.recognition.completed",
      targetType: "intake_recognition_run",
      targetId: String(row.id),
      requestId: `recognition:${String(row.id)}`,
      summary: {
        changedFields: ["recognition_run", "candidate_facts"],
        outcome: accepted ? "ready" : "failed",
      },
    });
    return runFromRow(updated);
  }

  async fail(
    runId: string,
    code: string,
    workerClaim: string,
    attempt: IntakeRecognitionAttemptMetric,
  ): Promise<void> {
    await this.connection.database.execute(
      sql`update inventory_intake_recognition_run set state = 'failed', error_code = ${code}, provenance = jsonb_set(provenance, '{attempts}', coalesce(provenance->'attempts', '[]'::jsonb) || ${JSON.stringify(attempt)}::jsonb), updated_at = now() where id = ${runId} and state = 'running' and provenance->>'workerClaim' = ${workerClaim}`,
    );
  }

  async requeue(
    runId: string,
    code: string,
    workerClaim: string,
    attempt: IntakeRecognitionAttemptMetric,
  ): Promise<void> {
    await this.connection.database.execute(
      sql`update inventory_intake_recognition_run set state = 'queued', error_code = ${code}, provenance = jsonb_set(provenance, '{attempts}', coalesce(provenance->'attempts', '[]'::jsonb) || ${JSON.stringify(attempt)}::jsonb), updated_at = now() where id = ${runId} and state = 'running' and provenance->>'workerClaim' = ${workerClaim}`,
    );
  }
  async resolveRecapture(
    recaptureId: string,
    batchId: string,
    fileId: string,
    userId: string,
  ): Promise<void> {
    const result = await this.connection.database.execute(
      sql`update inventory_intake_recapture set state = 'evidence_received', photo_ids = case when photo_ids @> ${JSON.stringify([fileId])}::jsonb then photo_ids else photo_ids || ${JSON.stringify([fileId])}::jsonb end, updated_at = now() where id = ${recaptureId} and batch_id = ${batchId} and state in ('open', 'evidence_received', 'resolved') returning id`,
    );
    if (!rows(result).length) throw new Error("INTAKE_RECAPTURE_NOT_FOUND");
    void userId;
  }
  private instruction(reason: string): string {
    const labels: Record<string, string> = {
      exact_identity_match:
        "Duplicate identity detected. Check the visible facts against the existing Machine; do not create a duplicate.",
      blur: "Retake the nameplate in focus with the full plate visible.",
      glare: "Retake without glare; change the angle or diffuse the light.",
      cutoff: "Retake with the entire nameplate inside the frame.",
      small_text: "Move closer so the nameplate text is readable.",
      unreadable: "Retake a sharp, well-lit close-up of the nameplate.",
      ocr_disagreement: "Retake a sharp close-up showing the disputed field.",
      ambiguous_grouping:
        "Retake the current nameplate photo with the full plate clearly framed.",
      conflicting_evidence: "Retake the conflicting nameplate views.",
      missing_critical_fact:
        "Retake the nameplate with all identifying facts visible.",
      ambiguous_characters:
        "Retake a sharp close-up so the model or serial characters are unambiguous.",
      invalid_identity_value:
        "Retake the nameplate showing the actual manufacturer, model, and serial fields.",
      missing_evidence:
        "Retake the nameplate with the proposed identity text clearly visible.",
      invalid_evidence_reference:
        "Retake the nameplate so the identity text and its location are clear.",
      stale_input:
        "The Intake changed while recognition was running. Review the current nameplate photo, then capture a new identifying view if needed.",
    };
    return labels[reason] ?? "Retake a clear, well-lit nameplate photo.";
  }
  private async reserve(
    database: DatabaseExecutor,
    scope: string,
    input: unknown,
    context: InventoryActorContext,
  ): Promise<{ recordId?: string; existingTargetId?: string }> {
    if (!context.idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const result = await this.idempotency.reserve(database, {
      scope,
      actorUserId: context.actorUserId,
      rawKey: context.idempotencyKey,
      requestFingerprint: requestFingerprint(input),
    });
    if (result.status === "fingerprint_conflict")
      throw new Error("IDEMPOTENCY_KEY_REUSED");
    if (result.status === "in_progress")
      throw new Error("IDEMPOTENCY_IN_PROGRESS");
    return result.status === "reserved"
      ? { recordId: result.recordId }
      : { existingTargetId: result.targetId };
  }
}
