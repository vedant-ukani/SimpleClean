import { Inject, Injectable } from "@nestjs/common";
import {
  ImportCandidateSchema,
  ImportClassificationSchema,
  ImportCommitFailureCodeSchema,
  ImportFindingCodeSchema,
  ImportRawCellSchema,
  ImportRunStateSchema,
  type ImportApprovalRequest,
  type ImportCommitFailureCode,
  type ImportFindingCode,
  type ImportMediaType,
  type ImportRow,
  type ImportRowListQuery,
  type ImportRowListResponse,
  type ImportRun,
} from "@simply-clean/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@simply-clean/database";
import { sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import { DATABASE_CONNECTION } from "../../platform/database.module.js";
import {
  INVENTORY_OPERATIONS,
  type ImportCandidateMatch,
  type InventoryOperations,
} from "../inventory/inventory.service.js";
import {
  IDEMPOTENCY_COORDINATOR,
  MUTATION_RECORDER,
  IdempotencyKeyReuseError,
  IdempotencyRequestInProgressError,
  requestFingerprint,
  type IdempotencyCoordinator,
  type MutationRecorder,
} from "../operations/operations.ports.js";
import type { ParsedImportRow } from "./import-parser.js";

type RecordRow = Record<string, unknown>;

function rows(result: unknown): RecordRow[] {
  if (Array.isArray(result)) return result as RecordRow[];
  if (result && typeof result === "object" && "rows" in result) {
    return rows((result as { rows: unknown }).rows);
  }
  return [];
}

function iso(value: unknown): string {
  return new Date(value as Date | string).toISOString();
}

function runFromRow(row: RecordRow): ImportRun {
  return {
    id: String(row.id),
    sourceLoadId: String(row.source_load_id),
    sourceLoadDisplayName: String(row.source_load_display_name),
    state: ImportRunStateSchema.parse(row.state),
    version: Number(row.version),
    originalFilename: String(row.original_filename),
    mediaType: row.media_type as ImportMediaType,
    byteCount: Number(row.byte_count),
    sha256: String(row.sha256),
    totalRows: Number(row.total_rows),
    readyRows: Number(row.ready_rows),
    warningRows: Number(row.warning_rows),
    errorRows: Number(row.error_rows),
    approvedRows: Number(row.approved_rows),
    committedRows: Number(row.committed_rows),
    failureCode: row.failure_code
      ? ImportCommitFailureCodeSchema.parse(row.failure_code)
      : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function rowFromRow(row: RecordRow): ImportRow {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    sheetName: String(row.sheet_name),
    sourceRowNumber: Number(row.source_row_number),
    rawCells: ImportRawCellSchema.array().parse(row.raw_cells),
    candidate: ImportCandidateSchema.parse(row.candidate),
    classification: ImportClassificationSchema.parse(row.classification),
    findings: ImportFindingCodeSchema.array().parse(row.findings),
    approved: Boolean(row.approved),
    machineId: typeof row.machine_id === "string" ? row.machine_id : null,
  };
}

const runSelect = sql`
  select r.*, l.display_name as source_load_display_name
  from inventory_import_run r
  inner join inventory_load l on l.id = r.source_load_id
`;

export interface ImportActorContext {
  actorUserId: string;
  requestId: string;
  idempotencyKey?: string;
}

export interface StageImportInput {
  runId: string;
  sourceLoadId: string;
  storageKey: string;
  originalFilename: string;
  mediaType: ImportMediaType;
  byteCount: number;
  sha256: string;
  rows: StagedImportRow[];
}

interface ImportMatchSnapshot {
  exactIdentityMachineIds: string[];
  serialMachineIds: string[];
  modelMachineIds: string[];
}

interface StagedImportRow extends ParsedImportRow {
  matchSnapshot: ImportMatchSnapshot;
  matchFingerprint: string;
}

interface ApprovedImportRow extends ImportRow {
  approvalId: string;
  matchSnapshot: ImportMatchSnapshot;
  matchFingerprint: string;
}

export class ImportCommitExpectedError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "version_conflict"
      | "invalid_state"
      | "duplicate_state_changed",
  ) {
    super(code);
  }
}

