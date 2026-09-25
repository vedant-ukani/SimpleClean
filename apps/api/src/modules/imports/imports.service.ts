import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { ServerConfig } from "@laundrorama/config";
import {
  IdempotencyKeySchema,
  ImportApprovalRequestSchema,
  ImportCommitRequestSchema,
  ImportIdSchema,
  ImportRowListQuerySchema,
  type ImportCommitResponse,
  type ImportRowListResponse,
  type ImportRun,
} from "@laundrorama/contracts";
import { stringify } from "csv-stringify/sync";
import { createHash, randomUUID } from "node:crypto";

import { SERVER_CONFIG } from "../../platform/logging.js";
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from "../files/storage.adapter.js";
import {
  INVENTORY_OPERATIONS,
  type InventoryOperations,
} from "../inventory/inventory.service.js";
import {
  IdempotencyKeyReuseError,
  IdempotencyRequestInProgressError,
} from "../operations/operations.ports.js";
import { parseImportFile, ImportFileError } from "./import-parser.js";
import {
  ImportCommitExpectedError,
  ImportsRepository,
  type ImportActorContext,
} from "./imports.repository.js";

@Injectable()
export class ImportsService {
  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
    @Inject(INVENTORY_OPERATIONS)
    private readonly inventory: InventoryOperations,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
  ) {}

  async stage(
    sourceLoadIdRaw: unknown,
    file: Express.Multer.File | undefined,
    context: ImportActorContext,
  ): Promise<ImportRun> {
    const sourceLoadId = this.id(sourceLoadIdRaw);
    this.idempotencyKey(context.idempotencyKey);
    if (!file?.buffer)
      throw new BadRequestException("One inventory file is required");
    if (file.size < 1 || file.size > this.config.fileMaxBytes) {
      throw new BadRequestException(
        "Inventory file exceeds the configured limit",
      );
    }
    const filename = this.filename(file.originalname);
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const runId = randomUUID();
    const storageKey = `${runId}/${randomUUID()}`;
    let storageAttempted = false;
    let databaseAttempted = false;
    try {
      await this.inventory.getLoad(sourceLoadId);
      const parsed = await parseImportFile(filename, file.buffer);
      const stagedRows = await this.repository.addExistingMatchFindings(
        parsed.rows,
      );
      storageAttempted = true;
      await this.storage.put(storageKey, file.buffer, {
        byteCount: file.buffer.length,
        mediaType: parsed.mediaType,
        sha256,
      });
      const stored = await this.storage.head(storageKey);
      if (
        !stored ||
        stored.byteCount !== file.buffer.length ||
        stored.mediaType !== parsed.mediaType ||
        stored.sha256 !== sha256
      ) {
        throw new Error("Stored import source did not verify");
      }
      databaseAttempted = true;
      const result = await this.repository.stage(
        {
          runId,
          sourceLoadId,
          storageKey,
          originalFilename: filename,
          mediaType: parsed.mediaType,
          byteCount: file.buffer.length,
          sha256,
          rows: stagedRows,
        },
        context,
      );
      if (!result.created) await this.bestEffortDelete(storageKey);
      return result.run;
    } catch (error) {
      if (storageAttempted) {
        if (databaseAttempted) {
          await this.cleanupUnpersistedSource(runId, storageKey);
        } else {
          await this.bestEffortDelete(storageKey);
        }
      }
      if (error instanceof ImportFileError) {
        throw new BadRequestException(`Inventory file rejected: ${error.code}`);
      }
      throw this.safeError(
        this.idempotencyError(error),
        "Inventory import staging failed safely",
      );
    }
  }

  async listRuns(): Promise<ImportRun[]> {
    try {
      return await this.repository.listRuns();
    } catch (error) {
      throw this.safeError(
        error,
        "Inventory imports are temporarily unavailable",
      );
    }
  }

  async getRun(rawId: string): Promise<ImportRun> {
    try {
      const run = await this.repository.findRun(this.id(rawId));
      if (!run) throw new NotFoundException("Import Run not found");
      return run;
    } catch (error) {
      throw this.safeError(
        error,
        "Inventory import is temporarily unavailable",
      );
    }
  }

  async listRows(
    rawId: string,
    rawQuery: unknown,
  ): Promise<ImportRowListResponse> {
    const id = this.id(rawId);
    await this.getRun(id);
    try {
      return await this.repository.listRows(
        id,
        this.parse(ImportRowListQuerySchema, rawQuery),
      );
    } catch (error) {
      throw this.safeError(
        error,
        "Inventory import rows are temporarily unavailable",
      );
    }
  }

  async approve(
    rawId: string,
    rawInput: unknown,
    context: ImportActorContext,
  ): Promise<ImportRun> {
    try {
      return await this.repository.approve(
        this.id(rawId),
        this.parse(ImportApprovalRequestSchema, rawInput),
        context,
      );
    } catch (error) {
      throw this.safeError(
        this.expectedError(error),
        "Inventory import approval failed safely",
      );
    }
  }

  async commit(
    rawId: string,
    rawInput: unknown,
    context: ImportActorContext,
  ): Promise<ImportCommitResponse> {
    const runId = this.id(rawId);
    this.idempotencyKey(context.idempotencyKey);
    const input = this.parse(ImportCommitRequestSchema, rawInput);
    try {
      return await this.repository.commit(
        runId,
        input.expectedVersion,
        context,
      );
    } catch (error) {
      const mapped = this.expectedError(this.idempotencyError(error));
      if (
        error instanceof ImportCommitExpectedError &&
        error.code === "duplicate_state_changed"
      ) {
        await this.bestEffortMarkCommitFailed(
          runId,
          "duplicate_state_changed",
          context,
        );
        throw mapped;
      }
      if (mapped instanceof HttpException) throw mapped;
      await this.bestEffortMarkCommitFailed(runId, "commit_failed", context);
      throw new InternalServerErrorException("Import commit failed safely");
    }
  }

  async source(rawId: string) {
    try {
      const runId = this.id(rawId);
      const metadata = await this.repository.sourceMetadata(runId);
      if (!metadata) throw new NotFoundException("Import Run not found");
      const object = await this.storage.get(metadata.storageKey);
      if (!object) throw new NotFoundException("Import source is unavailable");
      const sha256 = createHash("sha256").update(object.bytes).digest("hex");
      const run = await this.getRun(runId);
      if (
        object.byteCount !== run.byteCount ||
        object.mediaType !== run.mediaType ||
        object.sha256 !== run.sha256 ||
        sha256 !== run.sha256
      ) {
        throw new ConflictException("Import source integrity check failed");
      }
      return { ...object, filename: this.downloadFilename(metadata.filename) };
    } catch (error) {
      throw this.safeError(error, "Import source is temporarily unavailable");
    }
  }

  async report(rawId: string): Promise<Buffer> {
    try {
      const runId = this.id(rawId);
      await this.getRun(runId);
      const rows = await this.repository.allRows(runId);
      const csv = stringify(
        rows.map((row) => ({
          sheet: escapeFormula(row.sheetName),
          row_number: row.sourceRowNumber,
          classification: row.classification,
          findings: escapeFormula(row.findings.join("|")),
          approved: row.approved ? "yes" : "no",
          result: row.machineId
            ? "committed"
            : row.approved
              ? "approved"
              : "not_selected",
          machine_id: escapeFormula(row.machineId ?? ""),
        })),
        { header: true },
      );
      return Buffer.from(csv, "utf8");
    } catch (error) {
      throw this.safeError(error, "Import report is temporarily unavailable");
    }
  }

  private id(input: unknown): string {
    const result = ImportIdSchema.safeParse(input);
    if (!result.success)
      throw new BadRequestException("Invalid Import Run or Load ID");
    return result.data;
  }

  private idempotencyKey(input: unknown): string {
    const result = IdempotencyKeySchema.safeParse(input);
    if (!result.success)
      throw new BadRequestException("A valid Idempotency-Key is required");
    return result.data;
  }

  private filename(input: string): string {
    const hasControlCharacter = [...input].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
    if (!input || input.length > 255 || hasControlCharacter) {
      throw new BadRequestException("Invalid inventory filename");
    }
    return input;
  }

  private downloadFilename(input: string): string {
    return input.replace(/[/"\\\r\n]/g, "_");
  }

  private parse<T>(
    schema: {
      safeParse(
        input: unknown,
      ): { success: true; data: T } | { success: false };
    },
    input: unknown,
  ): T {
    const result = schema.safeParse(input);
    if (!result.success) throw new BadRequestException("Invalid request");
    return result.data;
  }

  private idempotencyError(error: unknown): unknown {
    if (error instanceof IdempotencyKeyReuseError) {
      return new ConflictException(
        "Idempotency-Key was already used for a different request",
      );
    }
    if (error instanceof IdempotencyRequestInProgressError) {
      return new ConflictException("The original request is still in progress");
    }
    return error;
  }

  private expectedError(error: unknown): unknown {
    if (!(error instanceof ImportCommitExpectedError)) return error;
    if (error.code === "not_found")
      return new NotFoundException("Import Run not found");
    if (error.code === "version_conflict")
      return new ConflictException("Import Run was changed by another request");
    if (error.code === "duplicate_state_changed") {
      return new ConflictException(
        "Inventory matches changed after approval; create and review a new Import Run",
      );
    }
    return new ConflictException("Import Run is not in the required state");
  }

  private safeError(error: unknown, message: string): HttpException {
    return error instanceof HttpException
      ? error
      : new InternalServerErrorException(message);
  }

  private async bestEffortDelete(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch {
      // Operator reconciliation can remove an object whose deletion failed.
    }
  }

  private async cleanupUnpersistedSource(
    runId: string,
    storageKey: string,
  ): Promise<void> {
    try {
      if (await this.repository.findRun(runId)) return;
    } catch {
      // Keep the source when database outcome is uncertain; deleting it could
      // break a transaction that committed while its response was lost.
      return;
    }
    await this.bestEffortDelete(storageKey);
  }

  private async bestEffortMarkCommitFailed(
    runId: string,
    failureCode: "duplicate_state_changed" | "commit_failed",
    context: ImportActorContext,
  ): Promise<void> {
    try {
      await this.repository.markCommitFailed(runId, failureCode, context);
    } catch {
      // Never let a secondary failure expose the original private error.
    }
  }
}

function escapeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
