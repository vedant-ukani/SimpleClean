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

async function signIn(app: INestApplication) {
  const email = "intake-owner@example.test";
  const identity = await app.get(IdentityService).provisionUser(
    {
      name: "intake-owner",
      email,
      password: "intake-owner-password",
      role: "owner_admin",
    },
    { requestId: randomUUID() },
  );
  const response = await request(app.getHttpServer())
    .post("/auth/sign-in/email")
    .set("origin", "http://localhost:3000")
    .send({ email, password: "intake-owner-password" })
    .expect(200);
  return {
    cookies: response.headers["set-cookie"] as unknown as string[],
    userId: identity.id,
  };
}

async function loadReceipt(db: DatabaseConnection["database"], loadId: string) {
  const result = await db.execute(
    sql`select received_at, version from inventory_load where id = ${loadId}`,
  );
  const records = "rows" in result ? result.rows : result;
  return records[0] as { received_at: Date | null; version: number };
}

async function loadReceiptMutations(
  db: DatabaseConnection["database"],
  loadId: string,
) {
  const result = await db.execute(sql`
    select
      (select count(*)::int from operations_audit_entry
       where target_id = ${loadId} and action = 'inventory.load.updated') as audit_count,
      (select count(*)::int from platform_outbox_job
       where target_id = ${loadId} and event_type = 'inventory.load.updated') as outbox_count
  `);
  const records = "rows" in result ? result.rows : result;
  return records[0] as { audit_count: number; outbox_count: number };
}

