import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@simply-clean/config";
import type { DatabaseConnection } from "@simply-clean/database";
import { createTestEnvironment } from "@simply-clean/test-support";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { IdentityService } from "../src/modules/identity/identity.service.js";
import { InternalEventHandlerRegistry } from "../src/modules/operations/internal-event-dispatcher.js";
import { OPERATIONS_CLOCK } from "../src/modules/operations/operations.ports.js";
import { OperationsRepository } from "../src/modules/operations/operations.repository.js";
import { OperationsWorker } from "../src/modules/operations/operations.worker.js";
import { DATABASE_CONNECTION } from "../src/platform/database.module.js";

const applications: INestApplication[] = [];

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === "object" && result !== null && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.close()),
  );
});

async function createApplication(input?: {
  environment?: Record<string, string | undefined>;
  clock?: { now(): Date };
}): Promise<INestApplication> {
  const config = parseServerEnvironment(
    createTestEnvironment(input?.environment),
  );
  const builder = Test.createTestingModule({
    imports: [AppModule.register(config)],
  });
  if (input?.clock) {
    builder.overrideProvider(OPERATIONS_CLOCK).useValue(input.clock);
  }
  const module = await builder.compile();
  await module.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();
  const app = module.createNestApplication({ bodyParser: false });
  applications.push(app);
  await app.init();
  return app;
}

async function user(
  app: INestApplication,
  role: "owner_admin" | "warehouse" | "technician_cleaner",
  suffix = "",
) {
  const email = `${role}${suffix}@example.test`;
  const password = `${role}-secure-password`;
  const identity = await app
    .get(IdentityService)
    .provisionUser(
      { name: role, email, password, role },
      { requestId: `provision-${role}${suffix}` },
    );
  const response = await request(app.getHttpServer())
    .post("/auth/sign-in/email")
    .set("origin", "http://localhost:3000")
    .send({ email, password })
    .expect(200);
  return {
    identity,
    cookies: response.headers["set-cookie"] as unknown as string[],
  };
}

