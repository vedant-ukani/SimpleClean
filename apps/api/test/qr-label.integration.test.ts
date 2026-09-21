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
import { QrLabelService } from "../src/modules/inventory/qr/qr-label.service.js";
import { QrLabelSigner } from "../src/modules/inventory/qr/qr-label.signer.js";
import { OperationsRepository } from "../src/modules/operations/operations.repository.js";
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
  vi.restoreAllMocks();
  await Promise.all(
    applications.splice(0).map((application) => application.close()),
  );
});

async function createApplication(): Promise<INestApplication> {
  const config = parseServerEnvironment(createTestEnvironment());
  const module = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();
  await module.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();
  const app = module.createNestApplication({ bodyParser: false });
  applications.push(app);
  await app.init();
  return app;
}

async function user(
  app: INestApplication,
  role: "owner_admin" | "warehouse" | "technician_cleaner",
) {
  const email = `qr-${role}@example.test`;
  const password = `${role}-secure-password`;
  const identity = await app
    .get(IdentityService)
    .provisionUser(
      { name: role, email, password, role },
      { requestId: `provision-qr-${role}` },
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

async function machine(app: INestApplication, cookies: string[]) {
  const load = await request(app.getHttpServer())
    .post("/inventory/loads")
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({ displayName: "QR intake load" })
    .expect(201);
  const created = await request(app.getHttpServer())
    .post("/inventory/machines")
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({
      machineType: "washer",
      manufacturer: "Private Manufacturer",
      model: "Private Model",
      serial: "PRIVATE-SERIAL-42",
      sourceLoadId: load.body.load.id,
    })
    .expect(201);
  return created.body.machine as { id: string };
}

describe("Inventory QR labels", () => {
  it("creates, prints, resolves, reissues, revokes, and preserves private history", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const technician = await user(app, "technician_cleaner");
    const createdMachine = await machine(app, owner.cookies);

    await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels`)
      .set("Cookie", warehouse.cookies)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels`)
      .set("Cookie", technician.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({})
      .expect(403);

    const createKey = randomUUID();
    const created = await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels`)
      .set("Cookie", warehouse.cookies)
      .set("Idempotency-Key", createKey)
      .send({})
      .expect(201);
    expect(created.body).toEqual({
      label: expect.objectContaining({
        id: expect.any(String),
        machineId: createdMachine.id,
        fallbackCode: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{16}$/),
        state: "active",
        version: 1,
      }),
    });
    expect(JSON.stringify(created.body)).not.toContain("PRIVATE-SERIAL-42");
    expect(created.body).not.toHaveProperty("token");

    await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels`)
      .set("Cookie", warehouse.cookies)
      .set("Idempotency-Key", createKey)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body.label.id).toBe(created.body.label.id));
    await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels`)
      .set("Cookie", warehouse.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({})
      .expect(409);

    await request(app.getHttpServer())
      .get(`/inventory/machines/${createdMachine.id}/qr-labels`)
      .set("Cookie", technician.cookies)
      .expect(200)
      .expect(({ body }) => {
        expect(body.labels).toHaveLength(1);
        expect(body.labels[0].id).toBe(created.body.label.id);
      });

    const printed = await request(app.getHttpServer())
      .get(`/inventory/qr-labels/${created.body.label.id}/print`)
      .set("Cookie", warehouse.cookies)
      .expect(200)
      .expect("Cache-Control", "private, no-store")
      .expect("X-Content-Type-Options", "nosniff")
      .expect("Content-Type", /image\/svg\+xml/);
    const printedSvg = Buffer.from(printed.body as Uint8Array).toString("utf8");
    expect(printedSvg).toContain("Simply Clean Equipment");
    expect(printedSvg).toContain(created.body.label.fallbackCode);
    expect(printedSvg).not.toContain("PRIVATE-SERIAL-42");
    expect(printedSvg).not.toContain(createdMachine.id);

    const token = app.get(QrLabelSigner).sign(created.body.label.id as string);
    for (const { cookies, body } of [
      { cookies: owner.cookies, body: { token } },
      {
        cookies: warehouse.cookies,
        body: { fallbackCode: created.body.label.fallbackCode },
      },
      { cookies: technician.cookies, body: { token } },
    ]) {
      await request(app.getHttpServer())
        .post("/inventory/qr-labels/resolve")
        .set("Cookie", cookies)
        .send(body)
        .expect(201)
        .expect(({ body: responseBody }) => {
          expect(responseBody.machine.id).toBe(createdMachine.id);
          expect(responseBody.machine.serial).toBe("PRIVATE-SERIAL-42");
        });
    }
    await request(app.getHttpServer())
      .post("/inventory/qr-labels/resolve")
      .send({ token })
      .expect(401);

    const genericFailures = await Promise.all([
      request(app.getHttpServer())
        .post("/inventory/qr-labels/resolve")
        .set("Cookie", technician.cookies)
        .send({ token: `${token.slice(0, -1)}A` }),
      request(app.getHttpServer())
        .post("/inventory/qr-labels/resolve")
        .set("Cookie", technician.cookies)
        .send({ fallbackCode: "0000000000000000" }),
      request(app.getHttpServer())
        .post("/inventory/qr-labels/resolve")
        .set("Cookie", technician.cookies)
        .send({ token: createdMachine.id }),
    ]);
    expect(genericFailures.map(({ status }) => status)).toEqual([
      404, 404, 404,
    ]);
    expect(
      genericFailures.map(({ body }) => ({
        statusCode: body.statusCode,
        message: body.message,
      })),
    ).toEqual([
      { statusCode: 404, message: "QR Label not found" },
      { statusCode: 404, message: "QR Label not found" },
      { statusCode: 404, message: "QR Label not found" },
    ]);

    const reissueKey = randomUUID();
    const reissued = await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels/reissue`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", reissueKey)
      .send({
        expectedLabelId: created.body.label.id,
        expectedVersion: created.body.label.version,
      })
      .expect(201);
    expect(reissued.body.label).toMatchObject({
      machineId: createdMachine.id,
      state: "active",
      version: 2,
    });
    expect(reissued.body.label.id).not.toBe(created.body.label.id);
    await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels/reissue`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", reissueKey)
      .send({ expectedLabelId: created.body.label.id, expectedVersion: 1 })
      .expect(201)
      .expect(({ body }) => expect(body.label.id).toBe(reissued.body.label.id));
    await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels/reissue`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedLabelId: created.body.label.id, expectedVersion: 1 })
      .expect(409);
    await request(app.getHttpServer())
      .post("/inventory/qr-labels/resolve")
      .set("Cookie", technician.cookies)
      .send({ token })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/inventory/qr-labels/${reissued.body.label.id}/revoke`)
      .set("Cookie", technician.cookies)
      .send({ expectedVersion: 2 })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/inventory/qr-labels/${reissued.body.label.id}/revoke`)
      .set("Cookie", warehouse.cookies)
      .send({ expectedVersion: 99 })
      .expect(409);
    const revoked = await request(app.getHttpServer())
      .post(`/inventory/qr-labels/${reissued.body.label.id}/revoke`)
      .set("Cookie", warehouse.cookies)
      .send({ expectedVersion: 2 })
      .expect(201);
    expect(revoked.body.label).toMatchObject({ state: "revoked", version: 3 });
    await request(app.getHttpServer())
      .get(`/inventory/qr-labels/${reissued.body.label.id}/print`)
      .set("Cookie", warehouse.cookies)
      .expect(404);

    const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    const labelRows = resultRows<{
      id: string;
      state: string;
      version: number;
    }>(
      await connection.database.execute(sql`
        select id, state, version from inventory_qr_label
        where machine_id = ${createdMachine.id}
        order by issued_at
      `),
    );
    expect(labelRows).toEqual([
      { id: created.body.label.id, state: "revoked", version: 2 },
      { id: reissued.body.label.id, state: "revoked", version: 3 },
    ]);
    const activities = resultRows<{
      action: string;
      label_id: string;
      request_id: string;
    }>(
      await connection.database.execute(sql`
        select action, label_id, request_id
        from inventory_qr_label_activity
        where machine_id = ${createdMachine.id}
        order by created_at, id
      `),
    );
    expect(activities.map(({ action }) => action).sort()).toEqual(
      [
        "created",
        "printed",
        "resolved",
        "resolved",
        "resolved",
        "revoked",
        "reissued",
        "revoked",
      ].sort(),
    );
    expect(JSON.stringify(activities)).not.toContain(token);
    expect(JSON.stringify(activities)).not.toContain(
      created.body.label.fallbackCode,
    );

    const central = resultRows<{
      action: string;
      safe_summary: unknown;
    }>(
      await connection.database.execute(sql`
        select action, safe_summary from operations_audit_entry
        where target_type = 'qr_label'
        order by created_at, id
      `),
    );
    expect(central.map(({ action }) => action)).toEqual([
      "inventory.qr_label.created",
      "inventory.qr_label.reissued",
      "inventory.qr_label.revoked",
    ]);
    expect(JSON.stringify(central)).not.toContain(token);
    expect(JSON.stringify(central)).not.toContain(
      created.body.label.fallbackCode,
    );
    const outbox = resultRows<{ count: number }>(
      await connection.database.execute(sql`
        select count(*)::integer as count from platform_outbox_job
        where target_type = 'qr_label'
      `),
    );
    expect(Number(outbox[0]?.count)).toBe(3);

    await expect(
      connection.database.execute(sql`
        update inventory_qr_label_activity set action = 'printed'
        where label_id = ${created.body.label.id}
      `),
    ).rejects.toThrow();
    await expect(
      connection.database.execute(sql`
        delete from inventory_qr_label where id = ${created.body.label.id}
      `),
    ).rejects.toThrow();
  });

  it("deduplicates concurrent creates and rolls lifecycle work back with Operations", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const createdMachine = await machine(app, owner.cookies);
    const key = randomUUID();
    const concurrent = await Promise.all([
      request(app.getHttpServer())
        .post(`/inventory/machines/${createdMachine.id}/qr-labels`)
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", key)
        .send({}),
      request(app.getHttpServer())
        .post(`/inventory/machines/${createdMachine.id}/qr-labels`)
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", key)
        .send({}),
    ]);
    expect(concurrent.map(({ status }) => status)).toEqual([201, 201]);
    expect(concurrent[0]!.body.label.id).toBe(concurrent[1]!.body.label.id);

    const secondMachine = await machine(app, owner.cookies);
    const operations = app.get(OperationsRepository);
    const originalRecord = operations.record.bind(operations);
    vi.spyOn(operations, "record").mockImplementation((database, input) => {
      if (input.action === "inventory.qr_label.created") {
        throw new Error("forced recorder failure with PRIVATE-CONTENT");
      }
      return originalRecord(database, input);
    });
    await request(app.getHttpServer())
      .post(`/inventory/machines/${secondMachine.id}/qr-labels`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({})
      .expect(500);

    const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    const activeCounts = resultRows<{ machine_id: string; count: number }>(
      await connection.database.execute(sql`
        select machine_id, count(*)::integer as count
        from inventory_qr_label where state = 'active'
        group by machine_id order by machine_id
      `),
    );
    expect(activeCounts).toEqual([{ machine_id: createdMachine.id, count: 1 }]);
    const failedActivities = resultRows(
      await connection.database.execute(sql`
        select id from inventory_qr_label_activity
        where machine_id = ${secondMachine.id}
      `),
    );
    expect(failedActivities).toHaveLength(0);

    await expect(
      app.get(QrLabelService).create(
        secondMachine.id,
        {},
        {
          actorUserId: owner.identity.id,
          requestId: "direct-auth-check",
          role: "technician_cleaner",
          idempotencyKey: randomUUID(),
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("binds reissue to the exact active label across ABA and concurrent requests", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const createdMachine = await machine(app, owner.cookies);

    const first = await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/inventory/qr-labels/${first.body.label.id}/revoke`)
      .set("Cookie", owner.cookies)
      .send({ expectedVersion: first.body.label.version })
      .expect(201);
    const replacement = await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/inventory/machines/${createdMachine.id}/qr-labels/reissue`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        expectedLabelId: first.body.label.id,
        expectedVersion: first.body.label.version,
      })
      .expect(409);

    const concurrent = await Promise.all([
      request(app.getHttpServer())
        .post(`/inventory/machines/${createdMachine.id}/qr-labels/reissue`)
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", randomUUID())
        .send({
          expectedLabelId: replacement.body.label.id,
          expectedVersion: replacement.body.label.version,
        }),
      request(app.getHttpServer())
        .post(`/inventory/machines/${createdMachine.id}/qr-labels/reissue`)
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", randomUUID())
        .send({
          expectedLabelId: replacement.body.label.id,
          expectedVersion: replacement.body.label.version,
        }),
    ]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([201, 409]);

    const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    const active = resultRows<{ id: string }>(
      await connection.database.execute(sql`
        select id from inventory_qr_label
        where machine_id = ${createdMachine.id} and state = 'active'
      `),
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(
      concurrent.find(({ status }) => status === 201)?.body.label.id,
    );
  });
});