describe("Intake API", () => {
  it("creates an open batch and preserves its route identity", async () => {
    const app = await createApplication();
    const { cookies } = await signIn(app);
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Intake test load" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const created = await request(app.getHttpServer())
      .post(`/inventory/loads/${loadId}/intake`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(201);
    const batchId = created.body.batch.id as string;
    await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}`)
      .set("Cookie", cookies)
      .expect(200)
      .expect(({ body }) => {
        expect(body.batch.id).toBe(batchId);
        expect(body.batch.loadId).toBe(loadId);
        expect(body.batch.state).toBe("open");
      });
  });

  it("receives a Load once when its final active Intake batch commits", async () => {
    const app = await createApplication();
    const { cookies, userId } = await signIn(app);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Final Intake receipt load" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const created = await request(app.getHttpServer())
      .post(`/inventory/loads/${loadId}/intake`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(201);
    const batchId = created.body.batch.id as string;
    const fileId = randomUUID();
    const candidateId = randomUUID();
    await db.execute(
      sql`insert into file_attachment (id, load_id, purpose, storage_key, original_filename, declared_media_type, detected_media_type, declared_byte_count, byte_count, sha256, uploader_user_id, state) values (${fileId}, ${loadId}, 'intake_evidence', ${`receipt/${fileId}.jpg`}, 'receipt.jpg', 'image/jpeg', 'image/jpeg', 3, 3, ${"a".repeat(64)}, ${userId}, 'ready')`,
    );
    await db.execute(
      sql`insert into inventory_intake_candidate (id, batch_id, state, machine_type, equipment_class, equipment_class_selected_by_user_id, equipment_class_selected_at, manufacturer, model, serial) values (${candidateId}, ${batchId}, 'confirmed', 'washer', 'washer', ${userId}, now(), 'Receipt Maker', 'R-1', 'RECEIPT-001')`,
    );
    await db.execute(
      sql`insert into inventory_intake_photo (id, batch_id, file_id, photo_order, disposition, candidate_id) values (${randomUUID()}, ${batchId}, ${fileId}, 0, 'assigned', ${candidateId})`,
    );
    expect(await loadReceipt(db, loadId)).toMatchObject({
      received_at: null,
      version: 1,
    });
    await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 2 })
      .expect(409);
    expect(await loadReceipt(db, loadId)).toMatchObject({
      received_at: null,
      version: 1,
    });
    expect(await loadReceiptMutations(db, loadId)).toEqual({
      audit_count: 0,
      outbox_count: 0,
    });
    const commitKey = randomUUID();
    await db.execute(
      sql.raw(`
      create function reject_load_receipt_outbox() returns trigger language plpgsql as $$
      begin
        if new.event_type = 'inventory.load.updated' then
          raise exception 'forced load receipt recorder failure';
        end if;
        return new;
      end
      $$
    `),
    );
    await db.execute(
      sql.raw(`
      create trigger reject_load_receipt_outbox
      before insert on platform_outbox_job
      for each row execute function reject_load_receipt_outbox()
    `),
    );
    await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", commitKey)
      .send({ expectedVersion: 1 })
      .expect(500);
    expect(await loadReceipt(db, loadId)).toMatchObject({
      received_at: null,
      version: 1,
    });
    expect(await loadReceiptMutations(db, loadId)).toEqual({
      audit_count: 0,
      outbox_count: 0,
    });
    const afterFailure = await db.execute(
      sql`select state from inventory_intake_batch where id = ${batchId}`,
    );
    expect(
      ("rows" in afterFailure ? afterFailure.rows : afterFailure)[0]?.state,
    ).toBe("open");
    const machinesAfterFailure = await db.execute(
      sql`select id from inventory_machine where source_load_id = ${loadId}`,
    );
    expect(
      "rows" in machinesAfterFailure
        ? machinesAfterFailure.rows
        : machinesAfterFailure,
    ).toHaveLength(0);
    await db.execute(
      sql.raw(`drop trigger reject_load_receipt_outbox on platform_outbox_job`),
    );
    await db.execute(sql.raw(`drop function reject_load_receipt_outbox()`));
    const committed = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", commitKey)
      .send({ expectedVersion: 1 })
      .expect(201);
    expect(committed.body.mappings).toHaveLength(1);
    const received = await loadReceipt(db, loadId);
    expect(received.received_at).not.toBeNull();
    expect(received.version).toBe(2);
    expect(await loadReceiptMutations(db, loadId)).toEqual({
      audit_count: 1,
      outbox_count: 1,
    });
    await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", commitKey)
      .send({ expectedVersion: 1 })
      .expect(201)
      .expect(({ body }) =>
        expect(body.mappings).toEqual(committed.body.mappings),
      );
    expect(await loadReceipt(db, loadId)).toEqual(received);
    expect(await loadReceiptMutations(db, loadId)).toEqual({
      audit_count: 1,
      outbox_count: 1,
    });
    await request(app.getHttpServer())
      .post(`/inventory/loads/${loadId}/intake`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe("load_received"));
    const loads = await request(app.getHttpServer())
      .get("/inventory/loads")
      .set("Cookie", cookies)
      .expect(200);
    expect(
      loads.body.loads.find((item: { id: string }) => item.id === loadId)
        .receivedAt,
    ).not.toBeNull();
  });

  it("receives a Load when a historical mapped batch finishes", async () => {
    const app = await createApplication();
    const { cookies } = await signIn(app);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Historical receipt load" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const created = await request(app.getHttpServer())
      .post(`/inventory/loads/${loadId}/intake`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(201);
    const batchId = created.body.batch.id as string;
    const machine = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ sourceLoadId: loadId, machineType: "washer" })
      .expect(201);
    const machineId = machine.body.machine.id as string;
    const candidateId = randomUUID();
    await db.execute(
      sql`insert into inventory_intake_candidate (id, batch_id, state, machine_type) values (${candidateId}, ${batchId}, 'committed', 'washer')`,
    );
    await db.execute(
      sql`insert into inventory_intake_machine_mapping (candidate_id, batch_id, machine_id) values (${candidateId}, ${batchId}, ${machineId})`,
    );
    expect(await loadReceipt(db, loadId)).toMatchObject({
      received_at: null,
      version: 1,
    });
    const finish = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 1, finishOnly: true })
      .expect(201);
    expect(finish.body.mappings).toEqual([{ candidateId, machineId }]);
    expect(await loadReceipt(db, loadId)).toMatchObject({ version: 2 });
    expect((await loadReceipt(db, loadId)).received_at).not.toBeNull();
    expect(await loadReceiptMutations(db, loadId)).toEqual({
      audit_count: 1,
      outbox_count: 1,
    });
  });

  it("does not create Inventory Machines when approval is incomplete", async () => {
    const app = await createApplication();
    const { cookies } = await signIn(app);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Incomplete Intake load" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const batch = await request(app.getHttpServer())
      .post(`/inventory/loads/${loadId}/intake`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/inventory/intake/${batch.body.batch.id}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 1 })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("candidate_not_confirmed"));

    const machineCount = await db.execute(
      sql.raw(
        "select count(*)::int as count from inventory_machine where source_load_id = '" +
          loadId +
          "'",
      ),
    );
    const machineRows = Array.isArray(machineCount)
      ? machineCount
      : ((machineCount as { rows?: unknown[] }).rows ?? []);
    expect((machineRows[0] as { count?: number } | undefined)?.count).toBe(0);
    expect(await loadReceipt(db, loadId)).toMatchObject({
      received_at: null,
      version: 1,
    });
  });

  it("does not create Machines or mappings when recapture is still required", async () => {
    const app = await createApplication();
    const { cookies, userId } = await signIn(app);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const loadId = randomUUID();
    const batchId = randomUUID();
    const fileId = randomUUID();
    const photoId = randomUUID();
    const candidateId = randomUUID();
    const runId = randomUUID();
    const recaptureId = randomUUID();
    await db.execute(
      sql`insert into inventory_load (id, display_name) values (${loadId}, 'Recapture Intake load')`,
    );
    await db.execute(
      sql`insert into inventory_intake_batch (id, load_id, created_by_user_id) values (${batchId}, ${loadId}, ${userId})`,
    );
    await db.execute(
      sql`insert into file_attachment (id, load_id, purpose, storage_key, original_filename, declared_media_type, detected_media_type, declared_byte_count, byte_count, sha256, uploader_user_id, state) values (${fileId}, ${loadId}, 'intake_evidence', ${`recapture/${fileId}.jpg`}, 'recapture.jpg', 'image/jpeg', 'image/jpeg', 3, 3, ${"c".repeat(64)}, ${userId}, 'ready')`,
    );
    await db.execute(
      sql`insert into inventory_intake_candidate (id, batch_id, state, machine_type, manufacturer, model, serial) values (${candidateId}, ${batchId}, 'draft', 'washer', 'Recapture Maker', 'Recapture Model', 'RECAPTURE-001')`,
    );
    await db.execute(
      sql`insert into inventory_intake_photo (id, batch_id, file_id, photo_order, disposition, candidate_id) values (${photoId}, ${batchId}, ${fileId}, 0, 'assigned', ${candidateId})`,
    );
    await db.execute(
      sql`insert into inventory_intake_recognition_run (id, batch_id, input_version, input_fingerprint, state, provider, model, verifier, verifier_model, schema_version, policy_version) values (${runId}, ${batchId}, 1, ${"d".repeat(64)}, 'needs_recapture', 'fake', 'fake-v1', 'fake', 'fake-v1', 'intake-v1', 'test-policy')`,
    );
    await db.execute(
      sql`insert into inventory_intake_recapture (id, run_id, batch_id, candidate_id, photo_ids, field, reason, instruction, state) values (${recaptureId}, ${runId}, ${batchId}, ${candidateId}, ${JSON.stringify([photoId])}::jsonb, 'model', 'small_text', 'Upload a clearer photo.', 'open')`,
    );

    await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 1 })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("candidate_not_confirmed"));

    const machines = await db.execute(
      sql`select id from inventory_machine where source_load_id = ${loadId}`,
    );
    const mappings = await db.execute(
      sql`select candidate_id from inventory_intake_machine_mapping where batch_id = ${batchId}`,
    );
    const machineRows = "rows" in machines ? machines.rows : machines;
    const mappingRows = "rows" in mappings ? mappings.rows : mappings;
    expect(machineRows).toHaveLength(0);
    expect(mappingRows).toHaveLength(0);
    expect(await loadReceipt(db, loadId)).toMatchObject({
      received_at: null,
      version: 1,
    });
  });

  it("removes open evidence and rejects committed child mutations", async () => {
    const app = await createApplication();
    const { cookies, userId } = await signIn(app);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const loadId = randomUUID();
    const batchId = randomUUID();
    const fileId = randomUUID();
    const candidateId = randomUUID();
    await db.execute(
      sql`insert into inventory_load (id, display_name) values (${loadId}, 'Trigger load')`,
    );
    await db.execute(
      sql`insert into inventory_intake_batch (id, load_id, created_by_user_id) values (${batchId}, ${loadId}, ${userId})`,
    );
    await db.execute(
      sql`insert into file_attachment (id, load_id, purpose, storage_key, original_filename, declared_media_type, detected_media_type, declared_byte_count, byte_count, sha256, uploader_user_id, state) values (${fileId}, ${loadId}, 'intake_evidence', 'trigger/photo.jpg', 'photo.jpg', 'image/jpeg', 'image/jpeg', 3, 3, ${"a".repeat(64)}, ${userId}, 'ready')`,
    );
    const linked = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/photos`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fileId, expectedVersion: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/photos/remove`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        photoId: linked.body.photos[0].id,
        expectedVersion: linked.body.batch.version,
      })
      .expect(201);
    await db.execute(
      sql`insert into inventory_intake_candidate (id, batch_id) values (${candidateId}, ${batchId})`,
    );
    await db.execute(
      sql`update inventory_intake_batch set state = 'committed', version = version + 1 where id = ${batchId}`,
    );
    await expect(
      db.execute(
        sql`insert into inventory_intake_candidate (id, batch_id) values (${randomUUID()}, ${batchId})`,
      ),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`update inventory_intake_candidate set model = 'blocked' where id = ${candidateId}`,
      ),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`delete from inventory_intake_candidate where id = ${candidateId}`,
      ),
    ).rejects.toThrow();
  });

  it("completes Files upload, review, location-free atomic commit, and provenance", async () => {
    const app = await createApplication();
    const { cookies } = await signIn(app);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Complete Intake load" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const grant = await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", cookies)
      .send({
        target: { type: "load", id: loadId },
        purpose: "intake_evidence",
        originalFilename: "intake.png",
        declaredMediaType: "image/png",
        declaredByteCount: png.length,
      })
      .expect(201);
    const fileId = grant.body.file.id as string;
    await request(app.getHttpServer())
      .post("/files/" + fileId + "/upload-content")
      .set("Cookie", cookies)
      .set("x-file-grant", grant.body.grant.token)
      .attach("file", png, { filename: "intake.png", contentType: "image/png" })
      .expect(201);
    const deniedPreview = await request(app.getHttpServer())
      .post("/files/" + fileId + "/preview-grants")
      .set("Cookie", cookies)
      .expect(201);
    await request(app.getHttpServer())
      .get("/files/" + fileId + "/download-content")
      .set("Cookie", cookies)
      .query({ grant: deniedPreview.body.grant.token })
      .expect(403);
    const preview = await request(app.getHttpServer())
      .post("/files/" + fileId + "/preview-grants")
      .set("Cookie", cookies)
      .expect(201);
    await request(app.getHttpServer())
      .get("/files/" + fileId + "/preview-content")
      .set("Cookie", cookies)
      .query({ grant: preview.body.grant.token })
      .expect(200)
      .expect("Content-Type", /image\/jpeg/);
    await request(app.getHttpServer())
      .get("/files/" + fileId + "/preview-content")
      .set("Cookie", cookies)
      .query({ grant: preview.body.grant.token })
      .expect(403);
    const originalGrant = await request(app.getHttpServer())
      .post("/files/" + fileId + "/download-grants")
      .set("Cookie", cookies)
      .expect(201);
    await request(app.getHttpServer())
      .get("/files/" + fileId + "/preview-content")
      .set("Cookie", cookies)
      .query({ grant: originalGrant.body.grant.token })
      .expect(403);
    const batchKey = randomUUID();
    const batch = await request(app.getHttpServer())
      .post("/inventory/loads/" + loadId + "/intake")
      .set("Cookie", cookies)
      .set("Idempotency-Key", batchKey)
      .send({ loadId })
      .expect(201);
    const batchId = batch.body.batch.id as string;
    await request(app.getHttpServer())
      .post("/inventory/loads/" + loadId + "/intake")
      .set("Cookie", cookies)
      .set("Idempotency-Key", batchKey)
      .send({ loadId })
      .expect(201)
      .expect(({ body }) => expect(body.batch.id).toBe(batchId));
    const technician = await app.get(IdentityService).provisionUser(
      {
        name: "intake-technician",
        email: "intake-technician@example.test",
        password: "intake-technician-password",
        role: "technician_cleaner",
      },
      { requestId: randomUUID() },
    );
    const technicianSignIn = await request(app.getHttpServer())
      .post("/auth/sign-in/email")
      .set("origin", "http://localhost:3000")
      .send({
        email: "intake-technician@example.test",
        password: "intake-technician-password",
      })
      .expect(200);
    await request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/candidates")
      .set(
        "Cookie",
        technicianSignIn.headers["set-cookie"] as unknown as string[],
      )
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 1 })
      .expect(403);
    expect(technician.id).toBeTruthy();
    const linked = await request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/photos")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fileId, expectedVersion: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/candidates")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: linked.body.batch.version - 1 })
      .expect(409);
    const candidate = await request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/candidates")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: linked.body.batch.version })
      .expect(201);
    const candidateId = candidate.body.candidates[0].id as string;
    const initialFacts = await request(app.getHttpServer())
      .patch("/inventory/intake/" + batchId + "/candidates/" + candidateId)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "washer",
        manufacturer: "Initial Integration Maker",
        model: "Initial Integration Model",
        serial: "INITIAL-INTAKE-001",
        expectedVersion: candidate.body.batch.version,
      })
      .expect(200);
    const facts = await request(app.getHttpServer())
      .patch("/inventory/intake/" + batchId + "/candidates/" + candidateId)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "washer",
        manufacturer: "Integration Maker",
        model: "Integration Model",
        serial: "INTEGRATION-INTAKE-001",
        expectedVersion: initialFacts.body.batch.version,
      })
      .expect(200);
    const assigned = await request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/photos/assign")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        photoId: facts.body.photos[0].id,
        candidateId,
        expectedVersion: facts.body.batch.version,
      })
      .expect(201);
    const confirmed = await request(app.getHttpServer())
      .post(
        "/inventory/intake/" +
          batchId +
          "/candidates/" +
          candidateId +
          "/confirm",
      )
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: assigned.body.batch.version })
      .expect(201);
    await request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/destination")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        locationId: randomUUID(),
        expectedVersion: confirmed.body.batch.version,
      })
      .expect(404);
    const commitKey = randomUUID();
    const concurrentCommit = request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/commit")
      .set("Cookie", cookies)
      .set("Idempotency-Key", commitKey)
      .send({ expectedVersion: confirmed.body.batch.version });
    const secondConcurrentCommit = request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/commit")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: confirmed.body.batch.version });
    const concurrentResponses = await Promise.all([
      concurrentCommit,
      secondConcurrentCommit,
    ]);
    expect(concurrentResponses.map(({ status }) => status).sort()).toEqual([
      201, 409,
    ]);
    const committed = concurrentResponses.find(({ status }) => status === 201)!;
    const replayed = await request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/commit")
      .set("Cookie", cookies)
      .set("Idempotency-Key", commitKey)
      .send({ expectedVersion: confirmed.body.batch.version })
      .expect(201);
    expect(committed.body.mappings).toHaveLength(1);
    expect(committed.body.machines).toHaveLength(1);
    expect(replayed.body.mappings).toEqual(committed.body.mappings);
    expect(await loadReceipt(db, loadId)).toMatchObject({ version: 2 });
    expect((await loadReceipt(db, loadId)).received_at).not.toBeNull();
    const machineCount = await db.execute(
      sql.raw(
        "select count(*)::int as count from inventory_machine where source_load_id = '" +
          loadId +
          "'",
      ),
    );
    const machineRows = Array.isArray(machineCount)
      ? machineCount
      : ((machineCount as { rows?: unknown[] }).rows ?? []);
    expect((machineRows[0] as { count?: number } | undefined)?.count).toBe(1);
    await request(app.getHttpServer())
      .get("/inventory/machines/" + committed.body.machines[0])
      .set("Cookie", cookies)
      .expect(200)
      .expect(({ body }) => {
        expect(body.machine.sourceLoadId).toBe(loadId);
        expect(body.machine).not.toHaveProperty("currentLocationId");
        expect(body.machine.productionState).toBe("not_assessed");
        expect(body.machine.inventoryState).toBe("on_hand");
        expect(body.machine.identityVerificationState).toBe("provisional");
        expect(body.machine.manufacturer).toBe("Integration Maker");
        expect(body.machine.model).toBe("Integration Model");
        expect(body.machine.serial).toBe("INTEGRATION-INTAKE-001");
        expect(body.identityEvidence).toHaveLength(1);
        expect(body.identityEvidence[0]).toMatchObject({
          sourceKind: "photo_intake",
          machineId: committed.body.machines[0],
        });
        expect(body).not.toHaveProperty("locationHistory");
      });
    const evidence = await db.execute(
      sql.raw(
        "select count(*)::int as count from machine_identity_evidence where machine_id = '" +
          committed.body.machines[0] +
          "' and source_kind = 'photo_intake'",
      ),
    );
    const history = await db.execute(
      sql.raw(
        "select count(*)::int as count from machine_location_history where machine_id = '" +
          committed.body.machines[0] +
          "'",
      ),
    );
    const evidenceRows = Array.isArray(evidence)
      ? evidence
      : ((evidence as { rows?: unknown[] }).rows ?? []);
    const historyRows = Array.isArray(history)
      ? history
      : ((history as { rows?: unknown[] }).rows ?? []);
    expect((evidenceRows[0] as { count?: number } | undefined)?.count).toBe(1);
    expect((historyRows[0] as { count?: number } | undefined)?.count).toBe(0);
    expect(committed.body.batch.state).toBe("committed");
  });

  it("stores same-batch duplicate identities as separate provisional Machines", async () => {
    const app = await createApplication();
    const { cookies, userId } = await signIn(app);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Duplicate Intake load" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const file = async (name: string) => {
      const fileId = randomUUID();
      await db.execute(
        sql.raw(
          "insert into file_attachment (id, load_id, purpose, storage_key, original_filename, declared_media_type, detected_media_type, declared_byte_count, byte_count, sha256, uploader_user_id, state) values ('" +
            fileId +
            "', '" +
            loadId +
            "', 'intake_evidence', 'evidence/" +
            name +
            "', '" +
            name +
            "', 'image/jpeg', 'image/jpeg', 3, 3, '" +
            "b".repeat(64) +
            "', '" +
            userId +
            "', 'ready')",
        ),
      );
      return fileId;
    };
    const batch = await request(app.getHttpServer())
      .post("/inventory/loads/" + loadId + "/intake")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(201);
    const batchId = batch.body.batch.id as string;
    let version = batch.body.batch.version as number;
    const photoIds: string[] = [];
    for (const name of [
      "exact-a.jpg",
      "exact-b.jpg",
      "warn-a.jpg",
      "warn-b.jpg",
    ]) {
      const linked = await request(app.getHttpServer())
        .post("/inventory/intake/" + batchId + "/photos")
        .set("Cookie", cookies)
        .set("Idempotency-Key", randomUUID())
        .send({ fileId: await file(name), expectedVersion: version })
        .expect(201);
      photoIds.push(
        linked.body.photos[linked.body.photos.length - 1].id as string,
      );
      version = linked.body.batch.version;
    }
    const candidate = async (
      photoId: string,
      facts: Record<string, string>,
    ) => {
      const created = await request(app.getHttpServer())
        .post("/inventory/intake/" + batchId + "/candidates")
        .set("Cookie", cookies)
        .set("Idempotency-Key", randomUUID())
        .send({ expectedVersion: version })
        .expect(201);
      const candidates = created.body.candidates as { id: string }[];
      const candidateId = candidates[candidates.length - 1]!.id;
      version = created.body.batch.version;
      const updated = await request(app.getHttpServer())
        .patch("/inventory/intake/" + batchId + "/candidates/" + candidateId)
        .set("Cookie", cookies)
        .set("Idempotency-Key", randomUUID())
        .send({ ...facts, expectedVersion: version })
        .expect(200);
      version = updated.body.batch.version;
      const assigned = await request(app.getHttpServer())
        .post("/inventory/intake/" + batchId + "/photos/assign")
        .set("Cookie", cookies)
        .set("Idempotency-Key", randomUUID())
        .send({ photoId, candidateId, expectedVersion: version })
        .expect(201);
      version = assigned.body.batch.version;
      return candidateId;
    };
    const exactFacts = {
      machineType: "washer",
      manufacturer: "Same Maker",
      model: "Same Model",
      serial: "SAME-BATCH-001",
    };
    const exactOne = await candidate(photoIds[0]!, exactFacts);
    const firstConfirmed = await request(app.getHttpServer())
      .post(
        "/inventory/intake/" + batchId + "/candidates/" + exactOne + "/confirm",
      )
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: version })
      .expect(201);
    version = firstConfirmed.body.batch.version;
    const exactTwo = await candidate(photoIds[1]!, exactFacts);
    const secondConfirmed = await request(app.getHttpServer())
      .post(
        "/inventory/intake/" + batchId + "/candidates/" + exactTwo + "/confirm",
      )
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: version })
      .expect(201);
    version = secondConfirmed.body.batch.version;
    const warningFacts = {
      machineType: "washer",
      manufacturer: "Warning Maker",
      model: "Warning Model",
      serial: "WARNING-SERIAL-001",
    };
    const warningOne = await candidate(photoIds[2]!, warningFacts);
    const warningOneConfirmed = await request(app.getHttpServer())
      .post(
        "/inventory/intake/" +
          batchId +
          "/candidates/" +
          warningOne +
          "/confirm",
      )
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: version })
      .expect(201);
    version = warningOneConfirmed.body.batch.version;
    const warningCandidate = await candidate(photoIds[3]!, {
      ...warningFacts,
      manufacturer: "Different Maker",
      model: "Different Model",
    });
    const warningConfirmed = await request(app.getHttpServer())
      .post(
        "/inventory/intake/" +
          batchId +
          "/candidates/" +
          warningCandidate +
          "/confirm",
      )
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: version })
      .expect(201);
    version = warningConfirmed.body.batch.version;
    const committed = await request(app.getHttpServer())
      .post("/inventory/intake/" + batchId + "/commit")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: version })
      .expect(201);
    expect(committed.body.mappings).toHaveLength(4);
    const committedMachineIds = committed.body.mappings.map(
      (mapping: { machineId: string }) => mapping.machineId,
    );
    expect(new Set(committedMachineIds).size).toBe(4);
    const committedMachines = await db.execute(
      sql`select id, identity_verification_state from inventory_machine where id in (${sql.join(
        committedMachineIds.map((machineId: string) => sql`${machineId}`),
        sql`, `,
      )})`,
    );
    const machineRows =
      "rows" in committedMachines ? committedMachines.rows : committedMachines;
    expect(machineRows).toHaveLength(4);
    expect(
      machineRows.every(
        (row) => row.identity_verification_state === "provisional",
      ),
    ).toBe(true);
  });

  it("stores exact identity commits across different Intake batches", async () => {
    const app = await createApplication();
    const { cookies, userId } = await signIn(app);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const loadId = randomUUID();
    await db.execute(
      sql`insert into inventory_load (id, display_name) values (${loadId}, 'Concurrent Intake load')`,
    );

    const batchIds = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, batchId] of batchIds.entries()) {
      const candidateId = randomUUID();
      const fileId = randomUUID();
      const photoId = randomUUID();
      const manufacturer = index === 0 ? "SpeedQueen" : " Speed Queen ";
      await db.execute(
        sql`insert into inventory_intake_batch (id, load_id, created_by_user_id) values (${batchId}, ${loadId}, ${userId})`,
      );
      await db.execute(
        sql`insert into file_attachment (id, load_id, purpose, storage_key, original_filename, declared_media_type, detected_media_type, declared_byte_count, byte_count, sha256, uploader_user_id, state) values (${fileId}, ${loadId}, 'intake_evidence', ${`race/${fileId}.jpg`}, ${`race-${index}.jpg`}, 'image/jpeg', 'image/jpeg', 3, 3, ${String(index + 1).repeat(64)}, ${userId}, 'ready')`,
      );
      await db.execute(
        sql`insert into inventory_intake_candidate (id, batch_id, state, machine_type, equipment_class, equipment_class_selected_by_user_id, equipment_class_selected_at, manufacturer, model, serial) values (${candidateId}, ${batchId}, 'confirmed', 'washer', 'washer', ${userId}, now(), ${manufacturer}, 'SC30', 'RACE-SERIAL-001')`,
      );
      await db.execute(
        sql`insert into inventory_intake_photo (id, batch_id, file_id, photo_order, disposition, candidate_id) values (${photoId}, ${batchId}, ${fileId}, 0, 'assigned', ${candidateId})`,
      );
    }

    await request(app.getHttpServer())
      .post(`/inventory/intake/${batchIds[0]}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 1 })
      .expect(201);
    expect(await loadReceipt(db, loadId)).toMatchObject({
      received_at: null,
      version: 1,
    });
    const responses = await Promise.all(
      batchIds
        .slice(1)
        .map((batchId) =>
          request(app.getHttpServer())
            .post(`/inventory/intake/${batchId}/commit`)
            .set("Cookie", cookies)
            .set("Idempotency-Key", randomUUID())
            .send({ expectedVersion: 1 }),
        ),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 201]);
    const machines = await db.execute(
      sql`select id from inventory_machine where normalized_manufacturer = 'speed queen' and normalized_serial = 'race-serial-001'`,
    );
    const machineRows = "rows" in machines ? machines.rows : machines;
    expect(machineRows).toHaveLength(3);
    expect(await loadReceipt(db, loadId)).toMatchObject({ version: 2 });
    expect((await loadReceipt(db, loadId)).received_at).not.toBeNull();
    const batches = await db.execute(
      sql`select state from inventory_intake_batch where id in (${sql.join(
        batchIds.map((batchId) => sql`${batchId}`),
        sql`, `,
      )}) order by state`,
    );
    const batchRows = "rows" in batches ? batches.rows : batches;
    expect(batchRows.map((row) => row.state)).toEqual([
      "committed",
      "committed",
      "committed",
    ]);
  });

  it("rejects atomic commit when an unmapped confirmed Candidate has no human-selected type", async () => {
    const app = await createApplication();
    const { cookies, userId } = await signIn(app);
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Untyped candidate load" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const created = await request(app.getHttpServer())
      .post(`/inventory/loads/${loadId}/intake`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(201);
    const batchId = created.body.batch.id as string;
    const fileId = randomUUID();
    const candidateId = randomUUID();
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    await db.execute(sql`
      insert into file_attachment (
        id, load_id, purpose, storage_key, original_filename,
        declared_media_type, detected_media_type, declared_byte_count,
        byte_count, sha256, uploader_user_id, state
      ) values (
        ${fileId}, ${loadId}, 'intake_evidence', ${`untyped/${fileId}.jpg`},
        'untyped.jpg', 'image/jpeg', 'image/jpeg', 3, 3,
        ${"f".repeat(64)}, ${userId}, 'ready'
      )
    `);
    await db.execute(sql`
      insert into inventory_intake_candidate (
        id, batch_id, state, manufacturer, model, serial,
        confirmation_source, version
      ) values (
        ${candidateId}, ${batchId}, 'confirmed', 'Dexter', 'T-400',
        'UNTYPED-1', 'recognition', 1
      )
    `);
    await db.execute(sql`
      insert into inventory_intake_photo (
        id, batch_id, file_id, photo_order, disposition, candidate_id
      ) values (
        ${randomUUID()}, ${batchId}, ${fileId}, 0, 'assigned', ${candidateId}
      )
    `);

    await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: created.body.batch.version, finishOnly: false })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("equipment_class_required"));

    const machines = await db.execute(
      sql`select id from inventory_machine where source_load_id = ${loadId}`,
    );
    const mappings = await db.execute(
      sql`select machine_id from inventory_intake_machine_mapping where batch_id = ${batchId}`,
    );
    const batchState = await db.execute(
      sql`select state from inventory_intake_batch where id = ${batchId}`,
    );
    expect("rows" in machines ? machines.rows : machines).toHaveLength(0);
    expect("rows" in mappings ? mappings.rows : mappings).toHaveLength(0);
    expect(
      ("rows" in batchState ? batchState.rows : batchState)[0]?.state,
    ).toBe("open");
  });

  it("retains excluded failed evidence while omitting its Candidate from active items and commit", async () => {
    const app = await createApplication();
    const { cookies, userId } = await signIn(app);
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const loadId = randomUUID();
    const batchId = randomUUID();
    const failedCandidateId = randomUUID();
    const readyCandidateId = randomUUID();
    const failedFileId = randomUUID();
    const readyFileId = randomUUID();
    const failedPhotoId = randomUUID();
    const readyPhotoId = randomUUID();
    const failedRunId = randomUUID();
    const readyRunId = randomUUID();
    await db.execute(
      sql`insert into inventory_load (id, display_name) values (${loadId}, 'Failed evidence exclusion load')`,
    );
    await db.execute(
      sql`insert into inventory_intake_batch (id, load_id, created_by_user_id) values (${batchId}, ${loadId}, ${userId})`,
    );
    for (const [fileId, filename, checksum] of [
      [failedFileId, "failed.jpg", "1".repeat(64)],
      [readyFileId, "ready.jpg", "2".repeat(64)],
    ]) {
      await db.execute(sql`
        insert into file_attachment (
          id, load_id, purpose, storage_key, original_filename,
          declared_media_type, detected_media_type, declared_byte_count,
          byte_count, sha256, uploader_user_id, state
        ) values (
          ${fileId}, ${loadId}, 'intake_evidence', ${`exclude/${fileId}.jpg`},
          ${filename}, 'image/jpeg', 'image/jpeg', 3, 3,
          ${checksum}, ${userId}, 'ready'
        )
      `);
    }
    await db.execute(sql`
      insert into inventory_intake_candidate (
        id, batch_id, state, manufacturer, model, serial,
        confirmation_source, version
      ) values (
        ${failedCandidateId}, ${batchId}, 'draft', 'Failed Maker', 'F-1',
        'FAILED-1', 'recognition', 1
      ), (
        ${readyCandidateId}, ${batchId}, 'confirmed', 'Ready Maker', 'R-1',
        'READY-1', 'recognition', 1
      )
    `);
    await db.execute(sql`
      update inventory_intake_candidate
      set machine_type = 'washer', machine_type_selected_by_user_id = ${userId},
          machine_type_selected_at = now(), equipment_class = 'washer',
          equipment_class_selected_by_user_id = ${userId}, equipment_class_selected_at = now()
      where id = ${readyCandidateId}
    `);
    await db.execute(sql`
      insert into inventory_intake_photo (
        id, batch_id, file_id, photo_order, disposition, candidate_id
      ) values
        (${failedPhotoId}, ${batchId}, ${failedFileId}, 0, 'assigned', ${failedCandidateId}),
        (${readyPhotoId}, ${batchId}, ${readyFileId}, 1, 'assigned', ${readyCandidateId})
    `);
    await db.execute(sql`
      insert into inventory_intake_recognition_run (
        id, batch_id, photo_id, candidate_id, candidate_revision,
        input_version, input_fingerprint, state, provider, model,
        verifier, verifier_model, schema_version, policy_version
      ) values
        (${failedRunId}, ${batchId}, ${failedPhotoId}, ${failedCandidateId}, 1,
         1, ${"3".repeat(64)}, 'failed', 'fake', 'fake-v1', 'fake', 'fake-v1', 'intake-v1', 'test-policy'),
        (${readyRunId}, ${batchId}, ${readyPhotoId}, ${readyCandidateId}, 1,
         1, ${"4".repeat(64)}, 'ready', 'fake', 'fake-v1', 'fake', 'fake-v1', 'intake-v1', 'test-policy')
    `);

    const excluded = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/photos/exclude`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ photoId: failedPhotoId, excluded: true, expectedVersion: 1 })
      .expect(201);
    expect(excluded.body.items).toHaveLength(1);
    expect(excluded.body.items[0].candidateId).toBe(readyCandidateId);
    expect(excluded.body.candidates).toHaveLength(2);

    const retained = await db.execute(sql`
      select p.disposition, p.candidate_id, r.id as run_id
      from inventory_intake_photo p
      inner join inventory_intake_recognition_run r on r.photo_id = p.id
      where p.id = ${failedPhotoId}
    `);
    const retainedRows = "rows" in retained ? retained.rows : retained;
    expect(retainedRows).toHaveLength(1);
    expect(retainedRows[0]).toMatchObject({
      disposition: "excluded",
      candidate_id: null,
      run_id: failedRunId,
    });

    const committed = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: excluded.body.batch.version, finishOnly: false })
      .expect(201);
    expect(committed.body.mappings).toHaveLength(1);
    expect(committed.body.mappings[0].candidateId).toBe(readyCandidateId);
    const failedMapping = await db.execute(sql`
      select machine_id from inventory_intake_machine_mapping
      where candidate_id = ${failedCandidateId}
    `);
    expect(
      "rows" in failedMapping ? failedMapping.rows : failedMapping,
    ).toHaveLength(0);
  });

  it("commits one candidate, then finish-only closes without creating another Machine", async () => {
    const app = await createApplication();
    const { cookies, userId } = await signIn(app);
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Pipelined commit load" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const batch = await request(app.getHttpServer())
      .post(`/inventory/loads/${loadId}/intake`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(201);
    const batchId = batch.body.batch.id as string;
    const fileId = randomUUID();
    const db = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    await db.execute(
      sql`insert into file_attachment (id, load_id, purpose, storage_key, original_filename, declared_media_type, detected_media_type, declared_byte_count, byte_count, sha256, uploader_user_id, state) values (${fileId}, ${loadId}, 'intake_evidence', ${`pipeline/${fileId}.jpg`}, 'pipeline.jpg', 'image/jpeg', 'image/jpeg', 3, 3, ${"e".repeat(64)}, ${userId}, 'ready')`,
    );
    const linked = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/photos`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fileId, expectedVersion: 1 })
      .expect(201);
    const photoId = linked.body.photos[0].id as string;
    const created = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/candidates`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: linked.body.batch.version })
      .expect(201);
    const candidateId = created.body.candidates.at(-1).id as string;
    const updated = await request(app.getHttpServer())
      .patch(`/inventory/intake/${batchId}/candidates/${candidateId}`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "washer",
        manufacturer: "Pipeline Maker",
        model: "P-1",
        serial: `PIPE-${randomUUID()}`,
        expectedVersion: created.body.batch.version,
      })
      .expect(200);
    const assigned = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/photos/assign`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        photoId,
        candidateId,
        expectedVersion: updated.body.batch.version,
      })
      .expect(201);
    const confirmed = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/candidates/${candidateId}/confirm`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: assigned.body.batch.version })
      .expect(201);
    const individual = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/candidates/${candidateId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: confirmed.body.batch.version })
      .expect(201);
    expect(individual.body.machineId).toBeTruthy();
    expect(await loadReceipt(db, loadId)).toMatchObject({
      received_at: null,
      version: 1,
    });
    const committedMachine = await request(app.getHttpServer())
      .get(`/inventory/machines/${individual.body.machineId}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(committedMachine.body.machine).not.toHaveProperty(
      "currentLocationId",
    );
    expect(committedMachine.body.machine.inventoryState).toBe("on_hand");
    const finish = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        expectedVersion: individual.body.batch.version,
        finishOnly: true,
      })
      .expect(201);
    expect(finish.body.batch.state).toBe("committed");
    expect(finish.body.mappings).toEqual([
      { candidateId, machineId: individual.body.machineId },
    ]);
    expect(await loadReceipt(db, loadId)).toMatchObject({ version: 2 });
    expect((await loadReceipt(db, loadId)).received_at).not.toBeNull();
  });
});
