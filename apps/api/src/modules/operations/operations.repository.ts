import { Inject, Injectable } from "@nestjs/common";
import {
  AuditEntrySchema,
  OperationsActionSchema,
  OperationsTargetTypeSchema,
  OutboxJobSchema,
  SafeMutationSummarySchema,
  type AuditEntry,
  type AuditListQuery,
  type AuditListResponse,
  type JobListQuery,
  type JobListResponse,
  type OutboxJob,
} from "@simply-clean/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@simply-clean/database";
import { sql, type SQL } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import { DATABASE_CONNECTION } from "../../platform/database.module.js";
import type {
  DispatchableInternalEvent,
  IdempotencyCoordinator,
  IdempotencyReservation,
  MutationRecordInput,
  MutationRecorder,
} from "./operations.ports.js";

type Row = Record<string, unknown>;

function rows(result: unknown): Row[] {
  if (Array.isArray(result)) {
    return result.filter(
      (row): row is Row => typeof row === "object" && row !== null,
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

function auditFromRow(row: Row): AuditEntry {
  return AuditEntrySchema.parse({
    id: row.id,
    actorKind: row.actor_kind,
    actorUserId: row.actor_user_id ?? null,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    requestId: row.request_id,
    summary: row.safe_summary,
    createdAt: iso(row.created_at),
  });
}

function jobFromRow(row: Row): OutboxJob {
  return OutboxJobSchema.parse({
    id: row.id,
    eventType: row.event_type,
    targetType: row.target_type,
    targetId: row.target_id,
    state: row.state,
    attemptCount: Number(row.attempt_count),
    availableAt: iso(row.available_at),
    leaseExpiresAt: row.lease_expires_at ? iso(row.lease_expires_at) : null,
    errorCode: nullableString(row.error_code),
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

export interface ClaimedJob extends DispatchableInternalEvent {
  leaseId: string;
  version: number;
  attemptCount: number;
}

@Injectable()
export class OperationsRepository
  implements MutationRecorder, IdempotencyCoordinator
{
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  async record(
    database: DatabaseExecutor,
    rawInput: MutationRecordInput,
  ): Promise<{ auditId: string; jobId: string }> {
    const action = OperationsActionSchema.parse(rawInput.action);
    const targetType = OperationsTargetTypeSchema.parse(rawInput.targetType);
    const summary = SafeMutationSummarySchema.parse(rawInput.summary);
    if ((rawInput.actorKind === "user") !== Boolean(rawInput.actorUserId)) {
      throw new Error("Invalid mutation actor");
    }
    const auditId = randomUUID();
    const jobId = randomUUID();
    const summaryJson = JSON.stringify(summary);
    await database.execute(sql`
      insert into operations_audit_entry (
        id, actor_kind, actor_user_id, action, target_type, target_id,
        request_id, safe_summary
      ) values (
        ${auditId}, ${rawInput.actorKind}, ${rawInput.actorUserId ?? null},
        ${action}, ${targetType}, ${rawInput.targetId}, ${rawInput.requestId},
        ${summaryJson}::jsonb
      )
    `);
    await database.execute(sql`
      insert into platform_outbox_job (
        id, event_type, target_type, target_id, actor_kind, actor_user_id,
        request_id, safe_summary
      ) values (
        ${jobId}, ${action}, ${targetType}, ${rawInput.targetId},
        ${rawInput.actorKind}, ${rawInput.actorUserId ?? null},
        ${rawInput.requestId}, ${summaryJson}::jsonb
      )
    `);
    return { auditId, jobId };
  }

  async reserve(
    database: DatabaseExecutor,
    input: {
      scope: string;
      actorUserId: string;
      rawKey: string;
      requestFingerprint: string;
    },
  ): Promise<IdempotencyReservation> {
    const keyHash = createHash("sha256").update(input.rawKey).digest("hex");
    const recordId = randomUUID();
    const inserted = await database.execute(sql`
      insert into operations_idempotency_record (
        id, scope, actor_user_id, key_hash, request_fingerprint
      ) values (
        ${recordId}, ${input.scope}, ${input.actorUserId}, ${keyHash},
        ${input.requestFingerprint}
      )
      on conflict (scope, actor_user_id, key_hash) do nothing
      returning id
    `);
    if (rows(inserted).length) return { status: "reserved", recordId };

    const existing = await database.execute(sql`
      select request_fingerprint, state, target_type, target_id
      from operations_idempotency_record
      where scope = ${input.scope} and actor_user_id = ${input.actorUserId}
        and key_hash = ${keyHash}
      for update
    `);
    const row = rows(existing)[0];
    if (!row) return { status: "in_progress" };
    if (row.request_fingerprint !== input.requestFingerprint) {
      return { status: "fingerprint_conflict" };
    }
    if (row.state === "completed" && row.target_type && row.target_id) {
      return {
        status: "completed",
        targetType: String(row.target_type),
        targetId: String(row.target_id),
      };
    }
    return { status: "in_progress" };
  }

  async complete(
    database: DatabaseExecutor,
    input: {
      recordId: string;
      targetType: "load" | "location" | "machine" | "qr_label" | "import_run";
      targetId: string;
    },
  ): Promise<void> {
    const result = await database.execute(sql`
      update operations_idempotency_record set
        state = 'completed', target_type = ${input.targetType},
        target_id = ${input.targetId}, completed_at = now()
      where id = ${input.recordId} and state = 'in_progress'
      returning id
    `);
    if (!rows(result).length) throw new Error("Idempotency completion failed");
  }

  async release(
    database: DatabaseExecutor,
    input: { recordId: string },
  ): Promise<void> {
    const result = await database.execute(sql`
      delete from operations_idempotency_record
      where id = ${input.recordId} and state = 'in_progress'
      returning id
    `);
    if (!rows(result).length) throw new Error("Idempotency release failed");
  }

  async listAudit(input: AuditListQuery): Promise<AuditListResponse> {
    const conditions: SQL[] = [];
    if (input.action) conditions.push(sql`action = ${input.action}`);
    if (input.targetType)
      conditions.push(sql`target_type = ${input.targetType}`);
    if (input.targetId) conditions.push(sql`target_id = ${input.targetId}`);
    if (input.actorUserId)
      conditions.push(sql`actor_user_id = ${input.actorUserId}`);
    if (input.requestId) conditions.push(sql`request_id = ${input.requestId}`);
    const where = conditions.length
      ? sql`where ${sql.join(conditions, sql` and `)}`
      : sql``;
    const offset = (input.page - 1) * input.pageSize;
    const [countResult, entryResult] = await Promise.all([
      this.connection.database.execute(
        sql`select count(*)::integer as total from operations_audit_entry ${where}`,
      ),
      this.connection.database.execute(sql`
        select * from operations_audit_entry ${where}
        order by created_at desc, id desc
        limit ${input.pageSize} offset ${offset}
      `),
    ]);
    return {
      entries: rows(entryResult).map(auditFromRow),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(rows(countResult)[0]?.total ?? 0),
    };
  }

  async listJobs(input: JobListQuery): Promise<JobListResponse> {
    const where = input.state ? sql`where state = ${input.state}` : sql``;
    const offset = (input.page - 1) * input.pageSize;
    const [countResult, jobResult] = await Promise.all([
      this.connection.database.execute(
        sql`select count(*)::integer as total from platform_outbox_job ${where}`,
      ),
      this.connection.database.execute(sql`
        select * from platform_outbox_job ${where}
        order by created_at desc, id desc
        limit ${input.pageSize} offset ${offset}
      `),
    ]);
    return {
      jobs: rows(jobResult).map(jobFromRow),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(rows(countResult)[0]?.total ?? 0),
    };
  }

  async claim(
    now: Date,
    leaseSeconds: number,
    maximumAttempts: number,
    limit: number,
  ): Promise<ClaimedJob[]> {
    return this.connection.transaction(async (database) => {
      const candidates = await database.execute(sql`
        select id, state, attempt_count from platform_outbox_job
        where (
          (state in ('queued', 'retry_wait') and available_at <= ${now})
          or (state = 'processing' and lease_expires_at <= ${now})
        )
        order by available_at, created_at, id
        for update skip locked
        limit ${limit}
      `);
      const claimed: ClaimedJob[] = [];
      for (const candidate of rows(candidates)) {
        if (
          candidate.state === "processing" &&
          Number(candidate.attempt_count) >= maximumAttempts
        ) {
          await database.execute(sql`
            update platform_outbox_job set
              state = 'dead_letter', lease_id = null, lease_expires_at = null,
              error_code = 'handler_failed', available_at = ${now},
              version = version + 1, updated_at = ${now}
            where id = ${String(candidate.id)} and state = 'processing'
              and lease_expires_at <= ${now}
          `);
          continue;
        }
        const leaseId = randomUUID();
        const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1_000);
        const result = await database.execute(sql`
          update platform_outbox_job set
            state = 'processing', lease_id = ${leaseId},
            lease_expires_at = ${leaseExpiresAt}, error_code = null,
            attempt_count = attempt_count + 1,
            version = version + 1, updated_at = ${now}
          where id = ${String(candidate.id)}
          returning *
        `);
        const row = rows(result)[0];
        if (!row) continue;
        claimed.push({
          id: String(row.id),
          eventType: OperationsActionSchema.parse(row.event_type),
          targetType: OperationsTargetTypeSchema.parse(row.target_type),
          targetId: String(row.target_id),
          actorKind: row.actor_kind as ClaimedJob["actorKind"],
          actorUserId: nullableString(row.actor_user_id),
          requestId: String(row.request_id),
          summary: SafeMutationSummarySchema.parse(row.safe_summary),
          leaseId,
          version: Number(row.version),
          attemptCount: Number(row.attempt_count),
        });
      }
      return claimed;
    });
  }

  async markDelivered(job: ClaimedJob, now: Date): Promise<boolean> {
    const result = await this.connection.database.execute(sql`
      update platform_outbox_job set
        state = 'delivered',
        lease_id = null, lease_expires_at = null, error_code = null,
        delivered_at = ${now}, version = version + 1, updated_at = ${now}
      where id = ${job.id} and state = 'processing'
        and lease_id = ${job.leaseId} and version = ${job.version}
        and lease_expires_at > ${now}
      returning id
    `);
    return rows(result).length === 1;
  }

  async markFailed(
    job: ClaimedJob,
    input: {
      now: Date;
      nextAvailableAt: Date;
      maximumAttempts: number;
      errorCode: string;
    },
  ): Promise<boolean> {
    const deadLetter = job.attemptCount >= input.maximumAttempts;
    const result = await this.connection.database.execute(sql`
      update platform_outbox_job set
        state = ${deadLetter ? "dead_letter" : "retry_wait"},
        available_at = ${deadLetter ? input.now : input.nextAvailableAt},
        lease_id = null, lease_expires_at = null,
        error_code = ${input.errorCode}, version = version + 1,
        updated_at = ${input.now}
      where id = ${job.id} and state = 'processing'
        and lease_id = ${job.leaseId} and version = ${job.version}
        and lease_expires_at > ${input.now}
      returning id
    `);
    return rows(result).length === 1;
  }

  async requeue(
    jobId: string,
    expectedVersion: number,
    context: { actorUserId: string; requestId: string },
    recorder: MutationRecorder,
  ): Promise<OutboxJob | undefined> {
    return this.connection.transaction(async (database) => {
      const result = await database.execute(sql`
        update platform_outbox_job set
          state = 'queued', attempt_count = 0, available_at = now(),
          lease_id = null, lease_expires_at = null, error_code = null,
          delivered_at = null, version = version + 1, updated_at = now()
        where id = ${jobId} and state = 'dead_letter'
          and version = ${expectedVersion}
        returning *
      `);
      const row = rows(result)[0];
      if (!row) return undefined;
      await recorder.record(database, {
        actorKind: "user",
        actorUserId: context.actorUserId,
        action: "operations.job.requeued",
        targetType: "outbox_job",
        targetId: jobId,
        requestId: context.requestId,
        summary: {
          changedFields: ["state", "attempt_count"],
          outcome: "requeued",
        },
      });
      return jobFromRow(row);
    });
  }
}
