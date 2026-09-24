import { Inject, Injectable } from "@nestjs/common";
import {
  QrLabelSchema,
  type QrLabel,
  type QrLabelActivityAction,
} from "@simply-clean/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@simply-clean/database";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { DATABASE_CONNECTION } from "../../../platform/database.module.js";
import {
  IDEMPOTENCY_COORDINATOR,
  MUTATION_RECORDER,
  IdempotencyKeyReuseError,
  IdempotencyRequestInProgressError,
  requestFingerprint,
  type IdempotencyCoordinator,
  type MutationRecorder,
} from "../../operations/operations.ports.js";

export interface QrActorContext {
  actorUserId: string;
  requestId: string;
  idempotencyKey?: string;
}

export type QrLabelMutationResult =
  | { status: "updated"; value: QrLabel }
  | { status: "not_found" }
  | { status: "version_conflict" }
  | { status: "active_label_exists" };

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

function labelFromRow(row: Row): QrLabel {
  return QrLabelSchema.parse({
    id: row.id,
    machineId: row.machine_id,
    fallbackCode: row.fallback_code,
    state: row.state,
    version: Number(row.version),
    issuedByUserId: row.issued_by_user_id,
    revokedByUserId: row.revoked_by_user_id ?? null,
    issuedAt: iso(row.issued_at),
    revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
  });
}

