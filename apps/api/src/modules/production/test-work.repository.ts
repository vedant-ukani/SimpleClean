import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  IdentityUser,
  Machine,
  ProductionSpecialty,
  TestWorkDetail,
  TestQueueResponse,
  TestStepResult,
  TestSession,
  TestSessionEvent,
  TestSessionItemState,
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
import { latestPassingInitialBearing } from "./production.repository.js";
import { summarizeSessionTime } from "./session-timing.js";

type Row = Record<string, unknown>;
type MutationContext = {
  actorUserId: string;
  requestId: string;
  idempotencyKey: string;
};
function rows(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  return value && typeof value === "object" && "rows" in value
    ? rows(value.rows)
    : [];
}
function iso(value: unknown): string {
  return new Date(value as Date | string).toISOString();
}
function nullable(value: unknown): string | null {
  return value == null ? null : String(value);
}

@Injectable()
export class TestWorkRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    @Inject(INVENTORY_OPERATIONS)
    private readonly inventory: InventoryOperations,
    @Inject(FILES_OPERATIONS) private readonly files: FilesOperations,
    @Inject(MUTATION_RECORDER) private readonly recorder: MutationRecorder,
    @Inject(IDEMPOTENCY_COORDINATOR)
    private readonly idempotency: IdempotencyCoordinator,
  ) {}

  async createOnRepairable(
    database: DatabaseExecutor,
    machine: Machine,
    actor: Pick<MutationContext, "actorUserId" | "requestId">,
  ): Promise<void> {
    if (machine.machineType !== "washer" && machine.machineType !== "dryer")
      return;
    const id = randomUUID();
    const inserted = rows(
      await database.execute(sql`
      insert into production_test_work_order(id, machine_id, machine_type, state)
      values (${id}, ${machine.id}, ${machine.machineType}, 'queued')
      on conflict do nothing returning id
    `),
    );
    if (!inserted.length) return;
    await this.record(
      database,
      "production.test_work_order.created",
      "production_test_work_order",
      id,
      actor,
      ["state"],
      "queued",
    );
  }

  async cancelQueuedForMachine(
    database: DatabaseExecutor,
    machineId: string,
    actor: Pick<MutationContext, "actorUserId" | "requestId">,
  ): Promise<void> {
    const cancelled = rows(
      await database.execute(sql`
      update production_test_work_order set state = 'cancelled', completed_at = now(), version = version + 1
      where machine_id = ${machineId} and state = 'queued' and completed_at is null returning id
    `),
    );
    for (const row of cancelled)
      await this.record(
        database,
        "production.test_work_order.cancelled",
        "production_test_work_order",
        String(row.id),
        actor,
        ["state"],
        "cancelled",
      );
  }

  async specialties(userId: string): Promise<ProductionSpecialty[]> {
    return this.specialtiesWith(this.connection.database, userId);
  }
  private async specialtiesWith(
    database: DatabaseExecutor,
    userId: string,
  ): Promise<ProductionSpecialty[]> {
    return rows(
      await database.execute(
        sql`select machine_type from production_worker_specialty where user_id = ${userId} order by machine_type`,
      ),
    ).map((row) => String(row.machine_type) as ProductionSpecialty);
  }
  async allSpecialties(): Promise<
    { userId: string; specialties: ProductionSpecialty[] }[]
  > {
    const all = rows(
      await this.connection.database.execute(
        sql`select user_id, machine_type from production_worker_specialty order by user_id, machine_type`,
      ),
    );
    const byUser = new Map<string, ProductionSpecialty[]>();
    for (const row of all) {
      const id = String(row.user_id);
      byUser.set(id, [
        ...(byUser.get(id) ?? []),
        String(row.machine_type) as ProductionSpecialty,
      ]);
    }
    return [...byUser].map(([userId, specialties]) => ({
      userId,
      specialties,
    }));
  }
  async setSpecialties(
    userId: string,
    specialties: ProductionSpecialty[],
    actor: MutationContext,
  ): Promise<ProductionSpecialty[]> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.worker_specialty.updated",
        "production_worker_specialty",
        { userId, specialties },
        actor,
      );
      if (reservation.replay) return this.specialtiesWith(database, userId);
      await database.execute(
        sql`delete from production_worker_specialty where user_id = ${userId}`,
      );
      for (const specialty of specialties)
        await database.execute(sql`
        insert into production_worker_specialty(user_id, machine_type, assigned_by_user_id)
        values (${userId}, ${specialty}, ${actor.actorUserId})
      `);
      const openSession = rows(
        await database.execute(sql`
        select id, specialty, version from production_test_session
        where worker_user_id = ${userId} and completed_at is null limit 1
      `),
      )[0];
      if (
        openSession &&
        (specialties.length !== 1 || specialties[0] !== openSession.specialty)
      )
        await this.closeSessionWith(
          database,
          String(openSession.id),
          Number(openSession.version),
          actor,
        );
      await this.record(
        database,
        "production.worker_specialty.updated",
        "production_worker_specialty",
        userId,
        actor,
        ["specialties"],
        "updated",
      );
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_worker_specialty",
        userId,
      );
      return this.specialtiesWith(database, userId);
    });
  }

  async queue(
    identity: IdentityUser,
    includeCompleted = false,
  ): Promise<TestQueueResponse> {
    const specialties =
      identity.role === "owner_admin"
        ? []
        : await this.specialties(identity.id);
    const orderRows = rows(
      await this.connection.database.execute(sql`
      select id from production_test_work_order
      where ${includeCompleted && identity.role === "owner_admin" ? sql`true` : sql`completed_at is null`}
      order by queued_at, id
    `),
    );
    const orders: TestWorkDetail[] = [];
    for (const row of orderRows) {
      const detail = await this.detailWith(
        this.connection.database,
        String(row.id),
      );
      if (this.canRead(identity, specialties, detail)) orders.push(detail);
    }
    const activeSession =
      identity.role === "owner_admin" || specialties.length !== 1
        ? null
        : await this.openSession(identity.id);
    return {
      specialties,
      initialChecks: (identity.role === "owner_admin"
        ? []
        : await this.inventory.listInitialCheckCandidates(
            this.connection.database,
          )
      ).filter(
        (machine) =>
          identity.role === "technician_cleaner" &&
          specialties.includes(machine.machineType as ProductionSpecialty),
      ),
      orders,
      myActiveMachines:
        identity.role === "owner_admin"
          ? []
          : orders.filter(
              (detail) =>
                detail.order.assignedUserId === identity.id &&
                !detail.order.completedAt,
            ),
      availableTests:
        identity.role === "owner_admin"
          ? orders
          : orders.filter(
              (detail) =>
                !detail.order.assignedUserId && !detail.order.completedAt,
            ),
      activeSession,
      otherMachineCount:
        identity.role === "owner_admin"
          ? await this.inventory.countOtherMachinesAwaitingTest(
              this.connection.database,
            )
          : 0,
    };
  }

  async initialCheckMachine(
    machineId: string,
    identity: IdentityUser,
  ): Promise<Machine> {
    const machine = await this.inventory.findMachineForProduction(
      this.connection.database,
      machineId,
    );
    if (!machine) throw new NotFoundException("Machine not found");
    await this.assertInitialCheckMachine(
      this.connection.database,
      machine,
      identity,
    );
    return machine;
  }

  async assertInitialCheckMachine(
    database: DatabaseExecutor,
    machine: Machine,
    identity: IdentityUser,
  ): Promise<void> {
    if (
      machine.inventoryState !== "on_hand" ||
      machine.productionState !== "not_assessed" ||
      (machine.machineType !== "washer" && machine.machineType !== "dryer")
    )
      throw new ConflictException("Machine is not awaiting initial check");
    if (identity.role === "owner_admin") return;
    if (
      identity.role !== "technician_cleaner" ||
      !(await this.specialtiesWith(database, identity.id)).includes(
        machine.machineType,
      )
    )
      throw new NotFoundException("Initial check not found");
  }

  async workDestination(
    machineId: string,
    identity: IdentityUser,
  ): Promise<
    | { kind: "session"; sessionId: string; orderId: string }
    | { kind: "test"; orderId: string }
    | { kind: "initial_check"; machineId: string }
    | { kind: "none" }
  > {
    const active = await this.activeForMachine(machineId, identity);
    if (active) {
      const open =
        identity.role === "owner_admin"
          ? null
          : await this.openSession(identity.id);
      if (
        open?.items.some(
          (item) =>
            item.order.order.id === active &&
            !["completed", "removed"].includes(item.state),
        )
      )
        return { kind: "session", sessionId: open.id, orderId: active };
      return { kind: "test", orderId: active };
    }
    try {
      await this.initialCheckMachine(machineId, identity);
      return { kind: "initial_check", machineId };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      )
        return { kind: "none" };
      throw error;
    }
  }

  async activeForMachine(
    machineId: string,
    identity: IdentityUser,
  ): Promise<string | null> {
    const row = rows(
      await this.connection.database.execute(sql`
      select id from production_test_work_order where machine_id = ${machineId} and completed_at is null
      order by queued_at, id limit 1
    `),
    )[0];
    if (!row) return null;
    const detail = await this.detailWith(
      this.connection.database,
      String(row.id),
    );
    const specialties =
      identity.role === "owner_admin"
        ? []
        : await this.specialties(identity.id);
    return this.canRead(identity, specialties, detail) ? detail.order.id : null;
  }

  async detail(
    orderId: string,
    identity: IdentityUser,
  ): Promise<TestWorkDetail> {
    const detail = await this.detailWith(this.connection.database, orderId);
    const specialties =
      identity.role === "owner_admin"
        ? []
        : await this.specialties(identity.id);
    if (!this.canRead(identity, specialties, detail))
      throw new NotFoundException("Work Order not found");
    return detail;
  }
  private canRead(
    identity: IdentityUser,
    specialties: ProductionSpecialty[],
    detail: TestWorkDetail,
  ): boolean {
    return (
      identity.role === "owner_admin" ||
      (identity.role === "technician_cleaner" &&
        specialties.length === 1 &&
        specialties.includes(detail.order.machineType) &&
        (detail.order.assignedUserId === identity.id ||
          (detail.order.completedAt === null && !detail.order.assignedUserId)))
    );
  }
  private async detailWith(
    database: DatabaseExecutor,
    orderId: string,
  ): Promise<TestWorkDetail> {
    const row = rows(
      await database.execute(
        sql`select * from production_test_work_order where id = ${orderId}`,
      ),
    )[0];
    if (!row) throw new NotFoundException("Work Order not found");
    const machine = await this.inventory.findMachineForProduction(
      database,
      String(row.machine_id),
    );
    if (!machine) throw new NotFoundException("Machine not found");
    const runRow = rows(
      await database.execute(
        sql`select * from production_test_run where order_id = ${orderId}`,
      ),
    )[0];
    const claims = rows(
      await database.execute(
        sql`select * from production_test_claim_event where order_id = ${orderId} order by created_at, id`,
      ),
    );
    let run: TestWorkDetail["run"] = null;
    if (runRow) {
      const templateRow = rows(
        await database.execute(
          sql`select * from production_test_template where id = ${String(runRow.template_id)}`,
        ),
      )[0]!;
      const steps = rows(
        await database.execute(
          sql`select * from production_test_step where template_id = ${String(runRow.template_id)} order by position`,
        ),
      );
      const results = rows(
        await database.execute(
          sql`select * from production_test_step_result where run_id = ${String(runRow.id)} order by order_version`,
        ),
      );
      run = {
        id: String(runRow.id),
        orderId,
        template: {
          id: String(templateRow.id),
          machineType: String(templateRow.machine_type) as ProductionSpecialty,
          version: Number(templateRow.version),
          steps: steps.map((step) => ({
            key: String(step.step_key),
            instruction: String(step.instruction),
            position: Number(step.position),
            allowNa: Boolean(step.allow_na),
            stopOnFailure: Boolean(step.stop_on_failure),
            photoRequired: Boolean(step.photo_required),
          })),
        },
        startedByUserId: String(runRow.started_by_user_id),
        startedAt: iso(runRow.started_at),
        completedAt: runRow.completed_at ? iso(runRow.completed_at) : null,
        videoFileId: nullable(runRow.video_file_id),
        results: results.map((result) => this.result(result)),
      };
    }
    return {
      order: {
        id: String(row.id),
        machineId: String(row.machine_id),
        machineType: String(row.machine_type) as ProductionSpecialty,
        state: String(row.state) as TestWorkDetail["order"]["state"],
        assignedUserId: nullable(row.assigned_user_id),
        activeSessionId: nullable(row.active_session_id),
        queuedAt: iso(row.queued_at),
        startedAt: row.started_at ? iso(row.started_at) : null,
        completedAt: row.completed_at ? iso(row.completed_at) : null,
        version: Number(row.version),
      },
      machine,
      run,
      initialBearingCheck: await latestPassingInitialBearing(
        database,
        String(row.machine_id),
      ),
      claims: claims.map((claim) => ({
        id: String(claim.id),
        orderId,
        action: String(
          claim.action,
        ) as TestWorkDetail["claims"][number]["action"],
        fromUserId: nullable(claim.from_user_id),
        toUserId: nullable(claim.to_user_id),
        actorUserId: String(claim.actor_user_id),
        createdAt: iso(claim.created_at),
      })),
    };
  }
  private result(row: Row): TestStepResult {
    return {
      id: String(row.id),
      runId: String(row.run_id),
      stepKey: String(row.step_key),
      result: String(row.result) as TestStepResult["result"],
      actorUserId: String(row.actor_user_id),
      fileId: nullable(row.file_id),
      createdAt: iso(row.created_at),
    };
  }

  async openSession(workerUserId: string): Promise<TestSession | null> {
    const row = rows(
      await this.connection.database.execute(sql`
      select id from production_test_session where worker_user_id = ${workerUserId} and completed_at is null limit 1
    `),
    )[0];
    return row
      ? this.sessionWith(this.connection.database, String(row.id))
      : null;
  }

  async session(
    sessionId: string,
    identity: IdentityUser,
  ): Promise<TestSession> {
    const session = await this.sessionWith(this.connection.database, sessionId);
    if (identity.role === "owner_admin") return session;
    const specialties = await this.specialties(identity.id);
    if (
      identity.role !== "technician_cleaner" ||
      session.workerUserId !== identity.id ||
      specialties.length !== 1 ||
      specialties[0] !== session.specialty
    )
      throw new NotFoundException("Session not found");
    return session;
  }

  private async sessionWith(
    database: DatabaseExecutor,
    sessionId: string,
  ): Promise<TestSession> {
    const row = rows(
      await database.execute(sql`
      select s.*, clock_timestamp() as as_of from production_test_session s where id = ${sessionId}
    `),
    )[0];
    if (!row) throw new NotFoundException("Session not found");
    const itemRows = rows(
      await database.execute(sql`
      select * from production_test_session_item where session_id = ${sessionId} order by created_at, id
    `),
    );
    const eventRows = rows(
      await database.execute(sql`
      select * from production_test_session_event where session_id = ${sessionId} order by created_at, id
    `),
    );
    const events: TestSessionEvent[] = eventRows.map((event) => ({
      id: String(event.id),
      sessionId,
      orderId: nullable(event.order_id),
      action: String(event.action) as TestSessionEvent["action"],
      itemState: nullable(event.item_state) as TestSessionItemState | null,
      actorUserId: String(event.actor_user_id),
      createdAt: iso(event.created_at),
    }));
    const asOf = iso(row.completed_at ?? row.as_of);
    const timing = summarizeSessionTime(events, asOf);
    const items = await Promise.all(
      itemRows.map(async (item) => {
        const orderId = String(item.order_id);
        return {
          order: await this.detailWith(database, orderId),
          state: String(item.state) as TestSessionItemState,
          allocatedSeconds: timing.allocatedSeconds[orderId] ?? 0,
        };
      }),
    );
    return {
      id: String(row.id),
      workerUserId: String(row.worker_user_id),
      specialty: String(row.specialty) as ProductionSpecialty,
      state: String(row.state) as TestSession["state"],
      version: Number(row.version),
      createdAt: iso(row.created_at),
      completedAt: row.completed_at ? iso(row.completed_at) : null,
      asOf,
      elapsedSeconds: timing.elapsedSeconds,
      unallocatedSeconds: timing.unallocatedSeconds,
      items,
      events,
    };
  }

  private async sessionEvent(
    database: DatabaseExecutor,
    sessionId: string,
    orderId: string | null,
    action: TestSessionEvent["action"],
    state: TestSessionItemState | null,
    actor: MutationContext,
  ): Promise<void> {
    await database.execute(sql`insert into production_test_session_event
      (id, session_id, order_id, action, item_state, actor_user_id, request_id)
      values (${randomUUID()}, ${sessionId}, ${orderId}, ${action}, ${state}, ${actor.actorUserId}, ${actor.requestId})`);
  }

  async createSession(
    orders: { orderId: string; expectedVersion: number }[],
    identity: IdentityUser,
    actor: MutationContext,
  ): Promise<TestSession> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.test_session.created",
        "production_test_session",
        { orders },
        actor,
      );
      if (reservation.replay)
        return this.sessionWith(database, reservation.targetId!);
      const specialty = await this.currentWorkerSpecialty(database, identity);
      const existing = rows(
        await database.execute(
          sql`select id from production_test_session where worker_user_id = ${identity.id} and completed_at is null`,
        ),
      );
      if (existing.length)
        throw new ConflictException("Finish the current session first");
      const sessionId = randomUUID();
      await database.execute(sql`insert into production_test_session(id, worker_user_id, specialty, state)
        values (${sessionId}, ${identity.id}, ${specialty}, 'active')`);
      for (const order of orders) {
        await this.startWith(
          database,
          order.orderId,
          order.expectedVersion,
          identity,
          actor,
        );
        await database.execute(
          sql`update production_test_work_order set active_session_id = ${sessionId} where id = ${order.orderId}`,
        );
        await database.execute(sql`insert into production_test_session_item(id, session_id, order_id, state)
          values (${randomUUID()}, ${sessionId}, ${order.orderId}, 'working')`);
        await this.sessionEvent(
          database,
          sessionId,
          order.orderId,
          "created",
          "working",
          actor,
        );
      }
      await this.record(
        database,
        "production.test_session.created",
        "production_test_session",
        sessionId,
        actor,
        ["state", "items"],
        "active",
      );
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_session",
        sessionId,
      );
      return this.sessionWith(database, sessionId);
    });
  }

  async addSessionOrders(
    sessionId: string,
    expectedVersion: number,
    orders: { orderId: string; expectedVersion: number }[],
    identity: IdentityUser,
    actor: MutationContext,
  ): Promise<TestSession> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.test_session.orders_added",
        "production_test_session",
        { sessionId, expectedVersion, orders },
        actor,
      );
      if (reservation.replay) return this.sessionWith(database, sessionId);
      const session = await this.requireWorkerSession(
        database,
        sessionId,
        expectedVersion,
        identity,
      );
      if (session.items.length + orders.length > 20)
        throw new ConflictException("A session holds at most 20 Machines");
      for (const order of orders) {
        const detail = await this.detailWith(database, order.orderId);
        if (detail.order.machineType !== session.specialty)
          throw new ConflictException(
            "Machine does not match session specialty",
          );
        await this.startWith(
          database,
          order.orderId,
          order.expectedVersion,
          identity,
          actor,
        );
        await database.execute(
          sql`update production_test_work_order set active_session_id = ${sessionId} where id = ${order.orderId}`,
        );
        await database.execute(sql`insert into production_test_session_item(id, session_id, order_id, state)
          values (${randomUUID()}, ${sessionId}, ${order.orderId}, 'working')`);
        await this.sessionEvent(
          database,
          sessionId,
          order.orderId,
          "added",
          "working",
          actor,
        );
      }
      await this.bumpSession(database, sessionId, expectedVersion);
      await this.record(
        database,
        "production.test_session.orders_added",
        "production_test_session",
        sessionId,
        actor,
        ["items"],
        "added",
      );
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_session",
        sessionId,
      );
      return this.sessionWith(database, sessionId);
    });
  }

  private async currentWorkerSpecialty(
    database: DatabaseExecutor,
    identity: IdentityUser,
  ): Promise<ProductionSpecialty> {
    const specialties = await this.specialtiesWith(database, identity.id);
    if (identity.role !== "technician_cleaner" || specialties.length !== 1)
      throw new ConflictException(
        "Owner must set one testing assignment before work starts",
      );
    return specialties[0]!;
  }

  private async requireWorkerSession(
    database: DatabaseExecutor,
    sessionId: string,
    expectedVersion: number,
    identity: IdentityUser,
  ): Promise<TestSession> {
    const session = await this.sessionWith(database, sessionId);
    const specialty = await this.currentWorkerSpecialty(database, identity);
    if (session.workerUserId !== identity.id || session.specialty !== specialty)
      throw new NotFoundException("Session not found");
    if (session.version !== expectedVersion || session.completedAt)
      throw new ConflictException("Session was changed by another request");
    return session;
  }

  private async bumpSession(
    database: DatabaseExecutor,
    sessionId: string,
    expectedVersion: number,
  ): Promise<void> {
    const changed = rows(
      await database.execute(sql`
      update production_test_session set version = version + 1
      where id = ${sessionId} and version = ${expectedVersion} and completed_at is null returning id
    `),
    );
    if (!changed.length)
      throw new ConflictException("Session was changed by another request");
  }

  async changeSessionState(
    sessionId: string,
    expectedVersion: number,
    state: "active" | "paused",
    identity: IdentityUser,
    actor: MutationContext,
  ): Promise<TestSession> {
    return this.connection.transaction(async (database) => {
      const action =
        state === "paused"
          ? "production.test_session.paused"
          : "production.test_session.resumed";
      const reservation = await this.reserve(
        database,
        action,
        "production_test_session",
        { sessionId, expectedVersion },
        actor,
      );
      if (reservation.replay) return this.sessionWith(database, sessionId);
      const session = await this.requireWorkerSession(
        database,
        sessionId,
        expectedVersion,
        identity,
      );
      if (session.state === state)
        throw new ConflictException("Session is already in this state");
      await database.execute(
        sql`update production_test_session set state = ${state} where id = ${sessionId}`,
      );
      await this.bumpSession(database, sessionId, expectedVersion);
      await this.sessionEvent(
        database,
        sessionId,
        null,
        state === "paused" ? "paused" : "resumed",
        null,
        actor,
      );
      await this.record(
        database,
        action,
        "production_test_session",
        sessionId,
        actor,
        ["state"],
        state,
      );
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_session",
        sessionId,
      );
      return this.sessionWith(database, sessionId);
    });
  }

  async changeItemState(
    sessionId: string,
    orderId: string,
    expectedVersion: number,
    state: "working" | "running_cycle" | "waiting",
    identity: IdentityUser,
    actor: MutationContext,
  ): Promise<TestSession> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.test_session.item_state_changed",
        "production_test_session_event",
        { sessionId, orderId, expectedVersion, state },
        actor,
      );
      if (reservation.replay) return this.sessionWith(database, sessionId);
      const session = await this.requireWorkerSession(
        database,
        sessionId,
        expectedVersion,
        identity,
      );
      const item = session.items.find(
        (candidate) => candidate.order.order.id === orderId,
      );
      if (
        !item ||
        item.state === "completed" ||
        item.state === "removed" ||
        item.state === state
      )
        throw new ConflictException(
          "Machine is not available for this state change",
        );
      await database.execute(sql`update production_test_session_item set state = ${state}
        where session_id = ${sessionId} and order_id = ${orderId} and ended_at is null`);
      await this.bumpSession(database, sessionId, expectedVersion);
      await this.sessionEvent(
        database,
        sessionId,
        orderId,
        "item_state_changed",
        state,
        actor,
      );
      const event = rows(
        await database.execute(sql`select id from production_test_session_event
        where session_id = ${sessionId} and request_id = ${actor.requestId} order by created_at desc, id desc limit 1`),
      )[0];
      if (!event) throw new ConflictException("Session event was not recorded");
      await this.record(
        database,
        "production.test_session.item_state_changed",
        "production_test_session_event",
        String(event.id),
        actor,
        ["item_state"],
        state,
      );
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_session_event",
        String(event.id),
      );
      return this.sessionWith(database, sessionId);
    });
  }

  async finishSession(
    sessionId: string,
    expectedVersion: number,
    identity: IdentityUser,
    actor: MutationContext,
  ): Promise<TestSession> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.test_session.finished",
        "production_test_session",
        { sessionId, expectedVersion },
        actor,
      );
      if (reservation.replay) return this.sessionWith(database, sessionId);
      const session = await this.requireWorkerSession(
        database,
        sessionId,
        expectedVersion,
        identity,
      );
      await this.closeSessionWith(database, session.id, expectedVersion, actor);
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_session",
        sessionId,
      );
      return this.sessionWith(database, sessionId);
    });
  }

  private async closeSessionWith(
    database: DatabaseExecutor,
    sessionId: string,
    expectedVersion: number,
    actor: MutationContext,
  ): Promise<void> {
    const session = await this.sessionWith(database, sessionId);
    if (session.version !== expectedVersion || session.completedAt)
      throw new ConflictException("Session was changed by another request");
    for (const item of session.items) {
      if (item.state === "completed" || item.state === "removed") continue;
      await database.execute(sql`update production_test_session_item set state = 'removed', ended_at = clock_timestamp()
          where session_id = ${sessionId} and order_id = ${item.order.order.id}`);
      await database.execute(
        sql`update production_test_work_order set active_session_id = null where id = ${item.order.order.id}`,
      );
      await this.sessionEvent(
        database,
        sessionId,
        item.order.order.id,
        "item_removed",
        "removed",
        actor,
      );
    }
    const changed = rows(
      await database.execute(sql`update production_test_session set state = 'completed', completed_at = clock_timestamp(), version = version + 1
        where id = ${sessionId} and version = ${expectedVersion} and completed_at is null returning id`),
    );
    if (!changed.length)
      throw new ConflictException("Session was changed by another request");
    await this.sessionEvent(database, sessionId, null, "finished", null, actor);
    await this.record(
      database,
      "production.test_session.finished",
      "production_test_session",
      sessionId,
      actor,
      ["state", "items"],
      "completed",
    );
  }

  private async closeItem(
    database: DatabaseExecutor,
    orderId: string,
    state: "completed" | "removed",
    actor: MutationContext,
    expectedSessionVersion?: number,
  ): Promise<void> {
    const row = rows(
      await database.execute(
        sql`select active_session_id from production_test_work_order where id = ${orderId}`,
      ),
    )[0];
    if (!row?.active_session_id) return;
    const sessionId = String(row.active_session_id);
    await database.execute(sql`update production_test_session_item set state = ${state}, ended_at = clock_timestamp()
      where session_id = ${sessionId} and order_id = ${orderId} and ended_at is null`);
    await database.execute(
      sql`update production_test_work_order set active_session_id = null where id = ${orderId}`,
    );
    await this.sessionEvent(
      database,
      sessionId,
      orderId,
      state === "completed" ? "item_completed" : "item_removed",
      state,
      actor,
    );
    const changedSession = rows(
      await database.execute(
        expectedSessionVersion === undefined
          ? sql`update production_test_session set version = version + 1 where id = ${sessionId} and completed_at is null returning id`
          : sql`update production_test_session set version = version + 1 where id = ${sessionId} and version = ${expectedSessionVersion} and completed_at is null returning id`,
      ),
    );
    if (!changedSession.length)
      throw new ConflictException("Session was changed by another request");
    const unfinished = rows(
      await database.execute(sql`select id from production_test_session_item
      where session_id = ${sessionId} and ended_at is null limit 1`),
    );
    if (!unfinished.length) {
      await database.execute(sql`update production_test_session set state = 'completed', completed_at = clock_timestamp(), version = version + 1
        where id = ${sessionId} and completed_at is null`);
      await this.sessionEvent(
        database,
        sessionId,
        null,
        "finished",
        null,
        actor,
      );
      await this.record(
        database,
        "production.test_session.finished",
        "production_test_session",
        sessionId,
        actor,
        ["state"],
        "completed",
      );
    }
    await this.record(
      database,
      state === "completed"
        ? "production.test_session.item_completed"
        : "production.test_session.item_removed",
      "production_test_session",
      sessionId,
      actor,
      ["items"],
      state,
    );
  }

  async start(
    orderId: string,
    expectedVersion: number,
    identity: IdentityUser,
    actor: MutationContext,
  ): Promise<TestWorkDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.test_work_order.claimed",
        "production_test_work_order",
        { orderId, expectedVersion },
        actor,
      );
      if (reservation.replay) return this.detailWith(database, orderId);
      await this.startWith(database, orderId, expectedVersion, identity, actor);
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_work_order",
        orderId,
      );
      return this.detailWith(database, orderId);
    });
  }

  private async startWith(
    database: DatabaseExecutor,
    orderId: string,
    expectedVersion: number,
    identity: IdentityUser,
    actor: MutationContext,
  ): Promise<void> {
    const detail = await this.detailWith(database, orderId);
    const order = detail.order;
    if (order.version !== expectedVersion || order.completedAt)
      throw new ConflictException("Work Order was changed by another request");
    const specialties =
      identity.role === "owner_admin"
        ? []
        : await this.specialtiesWith(database, identity.id);
    if (
      identity.role !== "technician_cleaner" ||
      specialties.length !== 1 ||
      specialties[0] !== order.machineType
    )
      throw new ConflictException("This work does not match your specialty");
    if (order.assignedUserId && order.assignedUserId !== identity.id)
      throw new ConflictException("Work Order is claimed by another worker");
    if (order.activeSessionId)
      throw new ConflictException("Work Order is in an active session");
    if (order.state === "queued") {
      const machine = await this.inventory.transitionTestProductionState(
        database,
        {
          machineId: order.machineId,
          expectedVersion: detail.machine.version,
          from: "awaiting_test",
          to: "testing",
          actorUserId: identity.id,
          requestId: actor.requestId,
        },
      );
      if (!machine)
        throw new ConflictException("Machine is no longer awaiting test");
      const template = rows(
        await database.execute(sql`
        select id from production_test_template where machine_type = ${order.machineType} and approved_at is not null
        order by version desc limit 1
      `),
      )[0];
      if (!template)
        throw new ConflictException("Approved checklist is unavailable");
      const runId = randomUUID();
      await database.execute(sql`insert into production_test_run(id, order_id, template_id, started_by_user_id)
        values (${runId}, ${orderId}, ${String(template.id)}, ${identity.id})`);
      await database.execute(sql`insert into production_test_run_step(run_id, step_key)
        select ${runId}, step_key from production_test_step where template_id = ${String(template.id)}`);
    }
    const changed = rows(
      await database.execute(sql`
      update production_test_work_order set assigned_user_id = ${identity.id}, state = 'testing',
        started_at = coalesce(started_at, now()), version = version + 1
      where id = ${orderId} and version = ${expectedVersion} and completed_at is null
        and (assigned_user_id is null or assigned_user_id = ${identity.id}) and active_session_id is null returning id
    `),
    );
    if (!changed.length)
      throw new ConflictException("Work Order was claimed by another worker");
    if (!order.assignedUserId) {
      await this.claim(database, orderId, "claimed", null, identity.id, actor);
      await this.record(
        database,
        "production.test_work_order.claimed",
        "production_test_work_order",
        orderId,
        actor,
        ["assigned_user_id", "state"],
        "testing",
      );
    }
  }

  async assign(
    orderId: string,
    expectedVersion: number,
    userId: string | null,
    actor: MutationContext,
  ): Promise<TestWorkDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.test_work_order.assignment_changed",
        "production_test_work_order",
        { orderId, expectedVersion, userId },
        actor,
      );
      if (reservation.replay) return this.detailWith(database, orderId);
      const detail = await this.detailWith(database, orderId);
      if (detail.order.version !== expectedVersion || detail.order.completedAt)
        throw new ConflictException(
          "Work Order was changed by another request",
        );
      if (
        userId &&
        !((specialties) =>
          specialties.length === 1 &&
          specialties[0] === detail.order.machineType)(
          await this.specialtiesWith(database, userId),
        )
      )
        throw new ConflictException(
          "Worker does not have the matching specialty",
        );
      const changed = rows(
        await database.execute(sql`
        update production_test_work_order set assigned_user_id = ${userId}, version = version + 1
        where id = ${orderId} and version = ${expectedVersion} and completed_at is null returning id
      `),
      );
      if (!changed.length)
        throw new ConflictException(
          "Work Order was changed by another request",
        );
      if (
        detail.order.activeSessionId &&
        userId !== detail.order.assignedUserId
      )
        await this.closeItem(database, orderId, "removed", actor);
      await this.claim(
        database,
        orderId,
        userId ? "reassigned" : "released",
        detail.order.assignedUserId,
        userId,
        actor,
      );
      await this.record(
        database,
        "production.test_work_order.assignment_changed",
        "production_test_work_order",
        orderId,
        actor,
        ["assigned_user_id"],
        userId ? "reassigned" : "released",
      );
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_work_order",
        orderId,
      );
      return this.detailWith(database, orderId);
    });
  }

  async recordStep(
    orderId: string,
    expectedVersion: number,
    stepKey: string,
    result: TestStepResult["result"],
    fileId: string | null,
    actor: MutationContext,
  ): Promise<TestWorkDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.test_step.recorded",
        "production_test_step_result",
        { orderId, expectedVersion, stepKey, result, fileId },
        actor,
      );
      if (reservation.replay) return this.detailWith(database, orderId);
      const detail = await this.detailWith(database, orderId);
      if (
        detail.order.version !== expectedVersion ||
        detail.order.state !== "testing" ||
        detail.order.assignedUserId !== actor.actorUserId ||
        !detail.order.activeSessionId ||
        !detail.run
      )
        throw new ConflictException(
          "Only the current claimant can record an active test",
        );
      if (
        (await this.specialtiesWith(database, actor.actorUserId)).length !==
          1 ||
        !(await this.specialtiesWith(database, actor.actorUserId)).includes(
          detail.order.machineType,
        )
      )
        throw new ConflictException("Testing assignment is no longer active");
      const activeSession = await this.sessionWith(
        database,
        detail.order.activeSessionId,
      );
      const activeItem = activeSession.items.find(
        (item) => item.order.order.id === orderId,
      );
      if (
        activeSession.workerUserId !== actor.actorUserId ||
        activeSession.state !== "active" ||
        !activeItem ||
        (activeItem.state !== "working" && activeItem.state !== "running_cycle")
      )
        throw new ConflictException(
          "Resume this Machine in an active timed session first",
        );
      const step = detail.run.template.steps.find(
        (candidate) => candidate.key === stepKey,
      );
      if (!step) throw new ConflictException("Checklist step is unavailable");
      if (result === "na" && !step.allowNa)
        throw new ConflictException("N/A is not permitted for this step");
      if (step.photoRequired && !fileId)
        throw new ConflictException("This step requires a photo");
      if (fileId) {
        const files = await this.files.findReadyTestEvidence(
          database,
          detail.order.machineId,
          [fileId],
        );
        if (files.length !== 1)
          throw new ConflictException(
            "Photo must be ready and belong to this Machine",
          );
        const used = rows(
          await database.execute(
            sql`select id from production_test_step_result where file_id = ${fileId} limit 1`,
          ),
        );
        if (used.length)
          throw new ConflictException(
            "Photo is already linked to a test result",
          );
      }
      const resultId = randomUUID();
      await database.execute(sql`
        insert into production_test_step_result(id, run_id, step_key, result, actor_user_id, file_id, request_id, order_version)
        values (${resultId}, ${detail.run.id}, ${stepKey}, ${result}, ${actor.actorUserId}, ${fileId}, ${actor.requestId}, ${expectedVersion + 1})
      `);
      const changed = rows(
        await database.execute(
          sql`update production_test_work_order set version = version + 1 where id = ${orderId} and version = ${expectedVersion} returning id`,
        ),
      );
      if (!changed.length)
        throw new ConflictException(
          "Work Order was changed by another request",
        );
      await this.record(
        database,
        "production.test_step.recorded",
        "production_test_step_result",
        resultId,
        actor,
        ["result", "file_id"],
        result,
      );
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_step_result",
        resultId,
      );
      return this.detailWith(database, orderId);
    });
  }

  async finish(
    orderId: string,
    expectedVersion: number,
    expectedSessionVersion: number,
    videoFileId: string | null,
    actor: MutationContext,
  ): Promise<TestWorkDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.test_work_order.completed",
        "production_test_work_order",
        { orderId, expectedVersion, expectedSessionVersion, videoFileId },
        actor,
      );
      if (reservation.replay) return this.detailWith(database, orderId);
      const detail = await this.detailWith(database, orderId);
      if (
        detail.order.version !== expectedVersion ||
        detail.order.state !== "testing" ||
        detail.order.assignedUserId !== actor.actorUserId ||
        !detail.order.activeSessionId ||
        !detail.run
      )
        throw new ConflictException(
          "Only the current claimant can finish an active test",
        );
      if (
        (await this.specialtiesWith(database, actor.actorUserId)).length !==
          1 ||
        !(await this.specialtiesWith(database, actor.actorUserId)).includes(
          detail.order.machineType,
        )
      )
        throw new ConflictException("Testing assignment is no longer active");
      const activeSession = await this.sessionWith(
        database,
        detail.order.activeSessionId,
      );
      const activeItem = activeSession.items.find(
        (item) => item.order.order.id === orderId,
      );
      if (
        activeSession.version !== expectedSessionVersion ||
        activeSession.workerUserId !== actor.actorUserId ||
        activeSession.state !== "active" ||
        !activeItem ||
        (activeItem.state !== "working" && activeItem.state !== "running_cycle")
      )
        throw new ConflictException(
          "Session changed or is not actively timing this Machine",
        );
      const latest = new Map<string, TestStepResult>();
      for (const result of detail.run.results)
        latest.set(result.stepKey, result);
      for (const step of detail.run.template.steps) {
        const result = latest.get(step.key);
        if (
          !result ||
          (result.result === "na" && !step.allowNa) ||
          (step.photoRequired && !result.fileId)
        )
          throw new ConflictException(
            "Complete every checklist step and required photo first",
          );
        if (step.photoRequired && result.fileId) {
          const files = await this.files.findReadyTestEvidence(
            database,
            detail.order.machineId,
            [result.fileId],
          );
          if (files.length !== 1)
            throw new ConflictException("Required photo is unavailable");
        }
      }
      const state = [...latest.values()].some(
        (result) => result.result === "fail",
      )
        ? "awaiting_repair"
        : "awaiting_clean";
      if (state === "awaiting_clean") {
        if (
          !videoFileId ||
          !(await this.files.findReadyTestVideo(
            database,
            detail.order.machineId,
            videoFileId,
          ))
        )
          throw new ConflictException(
            "A verified Machine test video is required",
          );
        const used = rows(
          await database.execute(sql`
          select id from production_test_run where video_file_id = ${videoFileId} limit 1
        `),
        );
        if (used.length)
          throw new ConflictException("Video is already linked to a Test run");
      } else if (videoFileId) {
        throw new ConflictException("Failed tests do not use a success video");
      }
      const machine = await this.inventory.transitionTestProductionState(
        database,
        {
          machineId: detail.order.machineId,
          expectedVersion: detail.machine.version,
          from: "testing",
          to: state,
          actorUserId: actor.actorUserId,
          requestId: actor.requestId,
        },
      );
      if (!machine) throw new ConflictException("Machine is no longer testing");
      await database.execute(
        sql`update production_test_run set completed_at = now(), video_file_id = ${state === "awaiting_clean" ? videoFileId : null} where id = ${detail.run.id} and completed_at is null`,
      );
      const changed = rows(
        await database.execute(sql`
        update production_test_work_order set state = ${state}, completed_at = now(), version = version + 1
        where id = ${orderId} and version = ${expectedVersion} and completed_at is null returning id
      `),
      );
      if (!changed.length)
        throw new ConflictException(
          "Work Order was changed by another request",
        );
      await this.record(
        database,
        "production.test_work_order.completed",
        "production_test_work_order",
        orderId,
        actor,
        ["state"],
        state,
      );
      await this.closeItem(
        database,
        orderId,
        "completed",
        actor,
        expectedSessionVersion,
      );
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_work_order",
        orderId,
      );
      return this.detailWith(database, orderId);
    });
  }

  async reportBearingConcern(
    orderId: string,
    expectedVersion: number,
    expectedSessionVersion: number,
    actor: MutationContext,
  ): Promise<TestWorkDetail> {
    return this.connection.transaction(async (database) => {
      const reservation = await this.reserve(
        database,
        "production.test.bearing_concern_reported",
        "production_test_bearing_concern",
        { orderId, expectedVersion, expectedSessionVersion },
        actor,
      );
      if (reservation.replay) return this.detailWith(database, orderId);
      const detail = await this.detailWith(database, orderId);
      if (
        detail.order.version !== expectedVersion ||
        detail.order.state !== "testing" ||
        detail.order.assignedUserId !== actor.actorUserId ||
        !detail.run
      )
        throw new ConflictException(
          "Only the current claimant can report a concern",
        );
      const specialty = await this.specialtiesWith(database, actor.actorUserId);
      if (specialty.length !== 1 || specialty[0] !== detail.order.machineType)
        throw new ConflictException("Testing assignment is no longer active");
      if (!detail.order.activeSessionId)
        throw new ConflictException(
          "Resume this Machine in a timed session before reporting a concern",
        );
      const session = await this.sessionWith(
        database,
        detail.order.activeSessionId,
      );
      if (
        session.version !== expectedSessionVersion ||
        session.workerUserId !== actor.actorUserId ||
        session.completedAt
      )
        throw new ConflictException("Session was changed by another request");
      const machine = await this.inventory.transitionTestProductionState(
        database,
        {
          machineId: detail.order.machineId,
          expectedVersion: detail.machine.version,
          from: "testing",
          to: "awaiting_repair",
          actorUserId: actor.actorUserId,
          requestId: actor.requestId,
        },
      );
      if (!machine) throw new ConflictException("Machine is no longer testing");
      const concernId = randomUUID();
      await database.execute(sql`insert into production_test_bearing_concern(id, order_id, actor_user_id, request_id)
        values (${concernId}, ${orderId}, ${actor.actorUserId}, ${actor.requestId})`);
      await database.execute(
        sql`update production_test_run set completed_at = clock_timestamp() where id = ${detail.run.id}`,
      );
      const changed = rows(
        await database.execute(sql`update production_test_work_order
        set state = 'awaiting_repair', completed_at = clock_timestamp(), version = version + 1
        where id = ${orderId} and version = ${expectedVersion} and completed_at is null returning id`),
      );
      if (!changed.length)
        throw new ConflictException(
          "Work Order was changed by another request",
        );
      await this.closeItem(
        database,
        orderId,
        "removed",
        actor,
        expectedSessionVersion,
      );
      await this.record(
        database,
        "production.test.bearing_concern_reported",
        "production_test_bearing_concern",
        concernId,
        actor,
        ["state"],
        "awaiting_repair",
      );
      await this.completeReservation(
        database,
        reservation.recordId!,
        "production_test_bearing_concern",
        concernId,
      );
      return this.detailWith(database, orderId);
    });
  }

  private async claim(
    database: DatabaseExecutor,
    orderId: string,
    action: "claimed" | "released" | "reassigned",
    from: string | null,
    to: string | null,
    actor: MutationContext,
  ): Promise<void> {
    await database.execute(sql`
      insert into production_test_claim_event(id, order_id, action, from_user_id, to_user_id, actor_user_id, request_id)
      values (${randomUUID()}, ${orderId}, ${action}, ${from}, ${to}, ${actor.actorUserId}, ${actor.requestId})
    `);
  }
  private async record(
    database: DatabaseExecutor,
    action: Parameters<MutationRecorder["record"]>[1]["action"],
    targetType: Parameters<MutationRecorder["record"]>[1]["targetType"],
    targetId: string,
    actor: Pick<MutationContext, "actorUserId" | "requestId">,
    changedFields: string[],
    outcome: string,
  ): Promise<void> {
    await this.recorder.record(database, {
      actorKind: "user",
      actorUserId: actor.actorUserId,
      action,
      targetType,
      targetId,
      requestId: actor.requestId,
      summary: { changedFields, outcome },
    });
  }
  private async reserve(
    database: DatabaseExecutor,
    scope: string,
    targetType: string,
    input: unknown,
    actor: MutationContext,
  ): Promise<{ replay: boolean; recordId?: string; targetId?: string }> {
    const result = await this.idempotency.reserve(database, {
      scope,
      actorUserId: actor.actorUserId,
      rawKey: actor.idempotencyKey,
      requestFingerprint: requestFingerprint(input),
    });
    if (result.status === "fingerprint_conflict")
      throw new ConflictException(
        "Idempotency-Key was used for different input",
      );
    if (result.status === "in_progress")
      throw new ConflictException("The original request is still in progress");
    if (result.status === "completed") {
      if (result.targetType !== targetType)
        throw new ConflictException(
          "Idempotency-Key was used for another action",
        );
      return { replay: true, targetId: result.targetId };
    }
    return { replay: false, recordId: result.recordId };
  }
  private completeReservation(
    database: DatabaseExecutor,
    recordId: string,
    targetType:
      | "production_worker_specialty"
      | "production_test_work_order"
      | "production_test_step_result"
      | "production_test_session"
      | "production_test_session_event"
      | "production_test_bearing_concern",
    targetId: string,
  ): Promise<void> {
    return this.idempotency.complete(database, {
      recordId,
      targetType,
      targetId,
    });
  }
}
