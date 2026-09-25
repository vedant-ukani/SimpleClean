import { Inject, Injectable } from "@nestjs/common";
import type {
  ApplicationRole,
  IdentitySecurityAction,
  IdentityUser,
} from "@laundrorama/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@laundrorama/database";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { DATABASE_CONNECTION } from "../../platform/database.module.js";
import {
  MUTATION_RECORDER,
  type MutationRecorder,
} from "../operations/operations.ports.js";

interface IdentityRow {
  id: string;
  name: string;
  email: string;
  role: ApplicationRole;
  active: boolean;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowsFromResult(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result.filter(
      (row): row is Record<string, unknown> =>
        typeof row === "object" && row !== null,
    );
  }
  if (typeof result === "object" && result !== null && "rows" in result) {
    const rows = result.rows;
    if (Array.isArray(rows)) {
      return rows.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      );
    }
  }
  return [];
}

function identityFromRow(row: Record<string, unknown>): IdentityUser {
  const value = row as unknown as IdentityRow;
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    role: value.role,
    active: value.active,
    version: value.version,
    createdAt: new Date(value.created_at).toISOString(),
    updatedAt: new Date(value.updated_at).toISOString(),
  };
}

const identitySelect = sql`
  select
    u.id,
    u.name,
    u.email,
    p.role,
    p.active,
    p.version,
    p.created_at,
    p.updated_at
  from identity_profile p
  inner join "user" u on u.id = p.user_id
`;

export type IdentityMutationResult =
  | { status: "updated"; user: IdentityUser }
  | { status: "not_found" }
  | { status: "version_conflict" }
  | { status: "final_owner" };

interface ActivityInput {
  action: IdentitySecurityAction;
  actorUserId?: string;
  subjectUserId?: string;
  requestId: string;
}

