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
import { DATABASE_CONNECTION } from "../src/platform/database.module.js";

const apps: INestApplication[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return result && typeof result === "object" && "rows" in result
    ? rows(result.rows)
    : [];
}
async function app() {
  const module = await Test.createTestingModule({
    imports: [
      AppModule.register(parseServerEnvironment(createTestEnvironment())),
    ],
  }).compile();
  await module.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();
  const application = module.createNestApplication({ bodyParser: false });
  apps.push(application);
  await application.init();
  return application;
}
async function user(
  application: INestApplication,
  role: "owner_admin" | "warehouse" | "technician_cleaner",
) {
  const email = `${role}@production.test`;
  const password = `${role}-secure-password`;
  const identity = await application
    .get(IdentityService)
    .provisionUser(
      { name: role, email, password, role },
      { requestId: `provision-${role}` },
    );
  const response = await request(application.getHttpServer())
    .post("/auth/sign-in/email")
    .set("origin", "http://localhost:3000")
    .send({ email, password })
    .expect(200);
  return {
    identity,
    cookies: response.headers["set-cookie"] as unknown as string[],
  };
}
async function machine(application: INestApplication, cookies: string[]) {
  const load = await request(application.getHttpServer())
    .post("/inventory/loads")
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({ displayName: `Production Load ${randomUUID()}` })
    .expect(201);
  const result = await request(application.getHttpServer())
    .post("/inventory/machines")
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({
      machineType: "washer",
      sourceLoadId: load.body.load.id,
      inventoryState: "on_hand",
    })
    .expect(201);
  return result.body.machine as { id: string; version: number };
}
const inspection = (
  expectedMachineVersion: number,
  recommendation: string,
  evidenceFileIds: string[] = [],
) => ({
  expectedMachineVersion,
  condition: "Drum turns by hand",
  bearingAssessment: "concern_observed",
  bearingNotes: "Noise heard",
  missingParts: "Coin box key",
  damage: "Dented side",
  recommendation,
  reason: "Human economic review requested",
  evidenceFileIds,
});
function record(
  application: INestApplication,
  machineId: string,
  cookies: string[],
  body: object,
  key = randomUUID(),
) {
  return request(application.getHttpServer())
    .post(`/inventory/machines/${machineId}/production/inspections`)
    .set("Cookie", cookies)
    .set("Idempotency-Key", key)
    .send(body);
}