@Injectable()
export class ImportsRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    @Inject(INVENTORY_OPERATIONS)
    private readonly inventory: InventoryOperations,
    @Inject(MUTATION_RECORDER) private readonly recorder: MutationRecorder,
    @Inject(IDEMPOTENCY_COORDINATOR)
    private readonly idempotency: IdempotencyCoordinator,
  ) {}

  async addExistingMatchFindings(
    parsedRows: ParsedImportRow[],
  ): Promise<StagedImportRow[]> {
    const matches = await this.inventory.analyzeImportCandidates(
      this.connection.database,
      parsedRows.map((row) => row.candidate),
    );
    return parsedRows.map((row, index) => {
      const match = matches[index]!;
      const matchSnapshot = canonicalMatchSnapshot(match);
      let findings = [...row.findings];
      if (match.exactIdentityMachineIds.length)
        findings = add(findings, "existing_identity_match");
      if (match.serialMachineIds.length)
        findings = add(findings, "existing_serial_match");
      if (match.modelMachineIds.length)
        findings = add(findings, "existing_model_match");
      return {
        ...row,
        findings,
        classification:
          row.classification === "error"
            ? "error"
            : findings.length
              ? "warning"
              : "ready",
        matchSnapshot,
        matchFingerprint: matchFingerprint(matchSnapshot),
      };
    });
  }

  async stage(
    input: StageImportInput,
    context: ImportActorContext,
  ): Promise<{ run: ImportRun; created: boolean }> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.idempotency.reserve(database, {
        scope: "imports.run.stage",
        actorUserId: context.actorUserId,
        rawKey: context.idempotencyKey!,
        requestFingerprint: requestFingerprint({
          sourceLoadId: input.sourceLoadId,
          sha256: input.sha256,
        }),
      });
      if (reservation.status === "fingerprint_conflict")
        throw new IdempotencyKeyReuseError();
      if (reservation.status === "in_progress")
        throw new IdempotencyRequestInProgressError();
      if (reservation.status === "completed") {
        if (reservation.targetType !== "import_run")
          throw new IdempotencyKeyReuseError();
        const existing = await this.findRunWith(database, reservation.targetId);
        if (!existing)
          throw new Error("Idempotent Import Run target is unavailable");
        return { run: existing, created: false };
      }
      const counts = countClassifications(input.rows);
      await database.execute(sql`
        insert into inventory_import_run (
          id, source_load_id, storage_key, original_filename, media_type,
          byte_count, sha256, uploader_user_id, total_rows, ready_rows,
          warning_rows, error_rows
        ) values (
          ${input.runId}, ${input.sourceLoadId}, ${input.storageKey},
          ${input.originalFilename}, ${input.mediaType}, ${input.byteCount},
          ${input.sha256}, ${context.actorUserId}, ${input.rows.length},
          ${counts.ready}, ${counts.warning}, ${counts.error}
        )
      `);
      for (const row of input.rows) {
        await database.execute(sql`
          insert into inventory_import_row (
            id, run_id, sheet_name, source_row_number, raw_cells, candidate,
            normalized_manufacturer, normalized_model, normalized_serial,
            match_snapshot, match_fingerprint, classification, findings
          ) values (
            ${randomUUID()}, ${input.runId}, ${row.sheetName},
            ${row.sourceRowNumber}, ${JSON.stringify(row.rawCells)}::jsonb,
            ${JSON.stringify(row.candidate)}::jsonb,
            ${normalize(row.candidate.manufacturer)},
            ${normalize(row.candidate.model)}, ${normalize(row.candidate.serial)},
            ${JSON.stringify(row.matchSnapshot)}::jsonb,
            ${row.matchFingerprint},
            ${row.classification}, ${JSON.stringify(row.findings)}::jsonb
          )
        `);
      }
      await this.record(database, "imports.run.staged", input.runId, context, [
        "source_file",
        "source_load_id",
        "staged_rows",
      ]);
      await this.idempotency.complete(database, {
        recordId: reservation.recordId,
        targetType: "import_run",
        targetId: input.runId,
      });
      const run = await this.findRunWith(database, input.runId);
      if (!run) throw new Error("Import Run was not created");
      return { run, created: true };
    });
  }

  async listRuns(): Promise<ImportRun[]> {
    const result = await this.connection.database.execute(
      sql`${runSelect} order by r.created_at desc, r.id desc`,
    );
    return rows(result).map(runFromRow);
  }

  findRun(id: string): Promise<ImportRun | undefined> {
    return this.findRunWith(this.connection.database, id);
  }

  async listRows(
    runId: string,
    query: ImportRowListQuery,
  ): Promise<ImportRowListResponse> {
    const filter = query.classification
      ? sql`and r.classification = ${query.classification}`
      : sql``;
    const offset = (query.page - 1) * query.pageSize;
    const [countResult, result] = await Promise.all([
      this.connection.database.execute(sql`
        select count(*)::integer as total from inventory_import_row r
        where r.run_id = ${runId} ${filter}
      `),
      this.connection.database.execute(sql`
        select r.*,
          (ar.row_id is not null) as approved,
          mm.machine_id
        from inventory_import_row r
        left join inventory_import_approval_row ar on ar.row_id = r.id
        left join inventory_import_machine_mapping mm on mm.row_id = r.id
        where r.run_id = ${runId} ${filter}
        order by r.sheet_name, r.source_row_number, r.id
        limit ${query.pageSize} offset ${offset}
      `),
    ]);
    return {
      rows: rows(result).map(rowFromRow),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(rows(countResult)[0]?.total ?? 0),
    };
  }

  async allRows(runId: string): Promise<ImportRow[]> {
    const result = await this.connection.database.execute(sql`
      select r.*, (ar.row_id is not null) as approved, mm.machine_id
      from inventory_import_row r
      left join inventory_import_approval_row ar on ar.row_id = r.id
      left join inventory_import_machine_mapping mm on mm.row_id = r.id
      where r.run_id = ${runId}
      order by r.sheet_name, r.source_row_number, r.id
    `);
    return rows(result).map(rowFromRow);
  }

  async approve(
    runId: string,
    input: ImportApprovalRequest,
    context: ImportActorContext,
  ): Promise<ImportRun> {
    return this.connection.transaction(async (database) => {
      const run = await this.lockRun(database, runId);
      if (!run) throw new ImportCommitExpectedError("not_found");
      if (run.version !== input.expectedVersion)
        throw new ImportCommitExpectedError("version_conflict");
      if (run.state !== "staged")
        throw new ImportCommitExpectedError("invalid_state");
      const selected = [...new Set(input.rowIds)];
      const selectedResult = selected.length
        ? await database.execute(sql`
            select id, classification from inventory_import_row
            where run_id = ${runId} and id in (${sql.join(
              selected.map((id) => sql`${id}`),
              sql`, `,
            )})
          `)
        : [];
      const selectedRows = rows(selectedResult);
      if (
        selectedRows.length !== selected.length ||
        selectedRows.some((row) => row.classification === "error")
      ) {
        throw new ImportCommitExpectedError("invalid_state");
      }
      const approvalId = randomUUID();
      await database.execute(sql`
        insert into inventory_import_approval (id, run_id, actor_user_id, request_id)
        values (${approvalId}, ${runId}, ${context.actorUserId}, ${context.requestId})
      `);
      for (const rowId of selected) {
        await database.execute(sql`
          insert into inventory_import_approval_row (approval_id, run_id, row_id)
          values (${approvalId}, ${runId}, ${rowId})
        `);
      }
      await database.execute(sql`
        update inventory_import_run set state = 'approved',
          approved_rows = ${selected.length}, failure_code = null,
          version = version + 1, updated_at = now()
        where id = ${runId}
      `);
      await this.record(database, "imports.run.approved", runId, context, [
        "state",
        "approval_selection",
      ]);
      return (await this.findRunWith(database, runId))!;
    });
  }

  async commit(
    runId: string,
    expectedVersion: number,
    context: ImportActorContext,
  ): Promise<{ run: ImportRun; machineIds: string[] }> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.idempotency.reserve(database, {
        scope: `imports.run.commit:${runId}`,
        actorUserId: context.actorUserId,
        rawKey: context.idempotencyKey!,
        requestFingerprint: requestFingerprint({ runId, expectedVersion }),
      });
      if (reservation.status === "fingerprint_conflict")
        throw new IdempotencyKeyReuseError();
      if (reservation.status === "in_progress")
        throw new IdempotencyRequestInProgressError();
      if (reservation.status === "completed") {
        if (
          reservation.targetType !== "import_run" ||
          reservation.targetId !== runId
        )
          throw new IdempotencyKeyReuseError();
        const existing = await this.findRunWith(database, runId);
        if (!existing)
          throw new Error("Idempotent Import Run target is unavailable");
        return {
          run: existing,
          machineIds: await this.mappingIds(database, runId),
        };
      }
      const run = await this.lockRun(database, runId);
      if (!run) throw new ImportCommitExpectedError("not_found");
      if (run.version !== expectedVersion)
        throw new ImportCommitExpectedError("version_conflict");
      if (
        run.state !== "approved" &&
        !(run.state === "commit_failed" && run.failureCode === "commit_failed")
      ) {
        throw new ImportCommitExpectedError("invalid_state");
      }
      const approvedRows = await this.approvedRows(database, runId);
      const matches = await this.inventory.analyzeImportCandidates(
        database,
        approvedRows.map((row) => row.candidate),
      );
      if (
        approvedRows.some((row, index) => {
          const storedFingerprint = matchFingerprint(row.matchSnapshot);
          const currentFingerprint = matchFingerprint(matches[index]!);
          return (
            storedFingerprint !== row.matchFingerprint ||
            currentFingerprint !== row.matchFingerprint
          );
        })
      ) {
        throw new ImportCommitExpectedError("duplicate_state_changed");
      }
      const machineIds: string[] = [];
      for (const row of approvedRows) {
        const machine = await this.inventory.createImportedMachine(
          database,
          { ...row.candidate, sourceLoadId: run.sourceLoadId },
          context,
        );
        await database.execute(sql`
          insert into inventory_import_machine_mapping (
            id, approval_id, run_id, row_id, machine_id
          ) values (
            ${randomUUID()}, ${row.approvalId}, ${runId}, ${row.id}, ${machine.id}
          )
        `);
        machineIds.push(machine.id);
      }
      await database.execute(sql`
        update inventory_import_run set state = 'committed',
          committed_rows = ${machineIds.length}, failure_code = null,
          version = version + 1, updated_at = now()
        where id = ${runId}
      `);
      await this.record(database, "imports.run.committed", runId, context, [
        "state",
        "commit_mappings",
      ]);
      await this.idempotency.complete(database, {
        recordId: reservation.recordId,
        targetType: "import_run",
        targetId: runId,
      });
      return { run: (await this.findRunWith(database, runId))!, machineIds };
    });
  }

  async markCommitFailed(
    runId: string,
    failureCode: ImportCommitFailureCode,
    context: ImportActorContext,
  ): Promise<void> {
    await this.connection.transaction(async (database) => {
      const result = await database.execute(sql`
        update inventory_import_run set state = 'commit_failed',
          failure_code = ${failureCode}, version = version + 1, updated_at = now()
        where id = ${runId}
          and (
            state = 'approved'
            or (state = 'commit_failed' and failure_code = 'commit_failed')
          )
        returning id
      `);
      if (!rows(result).length) return;
      await this.record(
        database,
        "imports.run.commit_failed",
        runId,
        context,
        ["state", "failure_code"],
        failureCode,
      );
    });
  }

  async sourceMetadata(
    runId: string,
  ): Promise<
    { storageKey: string; filename: string; mediaType: string } | undefined
  > {
    const result = await this.connection.database.execute(sql`
      select storage_key, original_filename, media_type
      from inventory_import_run where id = ${runId}
    `);
    const row = rows(result)[0];
    return row
      ? {
          storageKey: String(row.storage_key),
          filename: String(row.original_filename),
          mediaType: String(row.media_type),
        }
      : undefined;
  }

  private async approvedRows(
    database: DatabaseExecutor,
    runId: string,
  ): Promise<ApprovedImportRow[]> {
    const result = await database.execute(sql`
      select r.*, ar.approval_id, true as approved, null::text as machine_id
      from inventory_import_row r
      inner join inventory_import_approval_row ar on ar.row_id = r.id and ar.run_id = r.run_id
      where r.run_id = ${runId}
      order by r.sheet_name, r.source_row_number, r.id
    `);
    return rows(result).map((row) => ({
      ...rowFromRow(row),
      approvalId: String(row.approval_id),
      matchSnapshot: parseMatchSnapshot(row.match_snapshot),
      matchFingerprint: String(row.match_fingerprint),
    }));
  }

  private async mappingIds(
    database: DatabaseExecutor,
    runId: string,
  ): Promise<string[]> {
    const result = await database.execute(sql`
      select mm.machine_id from inventory_import_machine_mapping mm
      inner join inventory_import_row r on r.id = mm.row_id
      where r.run_id = ${runId} order by r.source_row_number, r.id
    `);
    return rows(result).map((row) => String(row.machine_id));
  }

  private async findRunWith(
    database: DatabaseExecutor,
    id: string,
  ): Promise<ImportRun | undefined> {
    const result = await database.execute(sql`${runSelect} where r.id = ${id}`);
    const row = rows(result)[0];
    return row ? runFromRow(row) : undefined;
  }

  private async lockRun(
    database: DatabaseExecutor,
    id: string,
  ): Promise<ImportRun | undefined> {
    const result = await database.execute(
      sql`${runSelect} where r.id = ${id} for update of r`,
    );
    const row = rows(result)[0];
    return row ? runFromRow(row) : undefined;
  }

  private record(
    database: DatabaseExecutor,
    action:
      | "imports.run.staged"
      | "imports.run.approved"
      | "imports.run.committed"
      | "imports.run.commit_failed",
    runId: string,
    context: ImportActorContext,
    changedFields: string[],
    outcome = "completed",
  ): Promise<unknown> {
    return this.recorder.record(database, {
      actorKind: "user",
      actorUserId: context.actorUserId,
      action,
      targetType: "import_run",
      targetId: runId,
      requestId: context.requestId,
      summary: { changedFields, outcome },
    });
  }
}

