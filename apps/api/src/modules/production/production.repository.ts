import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreatePreliminaryInspectionRequest,
  FileAttachment,
  IdentityUser,
  PreliminaryDispositionDecision,
  PreliminaryInspection,
  PreliminaryInspectionHistoryResponse,
  RecordPreliminaryDispositionRequest,
} from "@laundrorama/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@laundrorama/database";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DATABASE_CONNECTION } from "../../platform/database.module.js";
import {
  FILES_OPERATIONS,
  type FilesOperations,
} from "../files/files.service.js";
import {
  INVENTORY_OPERATIONS,
  type InventoryOperations,
} from "../inventory/inventory.service.js";
import {
  IDEMPOTENCY_COORDINATOR,
  MUTATION_RECORDER,
  requestFingerprint,
  type IdempotencyCoordinator,
  type MutationRecorder,
} from "../operations/operations.ports.js";
import { TestWorkRepository } from "./test-work.repository.js";

type Row = Record<string, unknown>;
type Actor = {
  actorUserId: string;
  requestId: string;
  idempotencyKey: string;
  canApprove: boolean;
};

function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  if (result && typeof result === "object" && "rows" in result)
    return rows(result.rows);
  return [];
}
function iso(value: unknown): string {
  return new Date(value as Date | string).toISOString();
}
function inspection(
  row: Row,
  evidence: FileAttachment[],
): PreliminaryInspection {
  return {
    id: String(row.id),
    machineId: String(row.machine_id),
    condition: String(row.condition),
    bearingAssessment:
      row.bearing_assessment as PreliminaryInspection["bearingAssessment"],
    bearingNotes: String(row.bearing_notes),
    missingParts: String(row.missing_parts),
    damage: String(row.damage),
    recommendation:
      row.recommendation as PreliminaryInspection["recommendation"],
    recommendationReason: String(row.recommendation_reason),
    inspectedByUserId: String(row.inspected_by_user_id),
    requestId: String(row.request_id),
    createdAt: iso(row.created_at),
    evidence,
  };
}
function decision(row: Row): PreliminaryDispositionDecision {
  return {
    id: String(row.id),
    machineId: String(row.machine_id),
    inspectionId: String(row.inspection_id),
    disposition:
      row.disposition as PreliminaryDispositionDecision["disposition"],
    reason: String(row.reason),
    decidedByUserId: String(row.decided_by_user_id),
    approvedByUserId:
      row.approved_by_user_id === null ? null : String(row.approved_by_user_id),
    requestId: String(row.request_id),
    machineVersion: Number(row.machine_version),
    createdAt: iso(row.created_at),
  };
}
function stateFor(
  disposition: PreliminaryDispositionDecision["disposition"],
  machineType: string,
): {
  inventoryState: "on_hand" | "scrapped";
  productionState: "preliminary_passed" | "awaiting_test" | "blocked";
} {
  return {
    inventoryState:
      disposition === "parts_only" || disposition === "scrap"
        ? "scrapped"
        : "on_hand",
    productionState:
      disposition === "repairable"
        ? machineType === "washer" || machineType === "dryer"
          ? "awaiting_test"
          : "preliminary_passed"
        : "blocked",
  };
}

// Production-owned narrow read for Test; the immutable preliminary decision stays authoritative.
export async function latestPassingInitialBearing(
  database: DatabaseExecutor,
  machineId: string,
): Promise<{
  assessment: "no_concern_observed";
  actorUserId: string;
  createdAt: string;
} | null> {
  const row = rows(
    await database.execute(sql`
    select i.bearing_assessment, i.inspected_by_user_id, i.created_at
    from production_preliminary_inspection i
    join production_preliminary_disposition d on d.inspection_id = i.id
    where i.machine_id = ${machineId} and i.bearing_assessment = 'no_concern_observed'
      and d.disposition = 'repairable'
    order by i.created_at desc, i.id desc limit 1
  `),
  )[0];
  return row
    ? {
        assessment: "no_concern_observed",
        actorUserId: String(row.inspected_by_user_id),
        createdAt: iso(row.created_at),
      }
    : null;
}

