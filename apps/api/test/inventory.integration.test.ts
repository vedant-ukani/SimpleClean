import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@laundrorama/config";
import type { DatabaseConnection } from "@laundrorama/database";
import { createTestEnvironment } from "@laundrorama/test-support";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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
    .set("Idempotency-Key", randomUUID())
    .send({ displayName: "September Phoenix Load", sourceReference: "PO-42" })
    .expect(201);
  return {
    load: load.body.load as { id: string; version: number },
  };
}

describe("inventory foundation", () => {
  it("ignores preserved historical Location storage in Machine reads and search", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const records = await foundation(app, owner.cookies);
    const created = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "washer",
        sourceLoadId: records.load.id,
        model: "SC30",
      })
      .expect(201);
    const machineId = created.body.machine.id as string;
    const historicalLocationId = randomUUID();
    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    await database.execute(sql`
      insert into inventory_location (id, code, name)
      values (${historicalLocationId}, 'LEGACY-ONLY', 'Preserved historical bay')
    `);
    await database.execute(sql`
      update inventory_machine set current_location_id = ${historicalLocationId}
      where id = ${machineId}
    `);
    await database.execute(sql`
      insert into machine_location_history (
        id, machine_id, from_location_id, to_location_id,
        actor_user_id, request_id, machine_version
      ) values (
        ${randomUUID()}, ${machineId}, null, ${historicalLocationId},
        ${owner.identity.id}, 'historical-location-fixture', 1
      )
    `);

    const detail = await request(app.getHttpServer())
      .get(`/inventory/machines/${machineId}`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(detail.body.machine.model).toBe("SC30");
    expect(detail.body.machine).not.toHaveProperty("currentLocationId");
    expect(detail.body).not.toHaveProperty("locationHistory");
    await request(app.getHttpServer())
      .get("/inventory/machines")
      .query({ query: "LEGACY-ONLY" })
      .set("Cookie", owner.cookies)
      .expect(200)
      .expect(({ body }) => expect(body.total).toBe(0));
    const preserved = await database.execute(sql`
      select m.current_location_id, h.to_location_id
      from inventory_machine m
      inner join machine_location_history h on h.machine_id = m.id
      where m.id = ${machineId}
    `);
    const preservedRows = "rows" in preserved ? preserved.rows : preserved;
    expect(preservedRows).toEqual([
      {
        current_location_id: historicalLocationId,
        to_location_id: historicalLocationId,
      },
    ]);
  });

  it("creates, searches, and verifies a location-free provisional Machine with history", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const technician = await user(app, "technician_cleaner");
    const records = await foundation(app, owner.cookies);

    await request(app.getHttpServer())
      .patch(`/inventory/loads/${records.load.id}`)
      .set("Cookie", owner.cookies)
      .send({
        displayName: "September Phoenix Load — received",
        receivedAt: "2026-09-21T18:30:00.000Z",
        expectedVersion: records.load.version,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.load).toMatchObject({
          displayName: "September Phoenix Load — received",
          receivedAt: "2026-09-21T18:30:00.000Z",
          version: 2,
        });
      });

    const created = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", warehouse.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ machineType: "washer", sourceLoadId: records.load.id })
      .expect(201);
    expect(created.body.machine).toMatchObject({
      manufacturer: null,
      serial: null,
      identityVerificationState: "provisional",
      inventoryState: "expected",
      productionState: "not_assessed",
      version: 1,
    });
    expect(created.body.machine).not.toHaveProperty("currentLocationId");
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
        capacityLb: 40,
        expectedVersion: 1,
      })
      .expect(200);
    expect(identified.body.machine).toMatchObject({
      manufacturer: "Speed Queen",
      serial: "SQ 1001",
      capacityLb: 40,
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

    const correctedCapacity = await request(app.getHttpServer())
      .patch(`/inventory/machines/${machineId}/identity`)
      .set("Cookie", warehouse.cookies)
      .send({ capacityLb: 50, expectedVersion: 3 })
      .expect(200);
    expect(correctedCapacity.body.machine).toMatchObject({
      capacityLb: 50,
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
        expect(body.identityEvidence).toHaveLength(3);
        expect(body.verificationHistory).toHaveLength(1);
        expect(body.verificationHistory[0]).toMatchObject({
          fromState: "provisional",
          toState: "verified",
          conflictingMachineId: null,
          machineVersion: 3,
          actorUserId: warehouse.identity.id,
          requestId: expect.any(String),
        });
        expect(body.identityEvidence[0]).toMatchObject({
          manufacturer: "Speed Queen",
          capacityLb: 50,
          requestId: expect.any(String),
        });
        expect(body).not.toHaveProperty("locationHistory");
        expect(body.machine).not.toHaveProperty("currentLocationId");
      });

    const special = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", warehouse.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "other",
        sourceLoadId: records.load.id,
        model: "Tag%_Literal",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", warehouse.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "other",
        sourceLoadId: records.load.id,
        model: "TagXXLiteral",
      })
      .expect(201);
    await request(app.getHttpServer())
      .get("/inventory/machines")
      .query({ query: "%_" })
      .set("Cookie", technician.cookies)
      .expect(200)
      .expect(({ body }) => {
        expect(
          body.machines.map((machine: { id: string }) => machine.id),
        ).toEqual([special.body.machine.id]);
      });

    await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", warehouse.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Forbidden" })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/inventory/machines/${machineId}/identity`)
      .set("Cookie", technician.cookies)
      .send({ model: "forged", expectedVersion: 4 })
      .expect(403);
    const central = await app.get<DatabaseConnection>(DATABASE_CONNECTION)
      .database.execute(sql`
        select action from operations_audit_entry
        where target_id = ${machineId}
        order by created_at
      `);
    const centralRows = "rows" in central ? central.rows : central;
    expect(centralRows.map((row) => row.action)).toEqual([
      "inventory.machine.created",
      "inventory.machine.identity_updated",
      "inventory.machine.verified",
      "inventory.machine.identity_updated",
    ]);
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
      service.verifyMachine(
        first.id,
        { expectedVersion: first.version },
        context,
      ),
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
    expect(conflicted.verificationHistory).toEqual([
      expect.objectContaining({
        fromState: "provisional",
        toState: "conflict",
        conflictingMachineId: first.id,
        machineVersion: 2,
        actorUserId: warehouse.identity.id,
        requestId: expect.any(String),
      }),
    ]);
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
      service.verifyMachine(second.id, { expectedVersion: 3 }, context),
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
    const concurrentAContext = { ...context, requestId: "concurrent-a" };
    const concurrentBContext = { ...context, requestId: "concurrent-b" };
    const concurrent = await Promise.allSettled([
      service.verifyMachine(
        concurrentA.id,
        { expectedVersion: concurrentA.version },
        concurrentAContext,
      ),
      service.verifyMachine(
        concurrentB.id,
        { expectedVersion: concurrentB.version },
        concurrentBContext,
      ),
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
    const winnerId = String(claimRows[0]!.machine_id);
    const loserId =
      winnerId === concurrentA.id ? concurrentB.id : concurrentA.id;
    const winner = await service.getMachine(winnerId);
    const loser = await service.getMachine(loserId);
    expect(winner.machine).toMatchObject({
      identityVerificationState: "verified",
      conflictingMachineId: null,
      version: 2,
    });
    expect(loser.machine).toMatchObject({
      identityVerificationState: "conflict",
      conflictingMachineId: winnerId,
      version: 2,
    });
    expect(winner.verificationHistory).toEqual([
      expect.objectContaining({
        fromState: "provisional",
        toState: "verified",
        conflictingMachineId: null,
        machineVersion: 2,
        actorUserId: warehouse.identity.id,
        requestId:
          winnerId === concurrentA.id ? "concurrent-a" : "concurrent-b",
      }),
    ]);
    expect(loser.verificationHistory).toEqual([
      expect.objectContaining({
        fromState: "provisional",
        toState: "conflict",
        conflictingMachineId: winnerId,
        machineVersion: 2,
        actorUserId: warehouse.identity.id,
        requestId: loserId === concurrentA.id ? "concurrent-a" : "concurrent-b",
      }),
    ]);

    const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    const loserHistoryId = loser.verificationHistory[0]!.id;
    await expect(
      connection.database.execute(sql`
        update machine_identity_verification_history
        set to_state = 'verified'
        where id = ${loserHistoryId}
      `),
    ).rejects.toThrow();
    await expect(
      connection.database.execute(sql`
        delete from machine_identity_verification_history
        where id = ${loserHistoryId}
      `),
    ).rejects.toThrow();
    const preservedHistory = await connection.database.execute(sql`
      select to_state, conflicting_machine_id
      from machine_identity_verification_history
      where id = ${loserHistoryId}
    `);
    const preservedHistoryRows =
      "rows" in preservedHistory ? preservedHistory.rows : preservedHistory;
    expect(preservedHistoryRows).toEqual([
      { to_state: "conflict", conflicting_machine_id: winnerId },
    ]);
  });

  it("rejects stale versions and invalid input while removed routes return 404", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const records = await foundation(app, owner.cookies);
    const created = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", warehouse.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ machineType: "other", sourceLoadId: records.load.id })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/inventory/loads/${records.load.id}`)
      .set("Cookie", owner.cookies)
      .send({ displayName: "Changed", expectedVersion: 99 })
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
      .get("/inventory/locations")
      .set("Cookie", owner.cookies)
      .expect(404);
    await request(app.getHttpServer())
      .post("/inventory/locations")
      .set("Cookie", owner.cookies)
      .send({ code: "REMOVED", name: "Removed" })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/inventory/locations/${randomUUID()}`)
      .set("Cookie", owner.cookies)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/inventory/machines/${created.body.machine.id}/relocate`)
      .set("Cookie", warehouse.cookies)
      .send({ toLocationId: randomUUID(), expectedVersion: 1 })
      .expect(404);

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