describe("preliminary inspection and disposition", () => {
  it("rolls inspection, decision, lifecycle, and idempotency back when outbox recording fails", async () => {
    const application = await app();
    const owner = await user(application, "owner_admin");
    const current = await machine(application, owner.cookies);
    const database =
      application.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    await database.execute(sql`
      create function reject_production_outbox() returns trigger as $$
      begin
        if new.event_type = 'production.preliminary_inspection.recorded' then
          raise exception 'forced production recorder failure';
        end if;
        return new;
      end;
      $$ language plpgsql
    `);
    await database.execute(sql`
      create trigger reject_production_outbox_trigger before insert
      on platform_outbox_job for each row execute function reject_production_outbox()
    `);
    const key = randomUUID();
    const body = inspection(1, "repairable");
    await record(application, current.id, owner.cookies, body, key).expect(500);
    expect(
      rows(
        await database.execute(
          sql`select id from production_preliminary_inspection where machine_id = ${current.id}`,
        ),
      ),
    ).toHaveLength(0);
    expect(
      rows(
        await database.execute(
          sql`select id from production_preliminary_disposition where machine_id = ${current.id}`,
        ),
      ),
    ).toHaveLength(0);
    const unchanged = await request(application.getHttpServer())
      .get(`/inventory/machines/${current.id}`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(unchanged.body.machine).toMatchObject({
      version: 1,
      inventoryState: "on_hand",
      productionState: "not_assessed",
    });
    await database.execute(
      sql`drop trigger reject_production_outbox_trigger on platform_outbox_job`,
    );
    const retried = await record(
      application,
      current.id,
      owner.cookies,
      body,
      key,
    ).expect(201);
    expect(retried.body.inspections).toHaveLength(1);
    expect(retried.body.machine).toMatchObject({
      version: 2,
      productionState: "awaiting_test",
    });
  });

  it("routes staff Parts-only to Owner review, preserves private evidence, and finalizes atomically", async () => {
    const application = await app();
    const owner = await user(application, "owner_admin");
    const warehouse = await user(application, "warehouse");
    const technician = await user(application, "technician_cleaner");
    const current = await machine(application, owner.cookies);
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const grant = await request(application.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", warehouse.cookies)
      .send({
        target: { type: "machine", id: current.id },
        purpose: "preliminary_inspection",
        originalFilename: "bearing.jpg",
        declaredMediaType: "image/jpeg",
        declaredByteCount: image.length,
      })
      .expect(201);
    const fileId = grant.body.file.id as string;
    await request(application.getHttpServer())
      .post(`/files/${fileId}/upload-content`)
      .set("Cookie", warehouse.cookies)
      .set("x-file-grant", grant.body.grant.token)
      .attach("file", image, {
        filename: "bearing.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);
    const key = randomUUID();
    const body = inspection(current.version, "parts_only", [fileId]);
    const first = await record(
      application,
      current.id,
      warehouse.cookies,
      body,
      key,
    ).expect(201);
    expect(first.body.machine).toMatchObject({
      inventoryState: "on_hand",
      productionState: "blocked",
      version: current.version + 1,
    });
    expect(first.body.currentDisposition).toMatchObject({
      disposition: "owner_review",
      decidedByUserId: warehouse.identity.id,
      approvedByUserId: null,
    });
    expect(first.body.inspections[0]).toMatchObject({
      recommendation: "parts_only",
      bearingAssessment: "concern_observed",
      evidence: [{ id: fileId, state: "ready" }],
    });
    expect(JSON.stringify(first.body)).not.toContain("storageKey");
    const replay = await record(
      application,
      current.id,
      warehouse.cookies,
      body,
      key,
    ).expect(201);
    expect(replay.body.inspections).toHaveLength(1);
    await record(
      application,
      current.id,
      warehouse.cookies,
      { ...body, damage: "Changed" },
      key,
    ).expect(409);
    await record(
      application,
      current.id,
      warehouse.cookies,
      inspection(current.version, "hold"),
    ).expect(409);
    await request(application.getHttpServer())
      .post(
        `/inventory/machines/${current.id}/production/inspections/${first.body.inspections[0].id}/dispositions`,
      )
      .set("Cookie", warehouse.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        expectedMachineVersion: current.version + 1,
        disposition: "parts_only",
        reason: "Approve donor use",
      })
      .expect(403);
    const approvalKey = randomUUID();
    const approvalBody = {
      expectedMachineVersion: current.version + 1,
      disposition: "parts_only",
      reason: "Approve donor use",
    };
    const approved = await request(application.getHttpServer())
      .post(
        `/inventory/machines/${current.id}/production/inspections/${first.body.inspections[0].id}/dispositions`,
      )
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", approvalKey)
      .send(approvalBody)
      .expect(201);
    expect(approved.body.machine).toMatchObject({
      inventoryState: "scrapped",
      productionState: "blocked",
      version: current.version + 2,
    });
    await request(application.getHttpServer())
      .post(`/inventory/machines/${current.id}/relocate`)
      .set("Cookie", warehouse.cookies)
      .send({
        toLocationId: randomUUID(),
        expectedVersion: current.version + 2,
      })
      .expect(404);
    const afterRemovedRoute = await request(application.getHttpServer())
      .get(`/inventory/machines/${current.id}`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(afterRemovedRoute.body.machine).toMatchObject({
      inventoryState: "scrapped",
      version: current.version + 2,
    });
    expect(approved.body.decisions).toHaveLength(2);
    expect(approved.body.currentDisposition).toMatchObject({
      disposition: "parts_only",
      approvedByUserId: owner.identity.id,
      decidedByUserId: owner.identity.id,
    });
    const approvalReplay = await request(application.getHttpServer())
      .post(
        `/inventory/machines/${current.id}/production/inspections/${first.body.inspections[0].id}/dispositions`,
      )
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", approvalKey)
      .send(approvalBody)
      .expect(201);
    expect(approvalReplay.body.decisions).toHaveLength(2);
    await request(application.getHttpServer())
      .post(
        `/inventory/machines/${current.id}/production/inspections/${first.body.inspections[0].id}/dispositions`,
      )
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", approvalKey)
      .send({ ...approvalBody, reason: "Changed approval" })
      .expect(409);
    await record(
      application,
      current.id,
      warehouse.cookies,
      inspection(current.version + 2, "repairable"),
    ).expect(409);
    const read = await request(application.getHttpServer())
      .get(`/inventory/machines/${current.id}/production`)
      .set("Cookie", technician.cookies)
      .expect(200);
    expect(read.body.inspections).toHaveLength(1);
    expect(
      read.body.decisions.map(
        (entry: { disposition: string }) => entry.disposition,
      ),
    ).toEqual(["parts_only", "owner_review"]);
    const database =
      application.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    await expect(
      database.execute(
        sql`update production_preliminary_inspection set condition = 'changed' where machine_id = ${current.id}`,
      ),
    ).rejects.toThrow();
    await expect(
      database.execute(
        sql`delete from production_preliminary_disposition where machine_id = ${current.id}`,
      ),
    ).rejects.toThrow();
    await expect(
      database.execute(
        sql`delete from production_preliminary_evidence where inspection_id = ${first.body.inspections[0].id}`,
      ),
    ).rejects.toThrow();
    const audit = rows(
      await database.execute(
        sql`select action from operations_audit_entry where target_id = ${current.id} and action = 'inventory.machine.lifecycle_updated'`,
      ),
    );
    expect(audit).toHaveLength(2);
  });

  it("enforces evidence boundaries, latest-inspection fencing, and each lifecycle mapping", async () => {
    const application = await app();
    const owner = await user(application, "owner_admin");
    const warehouse = await user(application, "warehouse");
    const firstMachine = await machine(application, owner.cookies);
    const otherMachine = await machine(application, owner.cookies);
    const wrongFile = await request(application.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", warehouse.cookies)
      .send({
        target: { type: "machine", id: otherMachine.id },
        purpose: "preliminary_inspection",
        originalFilename: "pending.jpg",
        declaredMediaType: "image/jpeg",
        declaredByteCount: 4,
      })
      .expect(201);
    await record(
      application,
      firstMachine.id,
      warehouse.cookies,
      inspection(1, "hold", [wrongFile.body.file.id]),
    ).expect(409);
    const database =
      application.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    expect(
      rows(
        await database.execute(
          sql`select id from production_preliminary_inspection where machine_id = ${firstMachine.id}`,
        ),
      ),
    ).toHaveLength(0);
    const repair = await record(
      application,
      firstMachine.id,
      warehouse.cookies,
      inspection(1, "repairable"),
    ).expect(201);
    expect(repair.body.machine).toMatchObject({
      inventoryState: "on_hand",
      productionState: "awaiting_test",
    });
    const hold = await record(
      application,
      firstMachine.id,
      warehouse.cookies,
      inspection(2, "hold"),
    ).expect(201);
    expect(hold.body.machine).toMatchObject({
      inventoryState: "on_hand",
      productionState: "blocked",
    });
    const review = await record(
      application,
      firstMachine.id,
      warehouse.cookies,
      inspection(3, "owner_review"),
    ).expect(201);
    expect(review.body.machine).toMatchObject({
      inventoryState: "on_hand",
      productionState: "blocked",
    });
    expect(review.body.inspections).toHaveLength(3);
    await request(application.getHttpServer())
      .post(
        `/inventory/machines/${firstMachine.id}/production/inspections/${repair.body.inspections[0].id}/dispositions`,
      )
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        expectedMachineVersion: 4,
        disposition: "scrap",
        reason: "Old inspection",
      })
      .expect(409);
    const scrap = await request(application.getHttpServer())
      .post(
        `/inventory/machines/${firstMachine.id}/production/inspections/${review.body.inspections[0].id}/dispositions`,
      )
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        expectedMachineVersion: 4,
        disposition: "scrap",
        reason: "Owner decision",
      })
      .expect(201);
    expect(scrap.body.machine).toMatchObject({
      inventoryState: "scrapped",
      productionState: "blocked",
    });
    expect(scrap.body.machine.productionState).not.toBe("qa_released");
    const ownerDirect = await record(
      application,
      otherMachine.id,
      owner.cookies,
      inspection(1, "parts_only"),
    ).expect(201);
    expect(ownerDirect.body.currentDisposition).toMatchObject({
      disposition: "parts_only",
      approvedByUserId: owner.identity.id,
    });
    expect(ownerDirect.body.machine).toMatchObject({
      inventoryState: "scrapped",
      productionState: "blocked",
    });
  });
});
