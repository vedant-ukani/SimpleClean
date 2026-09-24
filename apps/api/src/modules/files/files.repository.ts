import { Inject, Injectable } from "@nestjs/common";
import { FileAttachmentSchema } from "@simply-clean/contracts";
import type {
  CreateFileUploadGrantRequest,
  FileAttachment,
  FileMediaType,
  FileTarget,
} from "@simply-clean/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@simply-clean/database";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { DATABASE_CONNECTION } from "../../platform/database.module.js";
import {
  MUTATION_RECORDER,
  type MutationRecorder,
} from "../operations/operations.ports.js";

export interface FileActorContext {
  actorUserId: string;
  sessionId: string;
  requestId: string;
}

export interface PrivateFileAttachment extends FileAttachment {
  storageKey: string;
  previewStorageKey?: string;
}

export interface IntakeFileEvidence {
  id: string;
  originalFilename: string;
  detectedMediaType: FileMediaType | null;
  state: FileAttachment["state"];
  previewStorageKey?: string;
  sha256?: string;
  byteCount?: number;
}

export interface IntakeAnalysisEvidence extends IntakeFileEvidence {
  storageKey: string;
  byteCount: number;
  sha256: string;
  previewByteCount: number | null;
  previewSha256: string | null;
}

type RecordRow = Record<string, unknown>;

function rows(result: unknown): RecordRow[] {
  if (Array.isArray(result)) {
    return result.filter(
      (row): row is RecordRow => typeof row === "object" && row !== null,
    );
  }
  if (typeof result === "object" && result !== null && "rows" in result) {
    return rows(result.rows);
  }
  return [];
}