@Injectable()
export class IdentityRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    @Inject(MUTATION_RECORDER)
    private readonly mutationRecorder: MutationRecorder,
  ) {}

  async findByUserId(userId: string): Promise<IdentityUser | undefined> {
    const result = await this.connection.database.execute(
      sql`${identitySelect} where p.user_id = ${userId}`,
    );
    const row = rowsFromResult(result)[0];
    return row ? identityFromRow(row) : undefined;
  }

  async list(): Promise<IdentityUser[]> {
    const result = await this.connection.database.execute(
      sql`${identitySelect} order by u.name, u.email`,
    );
    return rowsFromResult(result).map(identityFromRow);
  }

  async createProfile(
    userId: string,
    role: ApplicationRole,
    activity: Omit<ActivityInput, "action" | "subjectUserId">,
  ): Promise<IdentityUser> {
    return this.connection.transaction(async (database) => {
      await database.execute(sql`
        insert into identity_profile (user_id, role, active, version)
        values (${userId}, ${role}, true, 1)
      `);
      await this.recordActivityWith(database, {
        action: "user_created",
        ...activity,
        subjectUserId: userId,
      });
      const created = await this.findWithExecutor(database, userId);
      if (!created) {
        throw new Error("Identity profile was not created");
      }
      return created;
    });
  }

  async changeRole(input: {
    userId: string;
    role: ApplicationRole;
    expectedVersion: number;
    activity: Omit<ActivityInput, "action" | "subjectUserId">;
  }): Promise<IdentityMutationResult> {
    return this.connection.transaction(async (database) => {
      const activeOwnerCount = await this.activeOwnerCount(database);
      const current = await this.lockIdentity(database, input.userId);
      if (!current) {
        return { status: "not_found" };
      }
      if (current.version !== input.expectedVersion) {
        return { status: "version_conflict" };
      }
      if (
        current.active &&
        current.role === "owner_admin" &&
        input.role !== "owner_admin" &&
        activeOwnerCount <= 1
      ) {
        return { status: "final_owner" };
      }
      if (current.role === input.role) {
        return { status: "updated", user: current };
      }
      await database.execute(sql`
        update identity_profile
        set role = ${input.role}, version = version + 1, updated_at = now()
        where user_id = ${input.userId} and version = ${input.expectedVersion}
      `);
      await database.execute(
        sql`delete from "session" where user_id = ${input.userId}`,
      );
      await this.recordActivityWith(database, {
        action: "role_changed",
        ...input.activity,
        subjectUserId: input.userId,
      });
      const updated = await this.findWithExecutor(database, input.userId);
      if (!updated) {
        return { status: "not_found" };
      }
      return { status: "updated", user: updated };
    });
  }

  async changeActive(input: {
    userId: string;
    active: boolean;
    expectedVersion: number;
    activity: Omit<ActivityInput, "action" | "subjectUserId">;
  }): Promise<IdentityMutationResult> {
    return this.connection.transaction(async (database) => {
      const activeOwnerCount = await this.activeOwnerCount(database);
      const current = await this.lockIdentity(database, input.userId);
      if (!current) {
        return { status: "not_found" };
      }
      if (current.version !== input.expectedVersion) {
        return { status: "version_conflict" };
      }
      if (
        current.active &&
        current.role === "owner_admin" &&
        !input.active &&
        activeOwnerCount <= 1
      ) {
        return { status: "final_owner" };
      }
      if (current.active === input.active) {
        return { status: "updated", user: current };
      }
      await database.execute(sql`
        update identity_profile
        set active = ${input.active}, version = version + 1, updated_at = now()
        where user_id = ${input.userId} and version = ${input.expectedVersion}
      `);
      await database.execute(
        sql`delete from "session" where user_id = ${input.userId}`,
      );
      await this.recordActivityWith(database, {
        action: input.active ? "user_activated" : "user_deactivated",
        ...input.activity,
        subjectUserId: input.userId,
      });
      const updated = await this.findWithExecutor(database, input.userId);
      if (!updated) {
        return { status: "not_found" };
      }
      return { status: "updated", user: updated };
    });
  }

  async revokeSessions(
    userId: string,
    activity: Omit<ActivityInput, "action" | "subjectUserId">,
  ): Promise<boolean> {
    return this.connection.transaction(async (database) => {
      const result = await database.execute(sql`
        select user_id from identity_profile where user_id = ${userId} for update
      `);
      if (rowsFromResult(result).length === 0) {
        return false;
      }
      await database.execute(
        sql`delete from "session" where user_id = ${userId}`,
      );
      await this.recordActivityWith(database, {
        action: "sessions_revoked",
        ...activity,
        subjectUserId: userId,
      });
      return true;
    });
  }

  async recordProvisioning(
    userId: string,
    activity: Omit<ActivityInput, "action" | "subjectUserId">,
  ): Promise<void> {
    await this.connection.transaction(async (database) => {
      await database.execute(
        sql`delete from "session" where user_id = ${userId}`,
      );
      await this.recordActivityWith(database, {
        action: "user_provisioned",
        ...activity,
        subjectUserId: userId,
      });
    });
  }

  async recordActivity(input: ActivityInput): Promise<void> {
    await this.connection.transaction((database) =>
      this.recordActivityWith(database, input),
    );
  }

  private async recordActivityWith(
    database: DatabaseExecutor,
    input: ActivityInput,
  ): Promise<void> {
    await database.execute(sql`
      insert into identity_security_activity (
        id,
        action,
        actor_user_id,
        subject_user_id,
        request_id
      ) values (
        ${randomUUID()},
        ${input.action},
        ${input.actorUserId ?? null},
        ${input.subjectUserId ?? null},
        ${input.requestId}
      )
    `);
    if (
      input.action !== "authorization_denied" &&
      input.action !== "signed_in" &&
      input.action !== "signed_out"
    ) {
      const centralAction = {
        user_created: "identity.user.created",
        role_changed: "identity.user.role_changed",
        user_activated: "identity.user.activated",
        user_deactivated: "identity.user.deactivated",
        sessions_revoked: "identity.user.sessions_revoked",
        user_provisioned: "identity.user.provisioned",
      } as const;
      const action = centralAction[input.action];
      await this.mutationRecorder.record(database, {
        actorKind: input.actorUserId ? "user" : "system",
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        action,
        targetType: "user",
        targetId: input.subjectUserId ?? input.actorUserId!,
        requestId: input.requestId,
        summary: {
          changedFields:
            input.action === "role_changed"
              ? ["role", "sessions"]
              : input.action === "user_activated" ||
                  input.action === "user_deactivated"
                ? ["active", "sessions"]
                : input.action === "sessions_revoked"
                  ? ["sessions"]
                  : input.action === "user_provisioned"
                    ? ["profile", "credentials", "sessions"]
                    : ["profile"],
          outcome: input.action,
        },
      });
    }
  }

  private async findWithExecutor(
    database: DatabaseExecutor,
    userId: string,
  ): Promise<IdentityUser | undefined> {
    const result = await database.execute(
      sql`${identitySelect} where p.user_id = ${userId}`,
    );
    const row = rowsFromResult(result)[0];
    return row ? identityFromRow(row) : undefined;
  }

  private async lockIdentity(
    database: DatabaseExecutor,
    userId: string,
  ): Promise<IdentityUser | undefined> {
    const result = await database.execute(
      sql`${identitySelect} where p.user_id = ${userId} for update`,
    );
    const row = rowsFromResult(result)[0];
    return row ? identityFromRow(row) : undefined;
  }

  private async activeOwnerCount(database: DatabaseExecutor): Promise<number> {
    const result = await database.execute(sql`
      select user_id
      from identity_profile
      where role = 'owner_admin' and active = true
      for update
    `);
    return rowsFromResult(result).length;
  }
}