@Injectable()
export class ProductionRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    @Inject(INVENTORY_OPERATIONS)
    private readonly inventory: InventoryOperations,
    @Inject(FILES_OPERATIONS) private readonly files: FilesOperations,
    @Inject(MUTATION_RECORDER) private readonly recorder: MutationRecorder,
    @Inject(IDEMPOTENCY_COORDINATOR)
    private readonly idempotency: IdempotencyCoordinator,
    @Inject(TestWorkRepository) private readonly testWork: TestWorkRepository,
  ) {}

  history(machineId: string): Promise<PreliminaryInspectionHistoryResponse> {
    return this.historyWith(this.connection.database, machineId);
  }

  private async historyWith(
    database: DatabaseExecutor,
    machineId: string,
  ): Promise<PreliminaryInspectionHistoryResponse> {
    const machine = await this.inventory.findMachineForProduction(
      database,
      machineId,
    );
    if (!machine) throw new NotFoundException("Machine not found");
    const inspectionRows = rows(
      await database.execute(sql`
      select * from production_preliminary_inspection where machine_id = ${machineId}
      order by created_at desc, id desc
    `),
    );
    const decisionRows = rows(
      await database.execute(sql`
      select * from production_preliminary_disposition where machine_id = ${machineId}
      order by created_at desc, id desc
    `),
    );
    const inspectionIds = inspectionRows.map((row) => String(row.id));
    const links = inspectionIds.length
      ? rows(
          await database.execute(sql`
      select inspection_id, file_id from production_preliminary_evidence
      where inspection_id in (${sql.join(
        inspectionIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `),
        )
      : [];
    const fileIds = links.map((row) => String(row.file_id));
    const files = await this.files.findPreliminaryEvidenceByIds(
      database,
      fileIds,
    );
    const byFileId = new Map(files.map((file) => [file.id, file]));
    const inspections = inspectionRows.map((row) =>
      inspection(
        row,
        links
          .filter((link) => link.inspection_id === row.id)
          .map((link) => byFileId.get(String(link.file_id)))
          .filter((file): file is FileAttachment => file !== undefined),
      ),
    );
    const decisions = decisionRows.map(decision);
    return {
      machine,
      inspections,
      decisions,
      currentDisposition: decisions[0] ?? null,
    };
  }

  async create(
    machineId: string,
    input: CreatePreliminaryInspectionRequest,
    actor: Actor,
    initialCheckIdentity?: IdentityUser,
  ): Promise<PreliminaryInspectionHistoryResponse> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.preliminary_inspection.recorded",
        "preliminary_inspection",
        { machineId, input },
        actor,
      );
      if (reservation.replay) return this.historyWith(database, machineId);
      const machine = await this.inventory.findMachineForProduction(
        database,
        machineId,
      );
      if (!machine) throw new NotFoundException("Machine not found");
      if (initialCheckIdentity)
        await this.testWork.assertInitialCheckMachine(
          database,
          machine,
          initialCheckIdentity,
        );
      if (machine.version !== input.expectedMachineVersion)
        throw new ConflictException("Machine was changed by another request");
      if (machine.inventoryState !== "on_hand")
        throw new ConflictException("Only on-hand Machines can be inspected");
      if (
        ["testing", "awaiting_repair", "awaiting_clean"].includes(
          machine.productionState,
        )
      )
        throw new ConflictException(
          "Test workflow has already started for this Machine",
        );
      const evidence = await this.files.findReadyPreliminaryEvidence(
        database,
        machineId,
        input.evidenceFileIds,
      );
      if (evidence.length !== input.evidenceFileIds.length)
        throw new ConflictException(
          "Inspection evidence must be ready and belong to this Machine",
        );
      const inspectionId = randomUUID();
      await database.execute(sql`
        insert into production_preliminary_inspection (
          id, machine_id, condition, bearing_assessment, bearing_notes,
          missing_parts, damage, recommendation, recommendation_reason,
          inspected_by_user_id, request_id
        ) values (
          ${inspectionId}, ${machineId}, ${input.condition}, ${input.bearingAssessment},
          ${input.bearingNotes}, ${input.missingParts}, ${input.damage},
          ${input.recommendation}, ${input.reason}, ${actor.actorUserId}, ${actor.requestId}
        )
      `);
      for (const fileId of input.evidenceFileIds) {
        await database.execute(
          sql`insert into production_preliminary_evidence (inspection_id, file_id) values (${inspectionId}, ${fileId})`,
        );
      }
      const disposition =
        !actor.canApprove &&
        (input.recommendation === "parts_only" ||
          input.recommendation === "scrap")
          ? "owner_review"
          : input.recommendation;
      await this.recordDecision(
        database,
        machineId,
        inspectionId,
        disposition,
        input.reason,
        machine.version,
        actor,
      );
      await this.recorder.record(database, {
        actorKind: "user",
        actorUserId: actor.actorUserId,
        action: "production.preliminary_inspection.recorded",
        targetType: "preliminary_inspection",
        targetId: inspectionId,
        requestId: actor.requestId,
        summary: {
          changedFields: ["observations", "recommendation", "evidence"],
          outcome: "recorded",
        },
      });
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "preliminary_inspection",
        targetId: inspectionId,
      });
      return this.historyWith(database, machineId);
    });
  }

  async finalize(
    machineId: string,
    inspectionId: string,
    input: RecordPreliminaryDispositionRequest,
    actor: Actor,
  ): Promise<PreliminaryInspectionHistoryResponse> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.disposition.recorded",
        "preliminary_disposition",
        { machineId, inspectionId, input },
        actor,
      );
      if (reservation.replay) return this.historyWith(database, machineId);
      const machine = await this.inventory.findMachineForProduction(
        database,
        machineId,
      );
      if (!machine) throw new NotFoundException("Machine not found");
      if (machine.version !== input.expectedMachineVersion)
        throw new ConflictException("Machine was changed by another request");
      if (machine.inventoryState !== "on_hand")
        throw new ConflictException("Scrapped Machines cannot be changed here");
      const latestInspection = rows(
        await database.execute(sql`
        select id from production_preliminary_inspection where machine_id = ${machineId}
        order by created_at desc, id desc limit 1
      `),
      )[0];
      if (!latestInspection || latestInspection.id !== inspectionId)
        throw new ConflictException(
          "Only the latest inspection can receive a decision",
        );
      const latestDecision = rows(
        await database.execute(sql`
        select disposition from production_preliminary_disposition
        where inspection_id = ${inspectionId} order by created_at desc, id desc limit 1
      `),
      )[0];
      if (latestDecision?.disposition !== "owner_review")
        throw new ConflictException("Inspection is not awaiting Owner review");
      if (input.disposition === "owner_review")
        throw new ConflictException("Choose a final disposition");
      const decisionId = await this.recordDecision(
        database,
        machineId,
        inspectionId,
        input.disposition,
        input.reason,
        machine.version,
        actor,
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "preliminary_disposition",
        targetId: decisionId,
      });
      return this.historyWith(database, machineId);
    });
  }

  private async recordDecision(
    database: DatabaseExecutor,
    machineId: string,
    inspectionId: string,
    disposition: PreliminaryDispositionDecision["disposition"],
    reason: string,
    expectedVersion: number,
    actor: Actor,
  ): Promise<string> {
    if (
      (disposition === "parts_only" || disposition === "scrap") &&
      !actor.canApprove
    ) {
      throw new ConflictException("Owner approval is required");
    }
    const previous = await this.inventory.findMachineForProduction(
      database,
      machineId,
    );
    if (!previous) throw new NotFoundException("Machine not found");
    if (
      ["testing", "awaiting_repair", "awaiting_clean"].includes(
        previous.productionState,
      )
    )
      throw new ConflictException(
        "Test workflow has already started for this Machine",
      );
    const state = stateFor(disposition, previous.machineType);
    const machine = await this.inventory.updatePreliminaryLifecycle(database, {
      machineId,
      expectedVersion,
      ...state,
      actorUserId: actor.actorUserId,
      requestId: actor.requestId,
    });
    if (!machine)
      throw new ConflictException("Machine was changed by another request");
    if (state.productionState === "awaiting_test") {
      await this.testWork.createOnRepairable(database, machine, actor);
    } else if (previous.productionState === "awaiting_test") {
      await this.testWork.cancelQueuedForMachine(database, machineId, actor);
    }
    const decisionId = randomUUID();
    await database.execute(sql`
      insert into production_preliminary_disposition (
        id, machine_id, inspection_id, disposition, reason,
        decided_by_user_id, approved_by_user_id, request_id, machine_version
      ) values (
        ${decisionId}, ${machineId}, ${inspectionId}, ${disposition}, ${reason},
        ${actor.actorUserId}, ${disposition === "parts_only" || disposition === "scrap" ? actor.actorUserId : null},
        ${actor.requestId}, ${machine.version}
      )
    `);
    await this.recorder.record(database, {
      actorKind: "user",
      actorUserId: actor.actorUserId,
      action: "production.disposition.recorded",
      targetType: "preliminary_disposition",
      targetId: decisionId,
      requestId: actor.requestId,
      summary: {
        changedFields: ["disposition", "reason"],
        outcome: disposition,
      },
    });
    return decisionId;
  }

  private async reserve(
    database: DatabaseExecutor,
    scope: string,
    expectedTarget: string,
    fingerprintInput: unknown,
    actor: Actor,
  ): Promise<{ replay: boolean; recordId?: string }> {
    const result = await this.idempotency.reserve(database, {
      scope,
      actorUserId: actor.actorUserId,
      rawKey: actor.idempotencyKey,
      requestFingerprint: requestFingerprint(fingerprintInput),
    });
    if (result.status === "fingerprint_conflict")
      throw new ConflictException(
        "Idempotency-Key was already used for a different request",
      );
    if (result.status === "in_progress")
      throw new ConflictException("The original request is still in progress");
    if (result.status === "completed") {
      if (result.targetType !== expectedTarget)
        throw new ConflictException(
          "Idempotency-Key was already used for another action",
        );
      return { replay: true };
    }
    return { replay: false, recordId: result.recordId };
  }
}