function iso(value: unknown): string {
  return new Date(value as Date | string).toISOString();
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function fileFromRow(row: RecordRow): PrivateFileAttachment {
  const machineId = nullableString(row.machine_id);
  const loadId = nullableString(row.load_id);
  return {
    id: String(row.id),
    target: machineId
      ? { type: "machine", id: machineId }
      : { type: "load", id: loadId! },
    purpose: row.purpose as FileAttachment["purpose"],
    storageKey: String(row.storage_key),
    ...(nullableString(row.preview_storage_key)
      ? { previewStorageKey: nullableString(row.preview_storage_key)! }
      : {}),
    originalFilename: String(row.original_filename),
    declaredMediaType: row.declared_media_type as FileMediaType,
    detectedMediaType: (row.detected_media_type ??
      null) as FileMediaType | null,
    declaredByteCount: Number(row.declared_byte_count),
    byteCount:
      row.byte_count === null || row.byte_count === undefined
        ? null
        : Number(row.byte_count),
    sha256: nullableString(row.sha256),
    uploaderUserId: String(row.uploader_user_id),
    state: row.state as FileAttachment["state"],
    failureCode: nullableString(row.failure_code),
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    preview:
      row.preview_byte_count === null || row.preview_byte_count === undefined
        ? null
        : {
            mediaType: "image/jpeg",
            byteCount: Number(row.preview_byte_count),
            sha256: String(row.preview_sha256),
          },
  };
}

@Injectable()
export class FilesRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    @Inject(MUTATION_RECORDER)
    private readonly mutationRecorder: MutationRecorder,
  ) {}

  async findPreliminaryEvidence(
    database: DatabaseExecutor,
    fileIds: readonly string[],
    machineId?: string,
    readyOnly = false,
  ): Promise<FileAttachment[]> {
    if (!fileIds.length) return [];
    const result = await database.execute(sql`
      select * from file_attachment
      where purpose = 'preliminary_inspection'
        and id in (${sql.join(
          fileIds.map((id) => sql`${id}`),
          sql`, `,
        )})
        ${machineId ? sql`and machine_id = ${machineId}` : sql``}
        ${readyOnly ? sql`and state = 'ready'` : sql``}
    `);
    return rows(result).map((row) =>
      FileAttachmentSchema.parse(fileFromRow(row)),
    );
  }

  async createPendingUpload(input: {
    fileId: string;
    storageKey: string;
    request: CreateFileUploadGrantRequest;
    tokenHash: string;
    expiresAt: Date;
    context: FileActorContext;
  }): Promise<PrivateFileAttachment> {
    return this.connection.transaction(async (database) => {
      const result = await database.execute(sql`
        insert into file_attachment (
          id, machine_id, load_id, purpose, storage_key, original_filename,
          declared_media_type, declared_byte_count, uploader_user_id
        ) values (
          ${input.fileId},
          ${input.request.target.type === "machine" ? input.request.target.id : null},
          ${input.request.target.type === "load" ? input.request.target.id : null},
          ${input.request.purpose}, ${input.storageKey},
          ${input.request.originalFilename}, ${input.request.declaredMediaType},
          ${input.request.declaredByteCount}, ${input.context.actorUserId}
        ) returning *
      `);
      await database.execute(sql`
        insert into file_access_grant (
          id, file_id, operation, token_hash, issued_to_user_id,
          issued_session_id, expires_at
        ) values (
          ${randomUUID()}, ${input.fileId}, 'upload', ${input.tokenHash},
          ${input.context.actorUserId}, ${input.context.sessionId}, ${input.expiresAt}
        )
      `);
      await this.activity(
        database,
        input.fileId,
        "upload_grant_created",
        input.context,
      );
      await this.mutationRecorder.record(database, {
        actorKind: "user",
        actorUserId: input.context.actorUserId,
        action: "files.attachment.requested",
        targetType: "file",
        targetId: input.fileId,
        requestId: input.context.requestId,
        summary: {
          changedFields: ["target", "purpose", "media_type", "byte_count"],
          outcome: "pending_upload",
        },
      });
      return fileFromRow(rows(result)[0]!);
    });
  }

  async find(fileId: string): Promise<PrivateFileAttachment | undefined> {
    return this.findWith(this.connection.database, fileId);
  }

  async list(target: FileTarget): Promise<PrivateFileAttachment[]> {
    const result = await this.connection.database.execute(
      target.type === "machine"
        ? sql`select * from file_attachment where machine_id = ${target.id} order by created_at desc`
        : sql`select * from file_attachment where load_id = ${target.id} order by created_at desc`,
    );
    return rows(result).map(fileFromRow);
  }

  async findIntakeEvidence(
    database: DatabaseExecutor,
    fileIds: string[],
    loadId?: string,
  ): Promise<IntakeFileEvidence[]> {
    if (!fileIds.length) return [];
    const result = await database.execute(sql`
      select f.id, f.original_filename, f.detected_media_type, f.state,
             f.preview_storage_key, f.sha256, f.byte_count
      from file_attachment f
      where f.purpose = 'intake_evidence'
        and f.id in (${sql.join(
          fileIds.map((fileId) => sql`${fileId}`),
          sql`, `,
        )})
        ${loadId ? sql`and f.load_id = ${loadId}` : sql``}
    `);
    return rows(result).map((row) => ({
      id: String(row.id),
      originalFilename: String(row.original_filename),
      detectedMediaType: (row.detected_media_type ??
        null) as FileMediaType | null,
      state: row.state as FileAttachment["state"],
      ...(nullableString(row.preview_storage_key)
        ? { previewStorageKey: nullableString(row.preview_storage_key)! }
        : {}),
      ...(nullableString(row.sha256)
        ? { sha256: nullableString(row.sha256)! }
        : {}),
      ...(row.byte_count === null || row.byte_count === undefined
        ? {}
        : { byteCount: Number(row.byte_count) }),
    }));
  }

  async findIntakeAnalysisEvidence(
    database: DatabaseExecutor,
    fileIds: string[],
    loadId: string,
  ): Promise<IntakeAnalysisEvidence[]> {
    if (!fileIds.length) return [];
    const result = await database.execute(sql`
      select f.id, f.original_filename, f.detected_media_type, f.state,
             f.preview_storage_key, f.preview_byte_count, f.preview_sha256,
             f.storage_key, f.byte_count, f.sha256
      from file_attachment f
      where f.purpose = 'intake_evidence' and f.state = 'ready'
        and f.load_id = ${loadId}
        and f.id in (${sql.join(
          fileIds.map((fileId) => sql`${fileId}`),
          sql`, `,
        )})
    `);
    return rows(result).map((row) => ({
      id: String(row.id),
      originalFilename: String(row.original_filename),
      detectedMediaType: row.detected_media_type as FileMediaType,
      state: row.state as FileAttachment["state"],
      storageKey: String(row.storage_key),
      byteCount: Number(row.byte_count),
      sha256: String(row.sha256),
      previewByteCount:
        row.preview_byte_count == null ? null : Number(row.preview_byte_count),
      previewSha256: nullableString(row.preview_sha256),
      ...(nullableString(row.preview_storage_key)
        ? { previewStorageKey: nullableString(row.preview_storage_key)! }
        : {}),
    }));
  }

  async consumeGrant(input: {
    fileId: string;
    operation: "upload" | "download" | "preview";
    tokenHash: string;
    actorUserId: string;
    sessionId: string;
    uploadLeaseExpiresAt?: Date;
  }): Promise<{ id: string; fileVersion: number } | undefined> {
    if (input.operation === "upload") {
      const result = await this.connection.database.execute(sql`
        with consumed as (
          update file_access_grant g set consumed_at = now()
          where g.file_id = ${input.fileId}
            and g.operation = 'upload'
            and g.token_hash = ${input.tokenHash}
            and g.issued_to_user_id = ${input.actorUserId}
            and g.issued_session_id = ${input.sessionId}
            and g.consumed_at is null
            and g.expires_at > now()
            and exists (
              select 1 from file_attachment available
              where available.id = g.file_id
                and available.state = 'pending_upload'
                and (
                  available.upload_lease_id is null
                  or available.upload_lease_expires_at <= now()
                )
            )
          returning g.id
        )
        update file_attachment f set
          upload_lease_id = consumed.id,
          upload_lease_expires_at = ${input.uploadLeaseExpiresAt},
          version = f.version + 1,
          updated_at = now()
        from consumed
        where f.id = ${input.fileId} and f.state = 'pending_upload'
          and (f.upload_lease_id is null or f.upload_lease_expires_at <= now())
        returning consumed.id as lease_id, f.version
      `);
      const row = rows(result)[0];
      return row
        ? { id: String(row.lease_id), fileVersion: Number(row.version) }
        : undefined;
    }
    const result = await this.connection.database.execute(sql`
      update file_access_grant g set consumed_at = now()
      where g.file_id = ${input.fileId}
        and g.operation = ${input.operation}
        and g.token_hash = ${input.tokenHash}
        and g.issued_to_user_id = ${input.actorUserId}
        and g.issued_session_id = ${input.sessionId}
        and g.consumed_at is null
        and g.expires_at > now()
        and exists (
          select 1 from file_attachment f
          where f.id = g.file_id and f.state = 'ready'
        )
      returning g.id
    `);
    const row = rows(result)[0];
    return row ? { id: String(row.id), fileVersion: 0 } : undefined;
  }

  async markReady(
    fileId: string,
    metadata: {
      mediaType: FileMediaType;
      byteCount: number;
      sha256: string;
    },
    lease: { id: string; fileVersion: number },
    context: FileActorContext,
    preview?: { storageKey: string; byteCount: number; sha256: string },
  ): Promise<PrivateFileAttachment | undefined> {
    return this.connection.transaction(async (database) => {
      const result = await database.execute(sql`
        update file_attachment set
          detected_media_type = ${metadata.mediaType},
          byte_count = ${metadata.byteCount},
          sha256 = ${metadata.sha256},
          preview_storage_key = ${preview?.storageKey ?? null},
          preview_byte_count = ${preview?.byteCount ?? null},
          preview_sha256 = ${preview?.sha256 ?? null},
          state = 'ready', failure_code = null,
          upload_lease_id = null, upload_lease_expires_at = null,
          version = version + 1, updated_at = now()
        where id = ${fileId} and state = 'pending_upload'
          and upload_lease_id = ${lease.id} and version = ${lease.fileVersion}
        returning *
      `);
      const row = rows(result)[0];
      if (!row) return undefined;
      await this.activity(database, fileId, "upload_ready", context);
      await this.mutationRecorder.record(database, {
        actorKind: "user",
        actorUserId: context.actorUserId,
        action: "files.attachment.ready",
        targetType: "file",
        targetId: fileId,
        requestId: context.requestId,
        summary: {
          changedFields: [
            "state",
            "detected_media_type",
            "byte_count",
            "checksum",
          ],
          outcome: "ready",
        },
      });
      return fileFromRow(row);
    });
  }

  async markFailed(
    fileId: string,
    failureCode: string,
    lease: { id: string; fileVersion: number },
    context: FileActorContext,
  ): Promise<void> {
    await this.connection.transaction(async (database) => {
      const result = await database.execute(sql`
        update file_attachment set
          state = 'failed', failure_code = ${failureCode},
          upload_lease_id = null, upload_lease_expires_at = null,
          version = version + 1, updated_at = now()
        where id = ${fileId} and state = 'pending_upload'
          and upload_lease_id = ${lease.id} and version = ${lease.fileVersion}
        returning id
      `);
      if (rows(result).length) {
        await this.activity(database, fileId, "upload_failed", context);
        await this.mutationRecorder.record(database, {
          actorKind: "user",
          actorUserId: context.actorUserId,
          action: "files.attachment.failed",
          targetType: "file",
          targetId: fileId,
          requestId: context.requestId,
          summary: {
            changedFields: ["state", "failure_code"],
            outcome: "failed",
          },
        });
      }
    });
  }

  async createDownloadGrant(input: {
    fileId: string;
    tokenHash: string;
    expiresAt: Date;
    context: FileActorContext;
  }): Promise<void> {
    await this.connection.transaction(async (database) => {
      await database.execute(sql`
        insert into file_access_grant (
          id, file_id, operation, token_hash, issued_to_user_id,
          issued_session_id, expires_at
        ) values (
          ${randomUUID()}, ${input.fileId}, 'download', ${input.tokenHash},
          ${input.context.actorUserId}, ${input.context.sessionId}, ${input.expiresAt}
        )
      `);
      await this.activity(
        database,
        input.fileId,
        "download_grant_created",
        input.context,
      );
    });
  }

  async createPreviewGrant(input: {
    fileId: string;
    tokenHash: string;
    expiresAt: Date;
    context: FileActorContext;
  }): Promise<void> {
    await this.connection.transaction(async (database) => {
      await database.execute(sql`
        insert into file_access_grant (
          id, file_id, operation, token_hash, issued_to_user_id,
          issued_session_id, expires_at
        ) values (
          ${randomUUID()}, ${input.fileId}, 'preview', ${input.tokenHash},
          ${input.context.actorUserId}, ${input.context.sessionId}, ${input.expiresAt}
        )
      `);
      await this.activity(
        database,
        input.fileId,
        "preview_grant_created",
        input.context,
      );
    });
  }

  async recordDownload(
    fileId: string,
    context: FileActorContext,
  ): Promise<void> {
    await this.activity(
      this.connection.database,
      fileId,
      "downloaded",
      context,
    );
  }

  async recordPreview(
    fileId: string,
    context: FileActorContext,
  ): Promise<void> {
    await this.activity(this.connection.database, fileId, "previewed", context);
  }

  async incomplete(): Promise<PrivateFileAttachment[]> {
    const result = await this.connection.database.execute(sql`
      select * from file_attachment
      where state in ('pending_upload', 'failed')
      order by created_at
    `);
    return rows(result).map(fileFromRow);
  }

  async abandon(
    fileId: string,
    expectedVersion: number,
    context: FileActorContext,
  ): Promise<PrivateFileAttachment | undefined> {
    return this.connection.transaction(async (database) => {
      const result = await database.execute(sql`
        update file_attachment f set
          state = 'abandoned', version = version + 1, updated_at = now()
        where f.id = ${fileId} and f.version = ${expectedVersion}
          and (
            f.state = 'failed'
            or (
            f.state = 'pending_upload'
            and (f.upload_lease_id is null or f.upload_lease_expires_at <= now())
            and not exists (
              select 1 from file_access_grant g
              where g.file_id = f.id and g.operation = 'upload'
                and g.consumed_at is null and g.expires_at > now()
            )
          )
          )
        returning *
      `);
      const row = rows(result)[0];
      if (!row) return undefined;
      await this.activity(database, fileId, "abandoned", context);
      await this.mutationRecorder.record(database, {
        actorKind: "user",
        actorUserId: context.actorUserId,
        action: "files.attachment.abandoned",
        targetType: "file",
        targetId: fileId,
        requestId: context.requestId,
        summary: { changedFields: ["state"], outcome: "abandoned" },
      });
      return fileFromRow(row);
    });
  }

  private async findWith(
    database: DatabaseExecutor,
    fileId: string,
  ): Promise<PrivateFileAttachment | undefined> {
    const result = await database.execute(
      sql`select * from file_attachment where id = ${fileId}`,
    );
    const row = rows(result)[0];
    return row ? fileFromRow(row) : undefined;
  }

  private async activity(
    database: DatabaseExecutor,
    fileId: string,
    action: string,
    context: FileActorContext,
  ): Promise<void> {
    await database.execute(sql`
      insert into file_activity (id, file_id, action, actor_user_id, request_id)
      values (${randomUUID()}, ${fileId}, ${action}, ${context.actorUserId}, ${context.requestId})
    `);
  }
}
