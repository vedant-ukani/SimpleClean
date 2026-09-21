import { Inject, Injectable } from "@nestjs/common";
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

export interface FileActorContext {
  actorUserId: string;
  sessionId: string;
  requestId: string;
}

export interface PrivateFileAttachment extends FileAttachment {
  storageKey: string;
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
  };
}

@Injectable()
export class FilesRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

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

  async consumeGrant(input: {
    fileId: string;
    operation: "upload" | "download";
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
        and g.operation = 'download'
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
  ): Promise<PrivateFileAttachment | undefined> {
    return this.connection.transaction(async (database) => {
      const result = await database.execute(sql`
        update file_attachment set
          detected_media_type = ${metadata.mediaType},
          byte_count = ${metadata.byteCount},
          sha256 = ${metadata.sha256},
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