function normalize(value: string | null): string | null {
  return value ? value.trim().replace(/\s+/g, " ").toLowerCase() : null;
}

function add(
  findings: ImportFindingCode[],
  finding: ImportFindingCode,
): ImportFindingCode[] {
  return findings.includes(finding) ? findings : [...findings, finding];
}

function countClassifications(parsedRows: ParsedImportRow[]) {
  return {
    ready: parsedRows.filter((row) => row.classification === "ready").length,
    warning: parsedRows.filter((row) => row.classification === "warning")
      .length,
    error: parsedRows.filter((row) => row.classification === "error").length,
  };
}

function canonicalMatchSnapshot(
  match: ImportCandidateMatch,
): ImportMatchSnapshot {
  const canonicalIds = (ids: readonly string[]) => [...new Set(ids)].sort();
  return {
    exactIdentityMachineIds: canonicalIds(match.exactIdentityMachineIds),
    serialMachineIds: canonicalIds(match.serialMachineIds),
    modelMachineIds: canonicalIds(match.modelMachineIds),
  };
}

function matchFingerprint(match: ImportCandidateMatch): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalMatchSnapshot(match)))
    .digest("hex");
}

function parseMatchSnapshot(input: unknown): ImportMatchSnapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Stored import match snapshot is invalid");
  }
  const object = input as Record<string, unknown>;
  const stringArray = (value: unknown): string[] => {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string")
    ) {
      throw new Error("Stored import match snapshot is invalid");
    }
    return value as string[];
  };
  return canonicalMatchSnapshot({
    exactIdentityMachineIds: stringArray(object.exactIdentityMachineIds),
    serialMachineIds: stringArray(object.serialMachineIds),
    modelMachineIds: stringArray(object.modelMachineIds),
  });
}