@Injectable()
export class QrLabelRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    @Inject(MUTATION_RECORDER)
    private readonly mutationRecorder: MutationRecorder,
    @Inject(IDEMPOTENCY_COORDINATOR)
    private readonly idempotency: IdempotencyCoordinator,
  ) {}

  async listForMachine(machineId: string): Promise<QrLabel[]> {
    const result = await this.connection.database.execute(sql`
      select * from inventory_qr_label
      where machine_id = ${machineId}
      order by issued_at desc, id desc
    `);
    return rows(result).map(labelFromRow);
  }

  async findActiveLabelForMachine(
    machineId: string,
  ): Promise<QrLabel | undefined> {
    const result = await this.connection.database.execute(sql`
      select * from inventory_qr_label
      where machine_id = ${machineId} and state = 'active'
    `);
    const row = rows(result)[0];
    return row ? labelFromRow(row) : undefined;
  }

  async create(
    input: { machineId: string; labelId: string; fallbackCode: string },
    context: QrActorContext,
  ): Promise<QrLabelMutationResult> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.qr_label.create",
        { machineId: input.machineId },
        context,
      );
      if (reservation.existingTargetId) {
        const existing = await this.findWith(
          database,
          reservation.existingTargetId,
        );
        return existing
          ? { status: "updated", value: existing }
          : { status: "not_found" };
      }
      const active = await this.findActiveForMachine(database, input.machineId);
      if (active) {
        await this.idempotency.release(database, {
          recordId: reservation.recordId!,
        });
        return { status: "active_label_exists" };
      }
      const result = await database.execute(sql`
        insert into inventory_qr_label (
          id, machine_id, fallback_code, issued_by_user_id
        ) values (
          ${input.labelId}, ${input.machineId}, ${input.fallbackCode},
          ${context.actorUserId}
        )
        returning *
      `);
      const label = labelFromRow(rows(result)[0]!);
      await this.activity(database, label, "created", context);
      await this.record(
        database,
        "inventory.qr_label.created",
        label.id,
        context,
        ["machine_label", "state"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "qr_label",
        targetId: label.id,
      });
      return { status: "updated", value: label };
    });
  }

  async revoke(
    labelId: string,
    expectedVersion: number,
    context: QrActorContext,
  ): Promise<QrLabelMutationResult> {
    return this.connection.transaction(async (database) => {
      const current = await this.findWith(database, labelId, true);
      if (!current || current.state !== "active")
        return { status: "not_found" };
      if (current.version !== expectedVersion) {
        return { status: "version_conflict" };
      }
      const result = await database.execute(sql`
        update inventory_qr_label set
          state = 'revoked', revoked_by_user_id = ${context.actorUserId},
          revoked_at = now(), version = version + 1
        where id = ${labelId} and state = 'active'
          and version = ${expectedVersion}
        returning *
      `);
      const row = rows(result)[0];
      if (!row) return { status: "version_conflict" };
      const label = labelFromRow(row);
      await this.activity(database, label, "revoked", context);
      await this.record(
        database,
        "inventory.qr_label.revoked",
        label.id,
        context,
        ["state"],
      );
      return { status: "updated", value: label };
    });
  }

  async reissue(
    input: {
      machineId: string;
      expectedLabelId: string;
      expectedVersion: number;
      labelId: string;
      fallbackCode: string;
    },
    context: QrActorContext,
  ): Promise<QrLabelMutationResult> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "inventory.qr_label.reissue",
        {
          machineId: input.machineId,
          expectedLabelId: input.expectedLabelId,
          expectedVersion: input.expectedVersion,
        },
        context,
      );
      if (reservation.existingTargetId) {
        const existing = await this.findWith(
          database,
          reservation.existingTargetId,
        );
        return existing
          ? { status: "updated", value: existing }
          : { status: "not_found" };
      }
      const current = await this.findActiveForMachine(
        database,
        input.machineId,
        true,
      );
      if (!current) {
        await this.idempotency.release(database, {
          recordId: reservation.recordId!,
        });
        return { status: "not_found" };
      }
      if (
        current.id !== input.expectedLabelId ||
        current.version !== input.expectedVersion
      ) {
        await this.idempotency.release(database, {
          recordId: reservation.recordId!,
        });
        return { status: "version_conflict" };
      }
      const nextVersion = current.version + 1;
      const revokedResult = await database.execute(sql`
        update inventory_qr_label set
          state = 'revoked', revoked_by_user_id = ${context.actorUserId},
          revoked_at = now(), version = ${nextVersion}
        where id = ${current.id} and state = 'active'
          and version = ${input.expectedVersion}
        returning *
      `);
      const revokedRow = rows(revokedResult)[0];
      if (!revokedRow) {
        await this.idempotency.release(database, {
          recordId: reservation.recordId!,
        });
        return { status: "version_conflict" };
      }
      const revoked = labelFromRow(revokedRow);
      await this.activity(database, revoked, "revoked", context);

      const createdResult = await database.execute(sql`
        insert into inventory_qr_label (
          id, machine_id, fallback_code, state, version, issued_by_user_id
        ) values (
          ${input.labelId}, ${input.machineId}, ${input.fallbackCode}, 'active',
          ${nextVersion}, ${context.actorUserId}
        )
        returning *
      `);
      const created = labelFromRow(rows(createdResult)[0]!);
      await this.activity(database, created, "reissued", context);
      await this.record(
        database,
        "inventory.qr_label.reissued",
        created.id,
        context,
        ["active_label", "state"],
      );
      await this.idempotency.complete(database, {
        recordId: reservation.recordId!,
        targetType: "qr_label",
        targetId: created.id,
      });
      return { status: "updated", value: created };
    });
  }

  async findActiveById(labelId: string): Promise<QrLabel | undefined> {
    const result = await this.connection.database.execute(sql`
      select * from inventory_qr_label
      where id = ${labelId} and state = 'active'
    `);
    const row = rows(result)[0];
    return row ? labelFromRow(row) : undefined;
  }

  async recordPrintedIfActive(
    labelId: string,
    context: QrActorContext,
  ): Promise<QrLabel | undefined> {
    return this.connection.transaction(async (database) => {
      const label = await this.findWith(database, labelId, true);
      if (!label || label.state !== "active") return undefined;
      await this.activity(database, label, "printed", context);
      return label;
    });
  }

  async resolveActive(
    input: { labelId?: string; fallbackCode?: string },
    context: QrActorContext,
  ): Promise<{ labelId: string; machineId: string } | undefined> {
    return this.connection.transaction(async (database) => {
      const predicate = input.labelId
        ? sql`id = ${input.labelId}`
        : sql`fallback_code = ${input.fallbackCode ?? ""}`;
      const result = await database.execute(sql`
        select * from inventory_qr_label
        where ${predicate} and state = 'active'
        for update
      `);
      const row = rows(result)[0];
      if (!row) return undefined;
      const label = labelFromRow(row);
      await this.activity(database, label, "resolved", context);
      return { labelId: label.id, machineId: label.machineId };
    });
  }

  private async findWith(
    database: DatabaseExecutor,
    id: string,
    lock = false,
  ): Promise<QrLabel | undefined> {
    const result = await database.execute(sql`
      select * from inventory_qr_label where id = ${id}
      ${lock ? sql`for update` : sql``}
    `);
    const row = rows(result)[0];
    return row ? labelFromRow(row) : undefined;
  }

  private async findActiveForMachine(
    database: DatabaseExecutor,
    machineId: string,
    lock = false,
  ): Promise<QrLabel | undefined> {
    const result = await database.execute(sql`
      select * from inventory_qr_label
      where machine_id = ${machineId} and state = 'active'
      ${lock ? sql`for update` : sql``}
    `);
    const row = rows(result)[0];
    return row ? labelFromRow(row) : undefined;
  }

  private async activity(
    database: DatabaseExecutor,
    label: QrLabel,
    action: QrLabelActivityAction,
    context: QrActorContext,
  ): Promise<void> {
    await database.execute(sql`
      insert into inventory_qr_label_activity (
        id, label_id, machine_id, action, actor_user_id, request_id
      ) values (
        ${randomUUID()}, ${label.id}, ${label.machineId}, ${action},
        ${context.actorUserId}, ${context.requestId}
      )
    `);
  }

  private record(
    database: DatabaseExecutor,
    action:
      | "inventory.qr_label.created"
      | "inventory.qr_label.revoked"
      | "inventory.qr_label.reissued",
    labelId: string,
    context: QrActorContext,
    changedFields: string[],
  ): Promise<{ auditId: string; jobId: string }> {
    return this.mutationRecorder.record(database, {
      actorKind: "user",
      actorUserId: context.actorUserId,
      action,
      targetType: "qr_label",
      targetId: labelId,
      requestId: context.requestId,
      summary: { changedFields },
    });
  }

  private async reserve(
    database: DatabaseExecutor,
    scope: string,
    fingerprintInput: unknown,
    context: QrActorContext,
  ): Promise<{ recordId?: string; existingTargetId?: string }> {
    if (!context.idempotencyKey) {
      throw new Error("Idempotency-Key is required");
    }
    const reservation = await this.idempotency.reserve(database, {
      scope,
      actorUserId: context.actorUserId,
      rawKey: context.idempotencyKey,
      requestFingerprint: requestFingerprint(fingerprintInput),
    });
    if (reservation.status === "fingerprint_conflict") {
      throw new IdempotencyKeyReuseError();
    }
    if (reservation.status === "in_progress") {
      throw new IdempotencyRequestInProgressError();
    }
    if (reservation.status === "completed") {
      if (reservation.targetType !== "qr_label") {
        throw new IdempotencyKeyReuseError();
      }
      return { existingTargetId: reservation.targetId };
    }
    return { recordId: reservation.recordId };
  }
}
