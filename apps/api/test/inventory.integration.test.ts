import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@simply-clean/config";
import type { DatabaseConnection } from "@simply-clean/database";
import { createTestEnvironment } from "@simply-clean/test-support";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { IdentityService } from "../src/modules/identity/identity.service.js";
import { InventoryService } from "../src/modules/inventory/inventory.service.js";
import { DATABASE_CONNECTION } from "../src/platform/database.module.js";

const applications: INestApplication[] = [];

afterEach(async () => {
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
  const email = `${role}@example.test`;
  const password = `${role}-secure-password`;
  const identity = await app
    .get(IdentityService)
    .provisionUser(
      { name: role, email, password, role },
      { requestId: `provision-${role}` },
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

async function foundation(app: INestApplication, ownerCookies: string[]) {
  const load = await request(app.getHttpServer())
    .post("/inventory/loads")
    .set("Cookie", ownerCookies)
    .send({ displayName: "September Phoenix Load", sourceReference: "PO-42" })
    .expect(201);
  const receiving = await request(app.getHttpServer())
    .post("/inventory/locations")
    .set("Cookie", ownerCookies)
    .send({ code: "REC-01", name: "Receiving bay" })
    .expect(201);
  const storage = await request(app.getHttpServer())
    .post("/inventory/locations")
    .set("Cookie", ownerCookies)
    .send({ code: "A-12", name: "Storage aisle A" })
    .expect(201);
  return {
    load: load.body.load as { id: string; version: number },
    receiving: receiving.body.location as { id: string; version: number },
    storage: storage.body.location as { id: string; version: number },
  };
}

describe("inventory foundation", () => {
  it("creates, searches, verifies, and relocates a provisional Machine with history", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const technician = await user(app, "technician_cleaner");
    const records = await foundation(app, owner.cookies);

    const created = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", warehouse.cookies)
      .send({ machineType: "washer", sourceLoadId: records.load.id })
      .expect(201);
    expect(created.body.machine).toMatchObject({
      manufacturer: null,
      serial: null,
      identityVerificationState: "provisional",
      inventoryState: "expected",
      productionState: "not_started",
      version: 1,
    });
    const machineId = created.body.machine.id as string;

    const identified = await request(app.getHttpServer())
      .patch(`/inventory/machines/${machineId}/identity`)
      .set("Cookie", warehouse.cookies)
      .send({
        manufacturer: "  Speed   Queen ",
        model: "SC30",
        serial: " SQ 1001 ",
        voltage: "208-240V",
        phase: "three_phase",
        expectedVersion: 1,
      })
      .expect(200);
    expect(identified.body.machine).toMatchObject({
      manufacturer: "Speed Queen",
      serial: "SQ 1001",
      identityVerificationState: "provisional",
      version: 2,
    });

    const verified = await request(app.getHttpServer())
      .post(`/inventory/machines/${machineId}/verify`)
      .set("Cookie", warehouse.cookies)
      .send({ expectedVersion: 2 })
      .expect(201);
    expect(verified.body.machine).toMatchObject({
      identityVerificationState: "verified",
      version: 3,
    });

    const relocated = await request(app.getHttpServer())
      .post(`/inventory/machines/${machineId}/relocate`)
      .set("Cookie", warehouse.cookies)
      .send({ toLocationId: records.receiving.id, expectedVersion: 3 })
      .expect(201);
    expect(relocated.body.machine).toMatchObject({
      currentLocationCode: "REC-01",
      inventoryState: "on_hand",
      version: 4,
    });

    await request(app.getHttpServer())
      .get("/inventory/machines")
      .query({ query: "sq 1001" })
      .set("Cookie", technician.cookies)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(1);
        expect(body.machines[0].id).toBe(machineId);
      });

    await request(app.getHttpServer())
      .get(`/inventory/machines/${machineId}`)
      .set("Cookie", technician.cookies)
      .expect(200)
      .expect(({ body }) => {
        expect(body.identityEvidence).toHaveLength(2);
        expect(body.identityEvidence[0]).toMatchObject({
          manufacturer: "  Speed   Queen ",
          requestId: expect.any(String),
        });
        expect(body.locationHistory).toHaveLength(1);
        expect(body.locationHistory[0]).toMatchObject({
          toLocationId: records.receiving.id,
          machineVersion: 4,
        });
      });

    await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", warehouse.cookies)
      .send({ displayName: "Forbidden" })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/inventory/machines/${machineId}/identity`)
      .set("Cookie", technician.cookies)
      .send({ model: "forged", expectedVersion: 4 })
      .expect(403);
  });

  it("persists normalized duplicate conflicts and permits correction", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const records = await foundation(app, owner.cookies);
    const service = app.get(InventoryService);
    const context = {
      actorUserId: warehouse.identity.id,
      requestId: "duplicate-test",
    };

    const first = await service.createMachine(
      {
        machineType: "dryer",
        sourceLoadId: records.load.id,
        manufacturer: "ADC",
        serial: "D-900",
      },
      context,
    );
    const second = await service.createMachine(
      {
        machineType: "dryer",
        sourceLoadId: records.load.id,
        manufacturer: " adc ",
        serial: " d-900 ",
      },
      context,
    );
    await expect(
      service.verifyMachine(first.id, { expectedVersion: first.version }),
    ).resolves.toMatchObject({ identityVerificationState: "verified" });
    await request(app.getHttpServer())
      .post(`/inventory/machines/${second.id}/verify`)
      .set("Cookie", warehouse.cookies)
      .send({ expectedVersion: second.version })
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          statusCode: 409,
          code: "identity_conflict",
          conflictingMachineId: first.id,
          machine: {
            id: second.id,
            identityVerificationState: "conflict",
          },
        });
      });

    const conflicted = await service.getMachine(second.id);
    expect(conflicted.machine).toMatchObject({
      identityVerificationState: "conflict",
      conflictingMachineId: first.id,
      version: 2,
    });
    const corrected = await service.updateMachineIdentity(
      second.id,
      { serial: "D-901", expectedVersion: 2 },
      context,
    );
    expect(corrected).toMatchObject({
      identityVerificationState: "provisional",
      conflictingMachineId: null,
      version: 3,
    });
    await expect(
      service.verifyMachine(second.id, { expectedVersion: 3 }),
    ).resolves.toMatchObject({
      identityVerificationState: "verified",
      version: 4,
    });

    const concurrentA = await service.createMachine(
      {
        machineType: "washer",
        sourceLoadId: records.load.id,
        manufacturer: "Maytag",
        serial: "M-500",
      },
      context,
    );
    const concurrentB = await service.createMachine(
      {
        machineType: "washer",
        sourceLoadId: records.load.id,
        manufacturer: " MAYTAG ",
        serial: " m-500 ",
      },
      context,
    );
    const concurrent = await Promise.allSettled([
      service.verifyMachine(concurrentA.id, {
        expectedVersion: concurrentA.version,
      }),
      service.verifyMachine(concurrentB.id, {
        expectedVersion: concurrentB.version,
      }),
    ]);
    expect(concurrent.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const claims = await app.get<DatabaseConnection>(DATABASE_CONNECTION)
      .database.execute(sql`
        select machine_id from machine_identity_claim
        where normalized_manufacturer = 'maytag'
          and normalized_serial = 'm-500'
      `);
    const claimRows = "rows" in claims ? claims.rows : claims;
    expect(claimRows).toHaveLength(1);
  });

  it("rejects stale versions, invalid input, and inactive destinations", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const records = await foundation(app, owner.cookies);
    const created = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", warehouse.cookies)
      .send({ machineType: "other", sourceLoadId: records.load.id })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/inventory/loads/${records.load.id}`)
      .set("Cookie", owner.cookies)
      .send({ displayName: "Changed", expectedVersion: 99 })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/inventory/locations/${records.receiving.id}`)
      .set("Cookie", owner.cookies)
      .send({ name: "Changed", expectedVersion: 99 })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/inventory/machines/${created.body.machine.id}/identity`)
      .set("Cookie", warehouse.cookies)
      .send({ model: "stale", expectedVersion: 99 })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/inventory/machines/${created.body.machine.id}/identity`)
      .set("Cookie", warehouse.cookies)
      .send({ phase: "unknown", expectedVersion: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/inventory/locations/${records.storage.id}/deactivate`)
      .set("Cookie", owner.cookies)
      .send({ expectedVersion: records.storage.version })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/inventory/machines/${created.body.machine.id}/relocate`)
      .set("Cookie", warehouse.cookies)
      .send({ toLocationId: records.storage.id, expectedVersion: 1 })
      .expect(409);

    const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    const evidence = await connection.database.execute(sql`
      select id, machine_id from machine_identity_evidence
      where machine_id = ${created.body.machine.id}
    `);
    const rows = "rows" in evidence ? evidence.rows : evidence;
    expect(rows).toHaveLength(1);
    await expect(
      connection.database.execute(sql`
        update machine_identity_evidence
        set serial = 'rewritten'
        where machine_id = ${created.body.machine.id}
      `),
    ).rejects.toThrow();
    const preserved = await connection.database.execute(sql`
      select serial from machine_identity_evidence
      where machine_id = ${created.body.machine.id}
    `);
    const preservedRows = "rows" in preserved ? preserved.rows : preserved;
    expect(preservedRows).toEqual([{ serial: null }]);
  });
});
