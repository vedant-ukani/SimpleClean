import { Inject, Injectable } from "@nestjs/common";
import type {
  IntakeBatch,
  IntakeBatchDetail,
  IntakeCandidate,
  IntakePhoto,
  IntakeWarningKind,
  Machine,
  EquipmentClass,
  IntakeGroupDecision,
  ResolveCatalogModelRequest,
} from "@laundrorama/contracts";
import {
  EquipmentClassSchema,
  machineTypeForEquipmentClass,
} from "@laundrorama/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@laundrorama/database";
import { sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import { DATABASE_CONNECTION } from "../../../platform/database.module.js";
import {
  IDEMPOTENCY_COORDINATOR,
  MUTATION_RECORDER,
  requestFingerprint,
  type IdempotencyCoordinator,
  type MutationRecorder,
} from "../../operations/operations.ports.js";
import type { InventoryActorContext } from "../inventory.repository.js";
import { InventoryRepository } from "../inventory.repository.js";
import {
  FILES_OPERATIONS,
  type FilesOperations,
} from "../../files/files.service.js";

type Row = Record<string, unknown>;
type RecognitionRunConfig = {
  provider: string;
  model: string;
  verifier: string;
  verifierModel: string;
  policyVersion: string;
};
function rows(value: unknown): Row[] {
  if (Array.isArray(value))
    return value.filter((row): row is Row => !!row && typeof row === "object");
  if (value && typeof value === "object" && "rows" in value)
    return rows((value as { rows: unknown }).rows);
  return [];
}
function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}
function nullable(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function batch(row: Row): IntakeBatch {
  return {
    id: String(row.id),
    loadId: String(row.load_id),
    state: row.state as IntakeBatch["state"],
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
function candidate(
  row: Row,
  warnings: IntakeCandidate["warnings"] = [],
): IntakeCandidate {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    state: row.state as IntakeCandidate["state"],
    machineType: (row.machine_type ?? null) as IntakeCandidate["machineType"],
    equipmentClass: (row.equipment_class ??
      null) as IntakeCandidate["equipmentClass"],
    manufacturer: nullable(row.manufacturer),
    model: nullable(row.model),
    serial: nullable(row.serial),
    voltage: nullable(row.voltage),
    phase: (row.phase ?? null) as IntakeCandidate["phase"],
    fuel: (row.fuel ?? null) as IntakeCandidate["fuel"],
    capacityLb:
      row.capacity_lb === null || row.capacity_lb === undefined
        ? null
        : Number(row.capacity_lb),
    confirmationSource: (row.confirmation_source ??
      "manual") as IntakeCandidate["confirmationSource"],
    revision: Number(row.version ?? 1),
    machineTypeSelectedByUserId: nullable(row.machine_type_selected_by_user_id),
    machineTypeSelectedAt: row.machine_type_selected_at
      ? iso(row.machine_type_selected_at)
      : null,
    equipmentClassSelectedByUserId: nullable(
      row.equipment_class_selected_by_user_id,
    ),
    equipmentClassSelectedAt: row.equipment_class_selected_at
      ? iso(row.equipment_class_selected_at)
      : null,
    warnings,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
function photo(row: Row): IntakePhoto {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    fileId: String(row.file_id),
    order: Number(row.photo_order),
    disposition: row.disposition as IntakePhoto["disposition"],
    candidateId: nullable(row.candidate_id),
    filename: String(row.original_filename),
    mediaType: row.detected_media_type as IntakePhoto["mediaType"],
    state: row.file_state as IntakePhoto["state"],
    previewAvailable:
      row.preview_storage_key !== null && row.preview_storage_key !== undefined,
    createdAt: iso(row.created_at),
  };
}

@Injectable()
export class IntakeRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    @Inject(MUTATION_RECORDER) private readonly recorder: MutationRecorder,
    @Inject(IDEMPOTENCY_COORDINATOR)
    private readonly idempotency: IdempotencyCoordinator,
    @Inject(InventoryRepository)
    private readonly inventory: InventoryRepository,
    @Inject(FILES_OPERATIONS)
    private readonly files: FilesOperations,
  ) {}

  async readyCandidateIdentityForRecognition(
    runId: string,
  ): Promise<ResolveCatalogModelRequest | undefined> {
    const row = rows(
      await this.connection.database.execute(sql`
        select c.manufacturer, c.model, c.serial
        from inventory_intake_recognition_run r
        join inventory_intake_candidate c on c.id=r.candidate_id
        where r.id=${runId} and r.state='ready' and c.state='confirmed'
          and r.candidate_revision + 1 = c.version
          and r.id=(
            select newest.id from inventory_intake_recognition_run newest
            where newest.candidate_id=c.id
            order by newest.created_at desc, newest.id desc limit 1
          )
      `),
    )[0];
    if (!row?.manufacturer || !row.model) return undefined;
    return {
      manufacturer: String(row.manufacturer),
      model: String(row.model),
      serial: nullable(row.serial),
    };
  }

  async create(
    loadId: string,
    context: InventoryActorContext,
  ): Promise<IntakeBatch> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.batch.create",
        { loadId },
        context,
      );
      if (reservation.existingTargetId) {
        const found = await this.findWith(
          database,
          reservation.existingTargetId,
        );
        if (!found) throw new Error("Idempotent Intake target unavailable");
        return found;
      }
      const load = await this.inventory.lockLoadForIntake(database, loadId);
      if (!load) {
        await this.idempotency.release(database, {
          recordId: reservation.recordId!,
        });
        throw new Error("INTAKE_LOAD_NOT_FOUND");
      }
      if (load.receivedAt) throw new Error("INTAKE_LOAD_RECEIVED");
      const id = randomUUID();
      const result = await database.execute(
        sql`insert into inventory_intake_batch (id, load_id, created_by_user_id) values (${id}, ${loadId}, ${context.actorUserId}) returning *`,
      );
      await this.record(
        database,
        "inventory.intake.batch.created",
        id,
        context,
        ["load_id"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: id,
      });
      return batch(rows(result)[0]!);
    });
  }

  async find(id: string): Promise<IntakeBatchDetail | undefined> {
    return this.connection.database
      ? this.detail(this.connection.database, id)
      : undefined;
  }

  async committedMachines(batchId: string): Promise<Machine[] | undefined> {
    const base = rows(
      await this.connection.database.execute(
        sql`select state from inventory_intake_batch where id = ${batchId}`,
      ),
    )[0];
    if (!base) return undefined;
    if (base.state !== "committed")
      throw new Error("INTAKE_BATCH_NOT_COMMITTED");
    const mappings = rows(
      await this.connection.database.execute(
        sql`select machine_id from inventory_intake_machine_mapping where batch_id = ${batchId} order by created_at, candidate_id`,
      ),
    );
    const machines: Machine[] = [];
    for (const mapping of mappings) {
      const machine = await this.inventory.findMachine(
        String(mapping.machine_id),
      );
      if (!machine) throw new Error("INTAKE_MACHINE_NOT_FOUND");
      machines.push(machine);
    }
    return machines;
  }

  async linkPhoto(
    batchId: string,
    fileId: string,
    order: number | undefined,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.photo.link",
        { batchId, fileId, order, expectedVersion },
        context,
      );
      if (reservation.existingTargetId) {
        const existing = await this.detail(database, batchId);
        if (!existing) throw new Error("INTAKE_BATCH_NOT_FOUND");
        return existing;
      }
      const current = await this.lockBatch(database, batchId, expectedVersion);
      if (!current) throw new Error("INTAKE_VERSION_CONFLICT");
      const batchLoad = current.loadId;
      const valid = await this.files.findIntakeEvidence(
        database,
        [fileId],
        batchLoad,
      );
      if (!valid.length || valid[0]?.state !== "ready")
        throw new Error("INTAKE_FILE_INVALID");
      const existing = await database.execute(
        sql`select id from inventory_intake_photo where file_id = ${fileId}`,
      );
      if (rows(existing).length) throw new Error("INTAKE_FILE_ALREADY_LINKED");
      const nextOrder =
        order ??
        Number(
          rows(
            await database.execute(
              sql`select coalesce(max(photo_order), -1) as max from inventory_intake_photo where batch_id = ${batchId}`,
            ),
          )[0]?.max ?? -1,
        ) + 1;
      if (nextOrder < 0 || nextOrder > 99)
        throw new Error("INTAKE_PHOTO_LIMIT");
      await database.execute(
        sql`insert into inventory_intake_photo (id, batch_id, file_id, photo_order) values (${randomUUID()}, ${batchId}, ${fileId}, ${nextOrder})`,
      );
      await this.bumpBatch(database, batchId, expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        batchId,
        context,
        ["photos"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: batchId,
      });
      return (await this.detail(database, batchId))!;
    });
  }

  async prepareItem(
    batchId: string,
    fileId: string,
    expectedVersion: number,
    context: InventoryActorContext,
    config: RecognitionRunConfig,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.item.prepare",
        { batchId, fileId, expectedVersion },
        context,
      );
      if (reservation.existingTargetId) {
        const existing = await this.detail(database, batchId);
        if (!existing) throw new Error("INTAKE_BATCH_NOT_FOUND");
        return existing;
      }
      const current = await this.lockBatch(database, batchId, expectedVersion);
      if (!current) throw new Error("INTAKE_VERSION_CONFLICT");
      const valid = await this.files.findIntakeEvidence(
        database,
        [fileId],
        current.loadId,
      );
      if (!valid.length || valid[0]?.state !== "ready")
        throw new Error("INTAKE_FILE_INVALID");
      const existingFile = await database.execute(
        sql`select id from inventory_intake_photo where file_id = ${fileId}`,
      );
      if (rows(existingFile).length)
        throw new Error("INTAKE_FILE_ALREADY_LINKED");
      const nextOrder =
        Number(
          rows(
            await database.execute(
              sql`select coalesce(max(photo_order), -1) as max from inventory_intake_photo where batch_id = ${batchId}`,
            ),
          )[0]?.max ?? -1,
        ) + 1;
      if (nextOrder > 99) throw new Error("INTAKE_PHOTO_LIMIT");
      const photoId = randomUUID();
      const candidateId = randomUUID();
      const checksum = valid[0]?.sha256 ?? "";
      const revision = 1;
      const fingerprint = createHash("sha256")
        .update(
          `${fileId}|${checksum}|${candidateId}|${revision}|${config.provider}|${config.model}|${config.verifier}|${config.verifierModel}|${config.policyVersion}`,
        )
        .digest("hex");
      const runId = randomUUID();
      await database.execute(
        sql`insert into inventory_intake_candidate (id, batch_id, version) values (${candidateId}, ${batchId}, ${revision})`,
      );
      await database.execute(
        sql`insert into inventory_intake_photo (id, batch_id, file_id, photo_order, disposition, candidate_id) values (${photoId}, ${batchId}, ${fileId}, ${nextOrder}, 'assigned', ${candidateId})`,
      );
      const provenance = {
        provider: config.provider,
        model: config.model,
        schemaVersion: "intake-nameplate-v2",
        verifier: config.verifier,
        verifierModel: config.verifierModel,
        policyVersion: config.policyVersion,
        inputFingerprint: fingerprint,
        sourceChecksums: { [photoId]: checksum },
      };
      await database.execute(
        sql`insert into inventory_intake_recognition_run (id, batch_id, photo_id, candidate_id, candidate_revision, input_version, input_fingerprint, provider, model, verifier, verifier_model, schema_version, policy_version, provenance) values (${runId}, ${batchId}, ${photoId}, ${candidateId}, ${revision}, ${expectedVersion}, ${fingerprint}, ${config.provider}, ${config.model}, ${config.verifier}, ${config.verifierModel}, 'intake-nameplate-v2', ${config.policyVersion}, ${JSON.stringify(provenance)}::jsonb)`,
      );
      await this.bumpBatch(database, batchId, expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        batchId,
        context,
        ["photos", "candidate", "recognition_run"],
      );
      await this.recorder.record(database, {
        actorKind: "user",
        actorUserId: context.actorUserId,
        action: "inventory.intake.recognition.requested",
        targetType: "intake_recognition_run",
        targetId: runId,
        requestId: context.requestId,
        summary: { changedFields: ["recognition_run"], outcome: "queued" },
      });
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_recognition_run",
        targetId: runId,
      });
      return (await this.detail(database, batchId))!;
    });
  }

  async changeCandidateType(
    batchId: string,
    candidateId: string,
    equipmentClass: EquipmentClass,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.candidate.type",
        { batchId, candidateId, equipmentClass, expectedVersion },
        context,
      );
      const row = rows(
        await database.execute(
          sql`select c.*, b.version as batch_version, b.state as batch_state from inventory_intake_candidate c inner join inventory_intake_batch b on b.id = c.batch_id where c.id = ${candidateId} and c.batch_id = ${batchId} for update`,
        ),
      )[0];
      if (!row || row.batch_state !== "open")
        throw new Error("INTAKE_CANDIDATE_NOT_FOUND");
      if (String(row.state) === "committed")
        throw new Error("INTAKE_CANDIDATE_COMMITTED");
      if (reservation.existingTargetId)
        return (await this.detail(database, batchId))!;
      if (Number(row.batch_version) !== expectedVersion)
        throw new Error("INTAKE_VERSION_CONFLICT");
      const nextState = row.state === "confirmed" ? "confirmed" : "draft";
      const machineType = machineTypeForEquipmentClass(equipmentClass);
      await database.execute(
        sql`update inventory_intake_candidate set equipment_class = ${equipmentClass}, equipment_class_selected_by_user_id = ${context.actorUserId}, equipment_class_selected_at = now(), machine_type = ${machineType}, machine_type_selected_by_user_id = ${context.actorUserId}, machine_type_selected_at = now(), version = version + 1, state = ${nextState}, updated_at = now() where id = ${candidateId}`,
      );
      await this.bumpBatch(database, batchId, expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        batchId,
        context,
        ["equipment_class", "machine_type"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: batchId,
      });
      return (await this.detail(database, batchId))!;
    });
  }

  async changeCandidateCapacity(
    batchId: string,
    candidateId: string,
    capacityLb: number | null,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.candidate.capacity",
        { batchId, candidateId, capacityLb, expectedVersion },
        context,
      );
      const row = rows(
        await database.execute(
          sql`select c.*, b.version as batch_version, b.state as batch_state from inventory_intake_candidate c inner join inventory_intake_batch b on b.id = c.batch_id where c.id = ${candidateId} and c.batch_id = ${batchId} for update`,
        ),
      )[0];
      if (!row || row.batch_state !== "open")
        throw new Error("INTAKE_CANDIDATE_NOT_FOUND");
      if (String(row.state) === "committed")
        throw new Error("INTAKE_CANDIDATE_COMMITTED");
      if (reservation.existingTargetId)
        return (await this.detail(database, batchId))!;
      if (Number(row.batch_version) !== expectedVersion)
        throw new Error("INTAKE_VERSION_CONFLICT");
      await database.execute(
        sql`update inventory_intake_candidate set capacity_lb = ${capacityLb}, version = version + 1, updated_at = now() where id = ${candidateId}`,
      );
      await this.bumpBatch(database, batchId, expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        batchId,
        context,
        ["capacity_lb"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: batchId,
      });
      return (await this.detail(database, batchId))!;
    });
  }

  async createCandidate(
    batchId: string,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.candidate.create",
        { batchId, expectedVersion },
        context,
      );
      if (reservation.existingTargetId) {
        const existing = await this.detail(database, batchId);
        if (!existing) throw new Error("INTAKE_BATCH_NOT_FOUND");
        return existing;
      }
      await this.assertOpen(database, batchId, expectedVersion);
      await database.execute(
        sql`insert into inventory_intake_candidate (id, batch_id) values (${randomUUID()}, ${batchId})`,
      );
      await this.bumpBatch(database, batchId, expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        batchId,
        context,
        ["candidates"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: batchId,
      });
      return (await this.detail(database, batchId))!;
    });
  }

  async updateCandidate(
    batchId: string,
    candidateId: string,
    input: Record<string, unknown>,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.candidate.update",
        { candidateId, input, expectedVersion },
        context,
      );
      const current = rows(
        await database.execute(
          sql`select c.*, b.state as batch_state, b.version as batch_version, b.id as batch_id from inventory_intake_candidate c inner join inventory_intake_batch b on b.id = c.batch_id where c.id = ${candidateId} and b.id = ${batchId} for update`,
        ),
      )[0];
      if (!current || current.batch_state === "committed")
        throw new Error("INTAKE_CANDIDATE_NOT_FOUND");
      if (reservation.existingTargetId) {
        const existing = await this.detail(database, String(current.batch_id));
        if (!existing) throw new Error("INTAKE_BATCH_NOT_FOUND");
        return existing;
      }
      if (Number(current.batch_version) !== expectedVersion)
        throw new Error("INTAKE_VERSION_CONFLICT");
      const columns: Record<string, string> = {
        manufacturer: "manufacturer",
        model: "model",
        serial: "serial",
        voltage: "voltage",
        phase: "phase",
        fuel: "fuel",
        capacityLb: "capacity_lb",
      };
      const value = (key: keyof typeof columns) =>
        input[key] === undefined
          ? (current[columns[key]!] ?? null)
          : input[key];
      const classSelected =
        input.equipmentClass !== undefined || input.machineType !== undefined;
      const equipmentClass = (
        input.equipmentClass !== undefined
          ? input.equipmentClass
          : input.machineType !== undefined
            ? input.machineType
            : (current.equipment_class ?? null)
      ) as EquipmentClass | null;
      const machineType = equipmentClass
        ? machineTypeForEquipmentClass(equipmentClass)
        : (input.machineType ?? current.machine_type ?? null);
      const selectedBy = classSelected
        ? context.actorUserId
        : (current.equipment_class_selected_by_user_id ?? null);
      await database.execute(
        sql`update inventory_intake_candidate set machine_type = ${machineType}, equipment_class = ${equipmentClass}, equipment_class_selected_by_user_id = ${selectedBy}, equipment_class_selected_at = case when ${classSelected} then now() else equipment_class_selected_at end, machine_type_selected_by_user_id = case when ${classSelected} then ${context.actorUserId} else machine_type_selected_by_user_id end, machine_type_selected_at = case when ${classSelected} then now() else machine_type_selected_at end, manufacturer = ${value("manufacturer")}, model = ${value("model")}, serial = ${value("serial")}, voltage = ${value("voltage")}, phase = ${value("phase")}, fuel = ${value("fuel")}, capacity_lb = ${value("capacityLb")}, state = 'draft', version = version + 1, updated_at = now() where id = ${candidateId}`,
      );
      await database.execute(
        sql`delete from inventory_intake_warning_ack where candidate_id = ${candidateId}`,
      );
      await this.bumpBatch(database, String(current.batch_id), expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        String(current.batch_id),
        context,
        ["candidate_facts"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: String(current.batch_id),
      });
      return (await this.detail(database, String(current.batch_id)))!;
    });
  }

  async assignPhoto(
    batchId: string,
    photoId: string,
    candidateId: string | null,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.photo.assign",
        { batchId, photoId, candidateId, expectedVersion },
        context,
      );
      if (reservation.existingTargetId) {
        const existing = await this.detail(database, batchId);
        if (!existing) throw new Error("INTAKE_BATCH_NOT_FOUND");
        return existing;
      }
      await this.assertOpen(database, batchId, expectedVersion);
      if (candidateId) {
        const candidateRow = await database.execute(
          sql`select id from inventory_intake_candidate where id = ${candidateId} and batch_id = ${batchId}`,
        );
        if (!rows(candidateRow).length)
          throw new Error("INTAKE_CANDIDATE_NOT_FOUND");
      }
      const previous = rows(
        await database.execute(
          sql`select candidate_id from inventory_intake_photo where id = ${photoId} and batch_id = ${batchId}`,
        ),
      )[0];
      const updated = await database.execute(
        sql`update inventory_intake_photo set candidate_id = ${candidateId}, disposition = ${candidateId ? "assigned" : "unassigned"} where id = ${photoId} and batch_id = ${batchId} returning id`,
      );
      if (!rows(updated).length) throw new Error("INTAKE_PHOTO_NOT_FOUND");
      if (previous?.candidate_id)
        await database.execute(
          sql`update inventory_intake_candidate set state = 'draft', version = version + 1, updated_at = now() where id = ${previous.candidate_id}`,
        );
      if (previous?.candidate_id)
        await database.execute(
          sql`delete from inventory_intake_warning_ack where candidate_id = ${previous.candidate_id}`,
        );
      if (candidateId)
        await database.execute(
          sql`update inventory_intake_candidate set state = 'draft', version = version + 1, updated_at = now() where id = ${candidateId}`,
        );
      if (candidateId)
        await database.execute(
          sql`delete from inventory_intake_warning_ack where candidate_id = ${candidateId}`,
        );
      await this.bumpBatch(database, batchId, expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        batchId,
        context,
        ["photo_assignments"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: batchId,
      });
      return (await this.detail(database, batchId))!;
    });
  }

  async excludePhoto(
    batchId: string,
    photoId: string,
    excluded: boolean,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.photo.exclude",
        { batchId, photoId, excluded, expectedVersion },
        context,
      );
      if (reservation.existingTargetId) {
        const existing = await this.detail(database, batchId);
        if (!existing) throw new Error("INTAKE_BATCH_NOT_FOUND");
        return existing;
      }
      await this.assertOpen(database, batchId, expectedVersion);
      const previous = rows(
        await database.execute(
          sql`select candidate_id from inventory_intake_photo where id = ${photoId} and batch_id = ${batchId}`,
        ),
      )[0];
      const updated = await database.execute(
        sql`update inventory_intake_photo set candidate_id = null, disposition = ${excluded ? "excluded" : "unassigned"} where id = ${photoId} and batch_id = ${batchId} returning id`,
      );
      if (!rows(updated).length) throw new Error("INTAKE_PHOTO_NOT_FOUND");
      if (previous?.candidate_id)
        await database.execute(
          sql`update inventory_intake_candidate set state = 'draft', version = version + 1, updated_at = now() where id = ${previous.candidate_id}`,
        );
      if (previous?.candidate_id)
        await database.execute(
          sql`delete from inventory_intake_warning_ack where candidate_id = ${previous.candidate_id}`,
        );
      await this.bumpBatch(database, batchId, expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        batchId,
        context,
        ["photo_dispositions"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: batchId,
      });
      return (await this.detail(database, batchId))!;
    });
  }

  async removePhoto(
    batchId: string,
    photoId: string,
    expectedVersion: number,
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.photo.remove",
        { batchId, photoId, expectedVersion },
        context,
      );
      if (reservation.existingTargetId) {
        const existing = await this.detail(database, batchId);
        if (!existing) throw new Error("INTAKE_BATCH_NOT_FOUND");
        return existing;
      }
      await this.assertOpen(database, batchId, expectedVersion);
      const removed = await database.execute(
        sql`delete from inventory_intake_photo where id = ${photoId} and batch_id = ${batchId} returning candidate_id`,
      );
      if (!rows(removed).length) throw new Error("INTAKE_PHOTO_NOT_FOUND");
      const affected = nullable(rows(removed)[0]!.candidate_id);
      if (affected)
        await database.execute(
          sql`update inventory_intake_candidate set state = 'draft', version = version + 1, updated_at = now() where id = ${affected}`,
        );
      if (affected)
        await database.execute(
          sql`delete from inventory_intake_warning_ack where candidate_id = ${affected}`,
        );
      await this.bumpBatch(database, batchId, expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        batchId,
        context,
        ["photos"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: batchId,
      });
      return (await this.detail(database, batchId))!;
    });
  }

  async confirmCandidate(
    batchId: string,
    candidateId: string,
    expectedVersion: number,
    acknowledged: IntakeWarningKind[],
    context: InventoryActorContext,
  ): Promise<IntakeBatchDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.candidate.confirm",
        { candidateId, expectedVersion, acknowledged },
        context,
      );
      const row = rows(
        await database.execute(
          sql`select c.*, b.version as batch_version, b.state as batch_state, b.id as batch_id from inventory_intake_candidate c inner join inventory_intake_batch b on b.id = c.batch_id where c.id = ${candidateId} and b.id = ${batchId} for update`,
        ),
      )[0];
      if (!row || row.batch_state === "committed")
        throw new Error("INTAKE_CANDIDATE_NOT_FOUND");
      if (reservation.existingTargetId) {
        const existing = await this.detail(database, String(row.batch_id));
        if (!existing) throw new Error("INTAKE_BATCH_NOT_FOUND");
        return existing;
      }
      if (Number(row.batch_version) !== expectedVersion)
        throw new Error("INTAKE_VERSION_CONFLICT");
      if (!row.equipment_class || !row.equipment_class_selected_by_user_id)
        throw new Error("INTAKE_EQUIPMENT_CLASS_REQUIRED");
      const assigned = await database.execute(
        sql`select id from inventory_intake_photo where candidate_id = ${candidateId} and disposition = 'assigned'`,
      );
      if (!rows(assigned).length) throw new Error("INTAKE_PHOTO_REQUIRED");
      await database.execute(
        sql`update inventory_intake_candidate set state = 'confirmed', version = version + 1, updated_at = now() where id = ${candidateId}`,
      );
      await this.bumpBatch(database, String(row.batch_id), expectedVersion);
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        String(row.batch_id),
        context,
        ["candidate_confirmation"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: String(row.batch_id),
      });
      return (await this.detail(database, String(row.batch_id)))!;
    });
  }

  async commitCandidate(
    batchId: string,
    candidateId: string,
    expectedVersion: number,
    acknowledged: IntakeWarningKind[],
    context: InventoryActorContext,
  ): Promise<{ batch: IntakeBatch; candidateId: string; machineId: string }> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.candidate.commit",
        { batchId, candidateId, expectedVersion, acknowledged },
        context,
      );
      const row = rows(
        await database.execute(
          sql`select c.*, c.state as candidate_state, c.version as candidate_version, b.id as batch_id, b.load_id, b.state as state, b.state as batch_state, b.version as version, b.version as batch_version, b.created_at, b.updated_at from inventory_intake_candidate c inner join inventory_intake_batch b on b.id = c.batch_id where c.id = ${candidateId} and c.batch_id = ${batchId} for update`,
        ),
      )[0];
      if (
        !row ||
        (row.candidate_state === "committed" && !reservation.existingTargetId)
      )
        throw new Error("INTAKE_CANDIDATE_NOT_FOUND");
      if (reservation.existingTargetId) {
        const mapping = rows(
          await database.execute(
            sql`select machine_id from inventory_intake_machine_mapping where candidate_id = ${candidateId}`,
          ),
        )[0];
        if (mapping)
          return {
            batch: batch(
              rows(
                await database.execute(
                  sql`select * from inventory_intake_batch where id = ${batchId}`,
                ),
              )[0]!,
            ),
            candidateId,
            machineId: String(mapping.machine_id),
          };
      }
      if (row.candidate_state === "committed")
        throw new Error("INTAKE_CANDIDATE_COMMITTED");
      if (row.candidate_state !== "confirmed")
        throw new Error("INTAKE_CANDIDATE_NOT_CONFIRMED");
      if (row.batch_state !== "open") throw new Error("INTAKE_BATCH_COMMITTED");
      if (Number(row.batch_version) !== expectedVersion)
        throw new Error("INTAKE_VERSION_CONFLICT");
      if (!row.equipment_class || !row.equipment_class_selected_by_user_id)
        throw new Error("INTAKE_EQUIPMENT_CLASS_REQUIRED");
      const photos = rows(
        await database.execute(
          sql`select p.*, f.state as file_state from inventory_intake_photo p inner join file_attachment f on f.id = p.file_id where p.batch_id = ${batchId} and p.candidate_id = ${candidateId} and p.disposition = 'assigned'`,
        ),
      );
      if (
        !photos.length ||
        photos.some((photo) => photo.file_state !== "ready")
      )
        throw new Error("INTAKE_PHOTO_REQUIRED");
      const machine = await this.inventory.createIntakeMachine(
        database,
        {
          machineType: row.machine_type as "washer" | "dryer" | "other",
          equipmentClass: row.equipment_class as EquipmentClass,
          manufacturer: nullable(row.manufacturer),
          model: nullable(row.model),
          serial: nullable(row.serial),
          voltage: nullable(row.voltage),
          phase: (row.phase ?? null) as "single_phase" | "three_phase" | null,
          fuel: (row.fuel ?? null) as
            "gas" | "electric" | "steam" | "other" | null,
          capacityLb:
            row.capacity_lb === null || row.capacity_lb === undefined
              ? null
              : Number(row.capacity_lb),
          sourceKind: "photo_intake",
          sourceLoadId: String(row.load_id),
          inventoryState: "on_hand",
        },
        context,
      );
      if (!machine) throw new Error("INTAKE_MACHINE_CREATE_FAILED");
      await database.execute(
        sql`insert into inventory_intake_machine_mapping (candidate_id, batch_id, machine_id) values (${candidateId}, ${batchId}, ${machine.id})`,
      );
      const updated = rows(
        await database.execute(
          sql`update inventory_intake_candidate set state = 'committed', version = version + 1, updated_at = now() where id = ${candidateId} returning id`,
        ),
      );
      if (!updated.length) throw new Error("INTAKE_CANDIDATE_NOT_FOUND");
      await database.execute(
        sql`update inventory_intake_batch set version = version + 1, updated_at = now() where id = ${batchId} and state = 'open' and version = ${expectedVersion}`,
      );
      await this.record(
        database,
        "inventory.intake.batch.reviewed",
        batchId,
        context,
        ["machine_mapping", "candidate_state"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: batchId,
      });
      const nextBatch = rows(
        await database.execute(
          sql`select * from inventory_intake_batch where id = ${batchId}`,
        ),
      )[0]!;
      return { batch: batch(nextBatch), candidateId, machineId: machine.id };
    });
  }

  async commit(
    batchId: string,
    expectedVersion: number,
    context: InventoryActorContext,
    finishOnly = false,
  ): Promise<{
    batch: IntakeBatch;
    mappings: { candidateId: string; machineId: string }[];
  }> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.intake.batch.commit",
        { batchId, expectedVersion },
        context,
      );
      const batchLoad = rows(
        await database.execute(
          sql`select load_id from inventory_intake_batch where id = ${batchId}`,
        ),
      )[0];
      if (!batchLoad) throw new Error("INTAKE_BATCH_NOT_FOUND");
      const loadId = String(batchLoad.load_id);
      if (!(await this.inventory.lockLoadForIntake(database, loadId)))
        throw new Error("INTAKE_LOAD_NOT_FOUND");
      const current = rows(
        await database.execute(
          sql`select * from inventory_intake_batch where id = ${batchId} for update`,
        ),
      )[0];
      if (!current) throw new Error("INTAKE_BATCH_NOT_FOUND");
      if (reservation.existingTargetId) {
        const committedMappings = rows(
          await database.execute(
            sql`select candidate_id, machine_id from inventory_intake_machine_mapping where batch_id = ${batchId}`,
          ),
        ).map((row) => ({
          candidateId: String(row.candidate_id),
          machineId: String(row.machine_id),
        }));
        return { batch: batch(current), mappings: committedMappings };
      }
      if (current.state === "committed") {
        throw new Error("INTAKE_BATCH_COMMITTED");
      }
      if (Number(current.version) !== expectedVersion)
        throw new Error("INTAKE_VERSION_CONFLICT");
      const photos = rows(
        await database.execute(
          sql`select * from inventory_intake_photo p where p.batch_id = ${batchId}`,
        ),
      );
      const photoEvidence = await this.files.findIntakeEvidence(
        database,
        photos.map((row) => String(row.file_id)),
        String(current.load_id),
      );
      const evidenceById = new Map(
        photoEvidence.map((item) => [item.id, item]),
      );
      if (
        photos.some(
          (row) =>
            row.disposition === "unassigned" ||
            evidenceById.get(String(row.file_id))?.state !== "ready",
        )
      )
        throw new Error("INTAKE_PHOTO_NOT_ACCOUNTED");
      if (finishOnly) {
        const candidates = rows(
          await database.execute(
            sql`select c.id, c.state, m.machine_id from inventory_intake_candidate c left join inventory_intake_machine_mapping m on m.candidate_id = c.id where c.batch_id = ${batchId}`,
          ),
        );
        if (
          !candidates.length ||
          candidates.some(
            (candidate) =>
              candidate.state !== "committed" || !candidate.machine_id,
          )
        )
          throw new Error("INTAKE_FINISH_NOT_READY");
        const mappings = candidates.map((candidate) => ({
          candidateId: String(candidate.id),
          machineId: String(candidate.machine_id),
        }));
        const result = await database.execute(
          sql`update inventory_intake_batch set state = 'committed', version = version + 1, updated_at = now() where id = ${batchId} and state = 'open' and version = ${expectedVersion} returning *`,
        );
        if (!rows(result).length) throw new Error("INTAKE_VERSION_CONFLICT");
        await this.record(
          database,
          "inventory.intake.batch.committed",
          batchId,
          context,
          ["state"],
        );
        await this.receiveLoadIfFinalBatch(database, loadId, context);
        await this.idempotency.complete(database, {
          recordId: reservation.recordId!,
          targetType: "intake_batch",
          targetId: batchId,
        });
        return { batch: batch(rows(result)[0]!), mappings };
      }
      const candidates = rows(
        await database.execute(
          sql`select c.* from inventory_intake_candidate c where c.batch_id = ${batchId} and not exists (select 1 from inventory_intake_machine_mapping m where m.candidate_id = c.id) and exists (select 1 from inventory_intake_photo p where p.candidate_id = c.id and p.disposition = 'assigned') order by c.created_at, c.id`,
        ),
      );
      const allCandidateRows = rows(
        await database.execute(
          sql`select c.* from inventory_intake_candidate c where c.batch_id = ${batchId} and (exists (select 1 from inventory_intake_photo p where p.candidate_id = c.id and p.disposition = 'assigned') or exists (select 1 from inventory_intake_machine_mapping m where m.candidate_id = c.id))`,
        ),
      );
      if (!allCandidateRows.length)
        throw new Error("INTAKE_CANDIDATE_NOT_CONFIRMED");
      if (
        allCandidateRows.some(
          (row) => row.state !== "committed" && row.state !== "confirmed",
        )
      )
        throw new Error("INTAKE_CANDIDATE_NOT_CONFIRMED");
      if (candidates.some((row) => row.state !== "confirmed"))
        throw new Error("INTAKE_CANDIDATE_NOT_CONFIRMED");
      if (
        candidates.some(
          (row) =>
            !row.equipment_class || !row.equipment_class_selected_by_user_id,
        )
      )
        throw new Error("INTAKE_EQUIPMENT_CLASS_REQUIRED");
      for (const candidateRow of candidates) {
        const evidence = photos.filter(
          (photoRow) =>
            photoRow.candidate_id === candidateRow.id &&
            photoRow.disposition === "assigned" &&
            evidenceById.get(String(photoRow.file_id))?.state === "ready",
        );
        if (!evidence.length) throw new Error("INTAKE_PHOTO_REQUIRED");
      }
      const mappings: { candidateId: string; machineId: string }[] = rows(
        await database.execute(
          sql`select candidate_id, machine_id from inventory_intake_machine_mapping where batch_id = ${batchId}`,
        ),
      ).map((mapping) => ({
        candidateId: String(mapping.candidate_id),
        machineId: String(mapping.machine_id),
      }));
      for (const row of candidates) {
        const machine = await this.inventory.createIntakeMachine(
          database,
          {
            machineType: row.machine_type as "washer" | "dryer" | "other",
            equipmentClass: row.equipment_class as EquipmentClass,
            manufacturer: nullable(row.manufacturer),
            model: nullable(row.model),
            serial: nullable(row.serial),
            voltage: nullable(row.voltage),
            phase: (row.phase ?? null) as "single_phase" | "three_phase" | null,
            fuel: (row.fuel ?? null) as
              "gas" | "electric" | "steam" | "other" | null,
            capacityLb:
              row.capacity_lb === null || row.capacity_lb === undefined
                ? null
                : Number(row.capacity_lb),
            sourceKind: "photo_intake",
            sourceLoadId: String(current.load_id),
            inventoryState: "on_hand",
          },
          context,
        );
        if (!machine) throw new Error("INTAKE_MACHINE_CREATE_FAILED");
        await database.execute(
          sql`insert into inventory_intake_machine_mapping (candidate_id, batch_id, machine_id) values (${row.id}, ${batchId}, ${machine.id})`,
        );
        await database.execute(
          sql`update inventory_intake_candidate set state = 'committed', version = version + 1, updated_at = now() where id = ${row.id}`,
        );
        mappings.push({ candidateId: String(row.id), machineId: machine.id });
      }
      const result = await database.execute(
        sql`update inventory_intake_batch set state = 'committed', version = version + 1, updated_at = now() where id = ${batchId} and state = 'open' and version = ${expectedVersion} returning *`,
      );
      if (!rows(result).length) throw new Error("INTAKE_VERSION_CONFLICT");
      await this.record(
        database,
        "inventory.intake.batch.committed",
        batchId,
        context,
        ["state", "machine_mappings"],
      );
      await this.receiveLoadIfFinalBatch(database, loadId, context);
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "intake_batch",
        targetId: batchId,
      });
      return { batch: batch(rows(result)[0]!), mappings };
    });
  }

  private async receiveLoadIfFinalBatch(
    database: DatabaseExecutor,
    loadId: string,
    context: InventoryActorContext,
  ): Promise<void> {
    const openBatch = rows(
      await database.execute(sql`
        select id from inventory_intake_batch
        where load_id = ${loadId} and state = 'open'
        limit 1
      `),
    )[0];
    if (!openBatch)
      await this.inventory.receiveLoadAfterIntake(database, loadId, context);
  }

  private async detail(
    database: DatabaseExecutor,
    id: string,
  ): Promise<IntakeBatchDetail | undefined> {
    const base = rows(
      await database.execute(
        sql`select * from inventory_intake_batch where id = ${id}`,
      ),
    )[0];
    if (!base) return undefined;
    const photoRows = rows(
      await database.execute(
        sql`select p.* from inventory_intake_photo p where p.batch_id = ${id} order by p.photo_order`,
      ),
    );
    const evidence = await this.files.findIntakeEvidence(
      database,
      photoRows.map((row) => String(row.file_id)),
    );
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    const photos = photoRows.map((row) =>
      photo({
        ...row,
        original_filename: evidenceById.get(String(row.file_id))
          ?.originalFilename,
        detected_media_type: evidenceById.get(String(row.file_id))
          ?.detectedMediaType,
        file_state: evidenceById.get(String(row.file_id))?.state,
        preview_storage_key: evidenceById.get(String(row.file_id))
          ?.previewStorageKey,
      }),
    );
    const candidateRows = rows(
      await database.execute(
        sql`select * from inventory_intake_candidate where batch_id = ${id} order by created_at, id`,
      ),
    );
    const candidates: IntakeCandidate[] = [];
    for (const row of candidateRows) {
      candidates.push(candidate(row, []));
    }
    const latestRecognition = rows(
      await database.execute(sql`
      select distinct on (candidate_id) candidate_id, state, groups
      from inventory_intake_recognition_run
      where batch_id = ${id} and candidate_id is not null
      order by candidate_id, created_at desc, id desc
    `),
    );
    for (const run of latestRecognition) {
      if (run.state !== "ready" || !Array.isArray(run.groups)) continue;
      const target = candidates.find((entry) => entry.id === run.candidate_id);
      if (!target) continue;
      const field = (run.groups as IntakeGroupDecision[])
        .flatMap((group) => group.fields ?? [])
        .find(
          (entry) =>
            entry.field === "equipmentClass" && entry.accepted && entry.value,
        );
      if (!field) continue;
      const parsed = EquipmentClassSchema.safeParse(field.value);
      if (!parsed.success) continue;
      target.recognitionEquipmentClassSuggestion = {
        equipmentClass: parsed.data,
        evidence: field.verification?.ocrValue ?? null,
      };
    }
    const mappings = rows(
      await database.execute(
        sql`select candidate_id, machine_id from inventory_intake_machine_mapping where batch_id = ${id}`,
      ),
    ).map((row) => ({
      candidateId: String(row.candidate_id),
      machineId: String(row.machine_id),
    }));
    const items = rows(
      await database.execute(sql`
        select
          c.id as candidate_id,
          coalesce(r.photo_id, p.id) as photo_id,
          coalesce(r.file_id, p.file_id) as file_id,
          c.machine_type,
          c.equipment_class,
          c.state as candidate_state,
          c.version as candidate_revision,
          r.id as latest_run_id,
          r.state as latest_run_state,
          m.machine_id
        from inventory_intake_candidate c
        inner join lateral (
          select p.id, p.file_id from inventory_intake_photo p
          where p.candidate_id = c.id and p.disposition = 'assigned'
          order by p.photo_order, p.id limit 1
        ) p on true
        left join lateral (
          select r.id, r.photo_id, r.state, p.file_id
          from inventory_intake_recognition_run r
          left join inventory_intake_photo p on p.id = r.photo_id
          where r.candidate_id = c.id order by r.created_at desc, r.id desc limit 1
        ) r on true
        left join inventory_intake_machine_mapping m on m.candidate_id = c.id
        where c.batch_id = ${id}
        order by c.created_at, c.id
      `),
    ).flatMap((row) =>
      row.photo_id && row.file_id
        ? [
            {
              candidateId: String(row.candidate_id),
              photoId: String(row.photo_id),
              fileId: String(row.file_id),
              machineType: (row.machine_type ?? null) as
                "washer" | "dryer" | "other" | null,
              equipmentClass: (row.equipment_class ??
                null) as IntakeCandidate["equipmentClass"],
              candidateState: row.candidate_state as
                "draft" | "confirmed" | "committed",
              candidateRevision: Number(row.candidate_revision ?? 1),
              latestRunId: nullable(row.latest_run_id),
              latestRunState: nullable(row.latest_run_state) as
                | "queued"
                | "running"
                | "ready"
                | "needs_recapture"
                | "failed"
                | "stale"
                | "manual"
                | null,
              machineId: nullable(row.machine_id),
            },
          ]
        : [],
    );
    return {
      batch: batch(base),
      photos,
      candidates,
      machineMappings: mappings,
      items,
    };
  }

  private async findWith(
    database: DatabaseExecutor,
    id: string,
  ): Promise<IntakeBatch | undefined> {
    const row = rows(
      await database.execute(
        sql`select * from inventory_intake_batch where id = ${id}`,
      ),
    )[0];
    return row ? batch(row) : undefined;
  }
  private async lockBatch(
    database: DatabaseExecutor,
    id: string,
    version: number,
  ): Promise<IntakeBatch | undefined> {
    const row = rows(
      await database.execute(
        sql`select * from inventory_intake_batch where id = ${id} and version = ${version} and state = 'open' for update`,
      ),
    )[0];
    return row ? batch(row) : undefined;
  }
  private async assertOpen(
    database: DatabaseExecutor,
    id: string,
    version: number,
  ): Promise<IntakeBatch> {
    const value = await this.lockBatch(database, id, version);
    if (!value) throw new Error("INTAKE_VERSION_CONFLICT");
    return value;
  }
  private async bumpBatch(
    database: DatabaseExecutor,
    id: string,
    version: number,
  ): Promise<void> {
    const result = await database.execute(
      sql`update inventory_intake_batch set version = version + 1, updated_at = now() where id = ${id} and state = 'open' and version = ${version} returning id`,
    );
    if (!rows(result).length) throw new Error("INTAKE_VERSION_CONFLICT");
  }
  private async reserve(
    database: DatabaseExecutor,
    scope: string,
    input: unknown,
    context: InventoryActorContext,
  ): Promise<{ recordId?: string; existingTargetId?: string }> {
    if (!context.idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const reservation = await this.idempotency.reserve(database, {
      scope,
      actorUserId: context.actorUserId,
      rawKey: context.idempotencyKey,
      requestFingerprint: requestFingerprint(input),
    });
    if (reservation.status === "fingerprint_conflict")
      throw new Error("IDEMPOTENCY_KEY_REUSED");
    if (reservation.status === "in_progress")
      throw new Error("IDEMPOTENCY_IN_PROGRESS");
    if (reservation.status === "completed")
      return { existingTargetId: reservation.targetId };
    return { recordId: reservation.recordId };
  }
  private record(
    database: DatabaseExecutor,
    action:
      | "inventory.intake.batch.created"
      | "inventory.intake.batch.reviewed"
      | "inventory.intake.batch.committed",
    targetId: string,
    context: InventoryActorContext,
    changedFields: string[],
  ): Promise<unknown> {
    return this.recorder.record(database, {
      actorKind: "user",
      actorUserId: context.actorUserId,
      action,
      targetType: "intake_batch",
      targetId,
      requestId: context.requestId,
      summary: { changedFields, outcome: "completed" },
    });
  }
}