describe("Operations reliability foundation", () => {
  it("deduplicates creates, indexes safe mutations, and protects Owner APIs", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const key = randomUUID();
    const body = {
      displayName: "Sensitive Seller Load",
      sourceName: "Private Seller Name",
      sourceReference: "PRIVATE-REFERENCE-42",
    };

    await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", owner.cookies)
      .send(body)
      .expect(400);
    const first = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", key)
      .send(body)
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", key)
      .send(body)
      .expect(201);
    expect(duplicate.body.load.id).toBe(first.body.load.id);
    await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", key)
      .send({ ...body, displayName: "Changed request" })
      .expect(409);

    const concurrentLoadKey = randomUUID();
    const concurrentLoads = await Promise.all([
      request(app.getHttpServer())
        .post("/inventory/loads")
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", concurrentLoadKey)
        .send({ displayName: "Concurrent Load" }),
      request(app.getHttpServer())
        .post("/inventory/loads")
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", concurrentLoadKey)
        .send({ displayName: "Concurrent Load" }),
    ]);
    expect(concurrentLoads.map((response) => response.status)).toEqual([
      201, 201,
    ]);
    expect(concurrentLoads[0]!.body.load.id).toBe(
      concurrentLoads[1]!.body.load.id,
    );

    const concurrentKey = randomUUID();
    const concurrent = await Promise.all([
      request(app.getHttpServer())
        .post("/inventory/locations")
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", concurrentKey)
        .send({ code: "RELIABLE", name: "Reliable receiving" }),
      request(app.getHttpServer())
        .post("/inventory/locations")
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", concurrentKey)
        .send({ code: "RELIABLE", name: "Reliable receiving" }),
    ]);
    expect(concurrent.map((response) => response.status)).toEqual([201, 201]);
    expect(concurrent[0]!.body.location.id).toBe(
      concurrent[1]!.body.location.id,
    );
    await request(app.getHttpServer())
      .post("/inventory/locations")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", concurrentKey)
      .send({ code: "RELIABLE", name: "Reliable receiving" })
      .expect(201)
      .expect(({ body: responseBody }) => {
        expect(responseBody.location.id).toBe(concurrent[0]!.body.location.id);
      });
    await request(app.getHttpServer())
      .post("/inventory/locations")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", concurrentKey)
      .send({ code: "RELIABLE", name: "Changed receiving" })
      .expect(409);
    const machineKey = randomUUID();
    const machineBody = {
      machineType: "washer",
      sourceLoadId: first.body.load.id,
      currentLocationId: concurrent[0]!.body.location.id,
    };
    const machine = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", machineKey)
      .send(machineBody)
      .expect(201);
    const renamed = await request(app.getHttpServer())
      .patch(`/inventory/locations/${concurrent[0]!.body.location.id}`)
      .set("Cookie", owner.cookies)
      .send({ name: "Reliable storage", expectedVersion: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `/inventory/locations/${concurrent[0]!.body.location.id}/deactivate`,
      )
      .set("Cookie", owner.cookies)
      .send({ expectedVersion: renamed.body.location.version })
      .expect(201);
    await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", machineKey)
      .send(machineBody)
      .expect(201)
      .expect(({ body: responseBody }) => {
        expect(responseBody.machine.id).toBe(machine.body.machine.id);
      });
    await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", machineKey)
      .send({ ...machineBody, machineType: "dryer" })
      .expect(409);
    const concurrentMachineKey = randomUUID();
    const concurrentMachines = await Promise.all([
      request(app.getHttpServer())
        .post("/inventory/machines")
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", concurrentMachineKey)
        .send({ machineType: "dryer", sourceLoadId: first.body.load.id }),
      request(app.getHttpServer())
        .post("/inventory/machines")
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", concurrentMachineKey)
        .send({ machineType: "dryer", sourceLoadId: first.body.load.id }),
    ]);
    expect(concurrentMachines.map((response) => response.status)).toEqual([
      201, 201,
    ]);
    expect(concurrentMachines[0]!.body.machine.id).toBe(
      concurrentMachines[1]!.body.machine.id,
    );

    await request(app.getHttpServer())
      .get("/operations/audit")
      .set("Cookie", warehouse.cookies)
      .expect(403);
    const audit = await request(app.getHttpServer())
      .get("/operations/audit")
      .query({ action: "inventory.load.created" })
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(audit.body).toMatchObject({ total: 2 });
    const firstLoadAudit = audit.body.entries.find(
      (entry: { targetId: string }) => entry.targetId === first.body.load.id,
    );
    expect(firstLoadAudit).toMatchObject({
      actorUserId: owner.identity.id,
      targetId: first.body.load.id,
      summary: {
        changedFields: expect.arrayContaining(["display_name"]),
        outcome: "completed",
      },
    });
    await request(app.getHttpServer())
      .get("/operations/audit")
      .query({ targetType: "load", targetId: first.body.load.id })
      .set("Cookie", owner.cookies)
      .expect(200)
      .expect(({ body: responseBody }) => {
        expect(responseBody).toMatchObject({ total: 1 });
        expect(responseBody.entries[0].targetId).toBe(first.body.load.id);
      });
    await request(app.getHttpServer())
      .get("/operations/audit")
      .query({ targetId: first.body.load.id })
      .set("Cookie", owner.cookies)
      .expect(400);

    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const locationActions = await database.execute(sql`
      select action from operations_audit_entry
      where target_id = ${concurrent[0]!.body.location.id}
      order by created_at
    `);
    expect(
      resultRows<{ action: string }>(locationActions).map((row) => row.action),
    ).toEqual([
      "inventory.location.created",
      "inventory.location.updated",
      "inventory.location.deactivated",
    ]);
    const stored = await database.execute(sql`
      select key_hash, request_fingerprint from operations_idempotency_record
      where scope = 'inventory.load.create'
    `);
    expect(resultRows<{ key_hash: string }>(stored)[0]!.key_hash).not.toBe(key);
    const safeRows = await database.execute(sql`
      select safe_summary::text as summary from operations_audit_entry
      union all
      select safe_summary::text as summary from platform_outbox_job
    `);
    const safeText = JSON.stringify(resultRows(safeRows));
    expect(safeText).not.toContain("Private Seller Name");
    expect(safeText).not.toContain("PRIVATE-REFERENCE-42");
    expect(safeText).not.toContain(key);

    await expect(
      database.execute(sql`
        update operations_audit_entry set request_id = 'changed'
        where id = ${firstLoadAudit.id}
      `),
    ).rejects.toThrow();
    await expect(
      database.execute(sql`
        delete from operations_audit_entry
        where id = ${firstLoadAudit.id}
      `),
    ).rejects.toThrow();
  });

  it("rolls domain state and specialized history back when outbox recording fails", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    await database.execute(sql`
      create function reject_selected_outbox() returns trigger as $$
      begin
        if new.event_type in ('inventory.load.created', 'inventory.machine.identity_updated') then
          raise exception 'forced recorder failure';
        end if;
        return new;
      end;
      $$ language plpgsql
    `);
    await database.execute(sql`
      create trigger reject_selected_outbox_trigger before insert
      on platform_outbox_job for each row execute function reject_selected_outbox()
    `);

    await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Must Roll Back" })
      .expect(500);
    const rolledBackLoad = await database.execute(sql`
      select id from inventory_load where display_name = 'Must Roll Back'
    `);
    expect(resultRows(rolledBackLoad)).toHaveLength(0);

    await database.execute(
      sql`drop trigger reject_selected_outbox_trigger on platform_outbox_job`,
    );
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Machine Rollback Load" })
      .expect(201);
    const machine = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ machineType: "washer", sourceLoadId: load.body.load.id })
      .expect(201);
    await database.execute(sql`
      create trigger reject_selected_outbox_trigger before insert
      on platform_outbox_job for each row execute function reject_selected_outbox()
    `);
    await request(app.getHttpServer())
      .patch(`/inventory/machines/${machine.body.machine.id}/identity`)
      .set("Cookie", owner.cookies)
      .send({ model: "Secret Model", expectedVersion: 1 })
      .expect(500);
    const unchanged = await database.execute(sql`
      select version, model from inventory_machine
      where id = ${machine.body.machine.id}
    `);
    expect(
      resultRows<{ version: number; model: string | null }>(unchanged)[0],
    ).toMatchObject({
      version: 1,
      model: null,
    });
    const evidence = await database.execute(sql`
      select id from machine_identity_evidence
      where machine_id = ${machine.body.machine.id}
    `);
    expect(resultRows(evidence)).toHaveLength(1);
  });

  it("leases, retries, dead-letters, rejects stale completion, and audits Owner requeue", async () => {
    let now = new Date("2026-09-21T12:00:00.000Z");
    const clock = { now: () => new Date(now) };
    const app = await createApplication({
      environment: {
        OPERATIONS_WORKER_MAX_ATTEMPTS: "2",
        OPERATIONS_WORKER_LEASE_SECONDS: "5",
        OPERATIONS_WORKER_BACKOFF_BASE_MS: "100",
      },
      clock,
    });
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const registry = app.get(InternalEventHandlerRegistry);
    const stopFailing = registry.register(
      "inventory.load.created",
      async () => {
        throw new Error("secret exception PRIVATE-STACK-TOKEN");
      },
    );
    const created = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Retry Load" })
      .expect(201);
    const worker = app.get(OperationsWorker);
    await expect(worker.runOnce(100)).resolves.toMatchObject({ failed: 1 });
    now = new Date(now.getTime() + 100);
    await expect(worker.runOnce(100)).resolves.toMatchObject({ failed: 1 });

    await request(app.getHttpServer())
      .get("/operations/jobs")
      .set("Cookie", warehouse.cookies)
      .expect(403);
    const dead = await request(app.getHttpServer())
      .get("/operations/jobs")
      .query({ state: "dead_letter" })
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(dead.body.total).toBe(1);
    expect(dead.body.jobs[0]).toMatchObject({
      targetId: created.body.load.id,
      attemptCount: 2,
      errorCode: "handler_failed",
    });
    expect(JSON.stringify(dead.body)).not.toContain("PRIVATE-STACK-TOKEN");

    stopFailing();
    const retried = await request(app.getHttpServer())
      .post(`/operations/jobs/${dead.body.jobs[0].id}/retry`)
      .set("Cookie", owner.cookies)
      .send({ expectedVersion: dead.body.jobs[0].version })
      .expect(201);
    expect(retried.body.job).toMatchObject({
      state: "queued",
      attemptCount: 0,
    });
    await expect(worker.runOnce(100)).resolves.toMatchObject({ delivered: 2 });

    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const action = await database.execute(sql`
      select action from operations_audit_entry
      where action = 'operations.job.requeued'
        and target_id = ${dead.body.jobs[0].id}
    `);
    expect(resultRows(action)).toHaveLength(1);

    const manualJobId = randomUUID();
    await database.execute(sql`
      insert into platform_outbox_job (
        id, event_type, target_type, target_id, actor_kind, actor_user_id,
        request_id, safe_summary, available_at
      ) values (
        ${manualJobId}, 'inventory.load.created', 'load',
        ${created.body.load.id}, 'user', ${owner.identity.id}, 'lease-test',
        '{"changedFields":[],"outcome":"completed"}'::jsonb, ${now}
      )
    `);
    const repository = app.get(OperationsRepository);
    const firstLease = (await repository.claim(now, 5, 2, 1))[0]!;
    now = new Date(now.getTime() + 5_001);
    await expect(repository.markDelivered(firstLease, now)).resolves.toBe(
      false,
    );
    await expect(
      repository.markFailed(firstLease, {
        now,
        nextAvailableAt: new Date(now.getTime() + 100),
        maximumAttempts: 2,
        errorCode: "handler_failed",
      }),
    ).resolves.toBe(false);
    const recoveredLease = (await repository.claim(now, 5, 2, 1))[0]!;
    expect(recoveredLease.id).toBe(firstLease.id);
    expect(recoveredLease.leaseId).not.toBe(firstLease.leaseId);
    expect(recoveredLease.attemptCount).toBe(2);
    await expect(repository.markDelivered(firstLease, now)).resolves.toBe(
      false,
    );
    await expect(repository.markDelivered(recoveredLease, now)).resolves.toBe(
      true,
    );

    const crashJobId = randomUUID();
    await database.execute(sql`
      insert into platform_outbox_job (
        id, event_type, target_type, target_id, actor_kind, actor_user_id,
        request_id, safe_summary, available_at
      ) values (
        ${crashJobId}, 'inventory.load.created', 'load',
        ${created.body.load.id}, 'user', ${owner.identity.id}, 'crash-test',
        '{"changedFields":[],"outcome":"completed"}'::jsonb, ${now}
      )
    `);
    const concurrentClaims = await Promise.all([
      repository.claim(now, 5, 2, 1),
      repository.claim(now, 5, 2, 1),
    ]);
    expect(concurrentClaims.flat()).toHaveLength(1);
    now = new Date(now.getTime() + 5_001);
    const finalCrashLease = (await repository.claim(now, 5, 2, 1))[0]!;
    expect(finalCrashLease).toMatchObject({ id: crashJobId, attemptCount: 2 });
    now = new Date(now.getTime() + 5_001);
    await expect(repository.claim(now, 5, 2, 1)).resolves.toEqual([]);
    const crashed = await database.execute(sql`
      select state, attempt_count, error_code from platform_outbox_job
      where id = ${crashJobId}
    `);
    expect(resultRows(crashed)[0]).toEqual({
      state: "dead_letter",
      attempt_count: 2,
      error_code: "handler_failed",
    });
  });

  it("bounds a hung handler so lifecycle shutdown can finish", async () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    const claimedJob = {
      id: randomUUID(),
      eventType: "inventory.load.created" as const,
      targetType: "load" as const,
      targetId: randomUUID(),
      actorKind: "system" as const,
      actorUserId: null,
      requestId: "hung-handler-test",
      summary: { changedFields: [], outcome: "completed" },
      leaseId: randomUUID(),
      version: 2,
      attemptCount: 1,
    };
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const repository = {
      claim: vi.fn().mockResolvedValue([claimedJob]),
      markDelivered: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(true),
    } as unknown as OperationsRepository;
    const dispatcher = {
      dispatch: vi.fn().mockImplementation(
        () =>
          new Promise<void>(() => {
            signalStarted();
          }),
      ),
    };
    const config = {
      ...parseServerEnvironment(createTestEnvironment()),
      operationsWorkerPollingEnabled: true,
      operationsWorkerPollMs: 1,
      operationsWorkerLeaseSeconds: 0.02,
    };
    const worker = new OperationsWorker(
      repository,
      dispatcher,
      { now: () => now },
      config,
      { error: vi.fn() } as never,
    );
    worker.onModuleInit();
    await started;
    const shutdownStartedAt = Date.now();
    await worker.onModuleDestroy();
    expect(Date.now() - shutdownStartedAt).toBeLessThan(500);
    expect(repository.markFailed).toHaveBeenCalledOnce();
  });

  it("reports scheduled poll failures without logging exception details", async () => {
    const secret = "PRIVATE-POLL-EXCEPTION";
    let reportFailure!: () => void;
    const reported = new Promise<void>((resolve) => {
      reportFailure = resolve;
    });
    const repository = {
      claim: vi.fn().mockRejectedValue(new Error(secret)),
    } as unknown as OperationsRepository;
    const logger = {
      error: vi.fn().mockImplementation(() => reportFailure()),
    };
    const config = {
      ...parseServerEnvironment(createTestEnvironment()),
      operationsWorkerPollingEnabled: true,
      operationsWorkerPollMs: 1,
    };
    const worker = new OperationsWorker(
      repository,
      { dispatch: vi.fn() },
      { now: () => new Date("2026-09-21T12:00:00.000Z") },
      config,
      logger as never,
    );
    worker.onModuleInit();
    await reported;
    await worker.onModuleDestroy();
    expect(logger.error).toHaveBeenCalledWith(
      "Operations worker poll failed",
      undefined,
      "OperationsWorker",
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(secret);
  });
});
