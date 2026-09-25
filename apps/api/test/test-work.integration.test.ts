import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@laundrorama/config";
import { createTestEnvironment } from "@laundrorama/test-support";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { IdentityService } from "../src/modules/identity/identity.service.js";
import { DATABASE_CONNECTION } from "../src/platform/database.module.js";
import type { DatabaseConnection } from "@laundrorama/database";

const apps: INestApplication[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((application) => application.close()));
});
async function app() {
  const module = await Test.createTestingModule({
    imports: [
      AppModule.register(parseServerEnvironment(createTestEnvironment())),
    ],
  }).compile();
  await module.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();
  const application = module.createNestApplication({ bodyParser: false });
  await application.init();
  apps.push(application);
  return application;
}
async function user(
  application: INestApplication,
  name: string,
  role: "owner_admin" | "technician_cleaner" | "warehouse",
) {
  const email = `${name}@work.test`;
  const password = `${name}-secure-password`;
  const identity = await application
    .get(IdentityService)
    .provisionUser(
      { name, email, password, role },
      { requestId: `provision-${name}` },
    );
  const signed = await request(application.getHttpServer())
    .post("/auth/sign-in/email")
    .set("origin", "http://localhost:3000")
    .send({ email, password })
    .expect(200);
  return {
    identity,
    cookies: signed.headers["set-cookie"] as unknown as string[],
  };
}
async function machine(
  application: INestApplication,
  cookies: string[],
  machineType: "washer" | "dryer" | "other",
  inspect = true,
) {
  const load = await request(application.getHttpServer())
    .post("/inventory/loads")
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({ displayName: `Test Load ${randomUUID()}` })
    .expect(201);
  const created = await request(application.getHttpServer())
    .post("/inventory/machines")
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({
      sourceLoadId: load.body.load.id,
      machineType,
      inventoryState: "on_hand",
    })
    .expect(201);
  const id = created.body.machine.id as string;
  if (!inspect) return { id, detail: created.body };
  const inspected = await request(application.getHttpServer())
    .post(`/inventory/machines/${id}/production/inspections`)
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({
      expectedMachineVersion: 1,
      condition: "Reviewed",
      bearingAssessment: "no_concern_observed",
      bearingNotes: "",
      missingParts: "",
      damage: "",
      recommendation: "repairable",
      reason: "Ready to test",
      evidenceFileIds: [],
    })
    .expect(201);
  return { id, detail: inspected.body };
}
function get(application: INestApplication, path: string, cookies: string[]) {
  return request(application.getHttpServer()).get(path).set("Cookie", cookies);
}
function post(
  application: INestApplication,
  path: string,
  cookies: string[],
  body: object,
  key = randomUUID(),
) {
  return request(application.getHttpServer())
    .post(path)
    .set("Cookie", cookies)
    .set("Idempotency-Key", key)
    .send(body);
}
async function activeSessionVersion(
  application: INestApplication,
  cookies: string[],
  detail: { order: { activeSessionId?: string | null } },
): Promise<number> {
  const sessionId = detail.order.activeSessionId;
  if (!sessionId) throw new Error("Expected an active timed session");
  return (
    await get(
      application,
      `/production/work/sessions/${sessionId}`,
      cookies,
    ).expect(200)
  ).body.version as number;
}
async function video(
  application: INestApplication,
  cookies: string[],
  machineId: string,
): Promise<string> {
  const bytes = Buffer.from([
    0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
  ]);
  const granted = await request(application.getHttpServer())
    .post("/files/upload-grants")
    .set("Cookie", cookies)
    .send({
      target: { type: "machine", id: machineId },
      purpose: "production_test_video",
      originalFilename: "operation.mp4",
      declaredMediaType: "video/mp4",
      declaredByteCount: bytes.length,
    })
    .expect(201);
  await request(application.getHttpServer())
    .post(`/files/${granted.body.file.id}/upload-content`)
    .set("Cookie", cookies)
    .set("x-file-grant", granted.body.grant.token)
    .attach("file", bytes, {
      filename: "operation.mp4",
      contentType: "video/mp4",
    })
    .expect(201);
  return granted.body.file.id as string;
}
function reinspect(
  application: INestApplication,
  machineId: string,
  version: number,
  cookies: string[],
) {
  return post(
    application,
    `/inventory/machines/${machineId}/production/inspections`,
    cookies,
    {
      expectedMachineVersion: version,
      condition: "Revisited",
      bearingAssessment: "no_concern_observed",
      bearingNotes: "",
      missingParts: "",
      damage: "",
      recommendation: "repairable",
      reason: "Attempted reinspection",
      evidenceFileIds: [],
    },
  );
}

describe("Production Test Work Orders", () => {
  it("atomically claims a group, resumes by QR, times item states, and detaches unfinished work", async () => {
    const application = await app();
    const owner = await user(application, "owner", "owner_admin");
    const technician = await user(application, "washer", "technician_cleaner");
    const other = await user(application, "other-worker", "technician_cleaner");
    const first = await machine(application, owner.cookies, "washer");
    const second = await machine(application, owner.cookies, "washer");
    const third = await machine(application, owner.cookies, "washer");
    for (const worker of [technician, other])
      await request(application.getHttpServer())
        .put(`/production/specialties/${worker.identity.id}`)
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", randomUUID())
        .send({ specialties: ["washer"] })
        .expect(200);
    const queue = (
      await get(application, "/production/work", technician.cookies).expect(200)
    ).body;
    const byMachine = new Map<
      string,
      { order: { id: string; version: number } }
    >(
      queue.orders.map(
        (item: {
          machine: { id: string };
          order: { id: string; version: number };
        }) => [item.machine.id, item],
      ),
    );
    const selection = [first.id, second.id].map((id) => ({
      orderId: byMachine.get(id)!.order.id,
      expectedVersion: 1,
    }));
    const conflict = [
      selection[0]!,
      { orderId: byMachine.get(third.id)!.order.id, expectedVersion: 2 },
    ];
    await post(application, "/production/work/sessions", technician.cookies, {
      orders: conflict,
    }).expect(409);
    expect(
      (
        await get(
          application,
          `/production/work/${selection[0]!.orderId}`,
          technician.cookies,
        ).expect(200)
      ).body.order.state,
    ).toBe("queued");
    const key = randomUUID();
    let session = (
      await post(
        application,
        "/production/work/sessions",
        technician.cookies,
        { orders: selection },
        key,
      ).expect(201)
    ).body;
    expect(session.items).toHaveLength(2);
    expect(session.state).toBe("active");
    expect(
      (
        await post(
          application,
          "/production/work/sessions",
          technician.cookies,
          { orders: selection },
          key,
        ).expect(201)
      ).body.id,
    ).toBe(session.id);
    expect(
      (
        await get(
          application,
          `/inventory/machines/${first.id}/production/work-destination`,
          technician.cookies,
        ).expect(200)
      ).body,
    ).toEqual({
      kind: "session",
      sessionId: session.id,
      orderId: selection[0]!.orderId,
    });
    expect(
      (
        await get(
          application,
          `/inventory/machines/${first.id}/production/work-destination`,
          other.cookies,
        ).expect(200)
      ).body.kind,
    ).toBe("none");
    session = (
      await post(
        application,
        `/production/work/sessions/${session.id}/items/${selection[1]!.orderId}/state`,
        technician.cookies,
        { expectedVersion: session.version, state: "waiting" },
      ).expect(201)
    ).body;
    expect(
      session.items.find(
        (item: { order: { order: { id: string } } }) =>
          item.order.order.id === selection[1]!.orderId,
      ).state,
    ).toBe("waiting");
    session = (
      await post(
        application,
        `/production/work/sessions/${session.id}/pause`,
        technician.cookies,
        { expectedVersion: session.version },
      ).expect(201)
    ).body;
    expect(session.state).toBe("paused");
    await post(
      application,
      `/production/work/sessions/${session.id}/resume`,
      technician.cookies,
      { expectedVersion: session.version - 1 },
    ).expect(409);
    session = (
      await post(
        application,
        `/production/work/sessions/${session.id}/resume`,
        technician.cookies,
        { expectedVersion: session.version },
      ).expect(201)
    ).body;
    session = (
      await post(
        application,
        `/production/work/sessions/${session.id}/finish`,
        technician.cookies,
        { expectedVersion: session.version },
      ).expect(201)
    ).body;
    expect(session.state).toBe("completed");
    expect(
      session.items.every(
        (item: { state: string }) => item.state === "removed",
      ),
    ).toBe(true);
    expect(session.elapsedSeconds).toBeGreaterThanOrEqual(0);
    const detached = (
      await get(
        application,
        `/production/work/${selection[0]!.orderId}`,
        technician.cookies,
      ).expect(200)
    ).body;
    expect(detached.claims).toHaveLength(1);
    await post(
      application,
      `/production/work/${selection[0]!.orderId}/steps`,
      technician.cookies,
      {
        expectedVersion: detached.order.version,
        stepKey: detached.run.template.steps[0].key,
        result: "pass",
      },
    ).expect(409);
    const resumed = (
      await post(application, "/production/work/sessions", technician.cookies, {
        orders: [
          {
            orderId: selection[0]!.orderId,
            expectedVersion: detached.order.version,
          },
        ],
      }).expect(201)
    ).body;
    expect(resumed.items[0].order.claims).toHaveLength(1);
    await post(
      application,
      `/production/work/sessions/${resumed.id}/finish`,
      technician.cookies,
      { expectedVersion: resumed.version },
    ).expect(201);
    expect(
      (
        await get(application, "/production/work", technician.cookies).expect(
          200,
        )
      ).body.myActiveMachines,
    ).toHaveLength(2);
    const next = (
      await post(application, "/production/work/sessions", technician.cookies, {
        orders: [
          { orderId: byMachine.get(third.id)!.order.id, expectedVersion: 1 },
        ],
      }).expect(201)
    ).body;
    await request(application.getHttpServer())
      .put(`/production/specialties/${technician.identity.id}`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ specialties: [] })
      .expect(200);
    await get(
      application,
      `/production/work/sessions/${next.id}`,
      technician.cookies,
    ).expect(404);
    expect(
      (
        await get(
          application,
          `/production/work/sessions/${next.id}`,
          owner.cookies,
        ).expect(200)
      ).body.state,
    ).toBe("completed");
  });

  it("denies Cleaner execution and records a bearing concern without rewriting the Initial Check", async () => {
    const application = await app();
    const owner = await user(application, "owner", "owner_admin");
    const technician = await user(
      application,
      "technician",
      "technician_cleaner",
    );
    const cleaner = await user(application, "cleaner", "technician_cleaner");
    const washer = await machine(application, owner.cookies, "washer");
    await request(application.getHttpServer())
      .put(`/production/specialties/${technician.identity.id}`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ specialties: ["washer"] })
      .expect(200);
    const orderId = (
      await get(application, "/production/work", technician.cookies).expect(200)
    ).body.orders[0].order.id as string;
    expect(
      (await get(application, "/production/work", cleaner.cookies).expect(200))
        .body.orders,
    ).toHaveLength(0);
    await post(application, "/production/work/sessions", cleaner.cookies, {
      orders: [{ orderId, expectedVersion: 1 }],
    }).expect(409);
    const session = (
      await post(application, "/production/work/sessions", technician.cookies, {
        orders: [{ orderId, expectedVersion: 1 }],
      }).expect(201)
    ).body;
    const before = (
      await get(
        application,
        `/production/work/${orderId}`,
        technician.cookies,
      ).expect(200)
    ).body;
    expect(before.initialBearingCheck).toMatchObject({
      assessment: "no_concern_observed",
      actorUserId: owner.identity.id,
    });
    await post(
      application,
      `/production/work/${orderId}/bearing-concern`,
      technician.cookies,
      { expectedVersion: before.order.version },
    ).expect(400);
    await post(
      application,
      `/production/work/${orderId}/bearing-concern`,
      technician.cookies,
      {
        expectedVersion: before.order.version,
        expectedSessionVersion: session.version + 1,
      },
    ).expect(409);
    const after = (
      await post(
        application,
        `/production/work/${orderId}/bearing-concern`,
        technician.cookies,
        {
          expectedVersion: before.order.version,
          expectedSessionVersion: session.version,
        },
      ).expect(201)
    ).body;
    expect(after.order.state).toBe("awaiting_repair");
    expect(after.machine.productionState).toBe("awaiting_repair");
    expect(after.initialBearingCheck).toEqual(before.initialBearingCheck);
    expect(
      (
        await get(
          application,
          `/production/work/sessions/${session.id}`,
          technician.cookies,
        ).expect(200)
      ).body.state,
    ).toBe("completed");
    expect(
      (
        await get(
          application,
          `/inventory/machines/${washer.id}/production`,
          owner.cookies,
        ).expect(200)
      ).body.inspections,
    ).toHaveLength(1);
  });
  it("shows specialty-matched initial checks and routes tap outcomes through immutable Preliminary history", async () => {
    const application = await app();
    const owner = await user(application, "owner", "owner_admin");
    const washerTech = await user(
      application,
      "washer-tech",
      "technician_cleaner",
    );
    const dryerTech = await user(
      application,
      "dryer-tech",
      "technician_cleaner",
    );
    const warehouse = await user(application, "warehouse", "warehouse");
    const washer = await machine(application, owner.cookies, "washer", false);
    const dryer = await machine(application, owner.cookies, "dryer", false);
    const other = await machine(application, owner.cookies, "other", false);
    for (const [worker, specialty] of [
      [washerTech, "washer"],
      [dryerTech, "dryer"],
    ] as const) {
      await request(application.getHttpServer())
        .put(`/production/specialties/${worker.identity.id}`)
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", randomUUID())
        .send({ specialties: [specialty] })
        .expect(200);
    }
    const washerQueue = (
      await get(application, "/production/work", washerTech.cookies).expect(200)
    ).body;
    expect(
      washerQueue.initialChecks.map((item: { id: string }) => item.id),
    ).toEqual([washer.id]);
    expect(washerQueue.orders).toHaveLength(0);
    expect(
      (
        await get(application, "/production/work", dryerTech.cookies).expect(
          200,
        )
      ).body.initialChecks.map((item: { id: string }) => item.id),
    ).toEqual([dryer.id]);
    expect(
      (await get(application, "/production/work", owner.cookies).expect(200))
        .body.initialChecks,
    ).toHaveLength(0);
    await get(
      application,
      `/production/initial-check/${washer.id}`,
      owner.cookies,
    ).expect(200);
    await get(application, "/production/work", warehouse.cookies).expect(403);
    expect(
      (
        await get(
          application,
          `/inventory/machines/${washer.id}/production/work-destination`,
          washerTech.cookies,
        ).expect(200)
      ).body,
    ).toEqual({ kind: "initial_check", machineId: washer.id });
    expect(
      (
        await get(
          application,
          `/inventory/machines/${dryer.id}/production/work-destination`,
          washerTech.cookies,
        ).expect(200)
      ).body,
    ).toEqual({ kind: "none" });
    await get(
      application,
      `/production/initial-check/${dryer.id}`,
      washerTech.cookies,
    ).expect(404);
    await post(
      application,
      `/inventory/machines/${dryer.id}/production/initial-check`,
      washerTech.cookies,
      { expectedMachineVersion: 1, choice: "smooth" },
    ).expect(404);
    await post(
      application,
      `/inventory/machines/${other.id}/production/initial-check`,
      owner.cookies,
      { expectedMachineVersion: 1, choice: "smooth" },
    ).expect(409);
    const key = randomUUID();
    const smooth = { expectedMachineVersion: 1, choice: "smooth" };
    const passed = (
      await post(
        application,
        `/inventory/machines/${washer.id}/production/initial-check`,
        washerTech.cookies,
        smooth,
        key,
      ).expect(201)
    ).body;
    expect(passed.machine.productionState).toBe("awaiting_test");
    expect(passed.inspections[0]).toMatchObject({
      bearingAssessment: "no_concern_observed",
      recommendation: "repairable",
    });
    expect(
      (
        await post(
          application,
          `/inventory/machines/${washer.id}/production/initial-check`,
          washerTech.cookies,
          smooth,
          key,
        ).expect(201)
      ).body.inspections,
    ).toHaveLength(1);
    await post(
      application,
      `/inventory/machines/${washer.id}/production/initial-check`,
      washerTech.cookies,
      { expectedMachineVersion: 1, choice: "bearing_concern" },
    ).expect(409);
    const work = (
      await get(application, "/production/work", washerTech.cookies).expect(200)
    ).body;
    expect(work.initialChecks).toHaveLength(0);
    expect(work.orders).toHaveLength(1);
    expect(
      (
        await get(
          application,
          `/inventory/machines/${washer.id}/production/work-destination`,
          washerTech.cookies,
        ).expect(200)
      ).body,
    ).toEqual({ kind: "test", orderId: work.orders[0].order.id });
    const concern = (
      await post(
        application,
        `/inventory/machines/${dryer.id}/production/initial-check`,
        dryerTech.cookies,
        { expectedMachineVersion: 1, choice: "bearing_concern" },
      ).expect(201)
    ).body;
    expect(concern.machine.productionState).toBe("blocked");
    expect(concern.currentDisposition.disposition).toBe("owner_review");
    expect(
      (
        await get(application, "/production/work", dryerTech.cookies).expect(
          200,
        )
      ).body,
    ).toMatchObject({ initialChecks: [], orders: [] });
    expect(
      (
        await get(
          application,
          `/inventory/machines/${dryer.id}/production/work-destination`,
          dryerTech.cookies,
        ).expect(200)
      ).body,
    ).toEqual({ kind: "none" });
    const unableMachine = await machine(
      application,
      owner.cookies,
      "dryer",
      false,
    );
    const unable = (
      await post(
        application,
        `/inventory/machines/${unableMachine.id}/production/initial-check`,
        dryerTech.cookies,
        { expectedMachineVersion: 1, choice: "unable_to_assess" },
      ).expect(201)
    ).body;
    expect(unable.machine.productionState).toBe("blocked");
    expect(unable.inspections[0].bearingAssessment).toBe("unable_to_assess");
    expect(unable.currentDisposition.disposition).toBe("owner_review");
    const dryerAfterUnable = (
      await get(application, "/production/work", dryerTech.cookies).expect(200)
    ).body;
    expect(dryerAfterUnable.initialChecks).toHaveLength(0);
    expect(
      dryerAfterUnable.orders.find(
        (item: { machine: { id: string } }) =>
          item.machine.id === unableMachine.id,
      ),
    ).toBeUndefined();
  });
  it("filters Washer and Dryer work by specialty and routes a complete passing test to cleaning", async () => {
    const application = await app();
    const owner = await user(application, "owner", "owner_admin");
    const washerTech = await user(
      application,
      "washer-tech",
      "technician_cleaner",
    );
    const dryerTech = await user(
      application,
      "dryer-tech",
      "technician_cleaner",
    );
    const bothTech = await user(application, "both-tech", "technician_cleaner");
    const washer = await machine(application, owner.cookies, "washer");
    const dryer = await machine(application, owner.cookies, "dryer");
    const other = await machine(application, owner.cookies, "other");
    expect(washer.detail.machine).toMatchObject({
      inventoryState: "on_hand",
      productionState: "awaiting_test",
    });
    expect(other.detail.machine.productionState).toBe("preliminary_passed");
    expect(
      (
        await get(application, "/production/work", washerTech.cookies).expect(
          200,
        )
      ).body.orders,
    ).toHaveLength(0);
    await request(application.getHttpServer())
      .put(`/production/specialties/${washerTech.identity.id}`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ specialties: ["washer"] })
      .expect(200);
    await request(application.getHttpServer())
      .put(`/production/specialties/${dryerTech.identity.id}`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ specialties: ["dryer"] })
      .expect(200);
    await request(application.getHttpServer())
      .put(`/production/specialties/${bothTech.identity.id}`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ specialties: ["washer", "dryer"] })
      .expect(400);
    const bothQueue = (
      await get(application, "/production/work", bothTech.cookies).expect(200)
    ).body;
    expect(bothQueue.orders).toHaveLength(0);
    const washerQueue = (
      await get(application, "/production/work", washerTech.cookies).expect(200)
    ).body;
    expect(washerQueue.orders).toHaveLength(1);
    expect(washerQueue.orders[0].machine.id).toBe(washer.id);
    expect(
      (
        await get(application, "/production/work", dryerTech.cookies).expect(
          200,
        )
      ).body.orders[0].machine.id,
    ).toBe(dryer.id);
    const orderId = washerQueue.orders[0].order.id as string;
    expect(
      (
        await get(
          application,
          `/inventory/machines/${washer.id}/production/active-test`,
          washerTech.cookies,
        ).expect(200)
      ).body.orderId,
    ).toBe(orderId);
    expect(
      (
        await get(
          application,
          `/inventory/machines/${dryer.id}/production/active-test`,
          washerTech.cookies,
        ).expect(200)
      ).body.orderId,
    ).toBeNull();
    const started = (
      await post(
        application,
        `/production/work/${orderId}/start`,
        washerTech.cookies,
        { expectedVersion: 1 },
      ).expect(201)
    ).body;
    expect(started).toMatchObject({
      order: { state: "testing", assignedUserId: washerTech.identity.id },
      machine: { inventoryState: "on_hand", productionState: "testing" },
    });
    await reinspect(
      application,
      washer.id,
      started.machine.version,
      owner.cookies,
    ).expect(409);
    const afterRejectedReinspection = (
      await get(
        application,
        `/production/work/${orderId}`,
        washerTech.cookies,
      ).expect(200)
    ).body;
    expect(afterRejectedReinspection.order.version).toBe(started.order.version);
    expect(afterRejectedReinspection.machine).toMatchObject({
      version: started.machine.version,
      productionState: "testing",
    });
    expect(started.run.template.steps).toHaveLength(14);
    expect(
      started.run.template.steps.filter(
        (step: { allowNa: boolean }) => step.allowNa,
      ),
    ).toHaveLength(1);
    await post(
      application,
      `/production/work/${orderId}/finish`,
      washerTech.cookies,
      {
        expectedVersion: started.order.version,
        expectedSessionVersion: await activeSessionVersion(
          application,
          washerTech.cookies,
          started,
        ),
        videoFileId: null,
      },
    ).expect(409);
    let current = started;
    for (const step of started.run.template.steps) {
      current = (
        await post(
          application,
          `/production/work/${orderId}/steps`,
          washerTech.cookies,
          {
            expectedVersion: current.order.version,
            stepKey: step.key,
            result: "pass",
            fileId: null,
          },
        ).expect(201)
      ).body;
    }
    await post(
      application,
      `/production/work/${orderId}/finish`,
      washerTech.cookies,
      {
        expectedVersion: current.order.version,
        expectedSessionVersion: await activeSessionVersion(
          application,
          washerTech.cookies,
          current,
        ),
        videoFileId: null,
      },
    ).expect(409);
    const videoFileId = await video(application, washerTech.cookies, washer.id);
    const completed = (
      await post(
        application,
        `/production/work/${orderId}/finish`,
        washerTech.cookies,
        {
          expectedVersion: current.order.version,
          expectedSessionVersion: await activeSessionVersion(
            application,
            washerTech.cookies,
            current,
          ),
          videoFileId,
        },
      ).expect(201)
    ).body;
    expect(completed).toMatchObject({
      order: { state: "awaiting_clean" },
      machine: { inventoryState: "on_hand", productionState: "awaiting_clean" },
    });
    await reinspect(
      application,
      washer.id,
      completed.machine.version,
      owner.cookies,
    ).expect(409);
    const afterCompletedReinspection = (
      await get(
        application,
        `/production/work/${orderId}`,
        washerTech.cookies,
      ).expect(200)
    ).body;
    expect(afterCompletedReinspection.order.version).toBe(
      completed.order.version,
    );
    expect(afterCompletedReinspection.machine).toMatchObject({
      version: completed.machine.version,
      productionState: "awaiting_clean",
    });
    expect(completed.run.results).toHaveLength(14);
    expect(
      (
        await get(application, "/production/work", washerTech.cookies).expect(
          200,
        )
      ).body.orders,
    ).toHaveLength(0);
    expect(
      (
        await get(
          application,
          `/production/work/${orderId}`,
          washerTech.cookies,
        ).expect(200)
      ).body.run.results,
    ).toHaveLength(14);
  });

  it("retains corrections, enforces claims and N/A, and derives repair handoff from the latest failure", async () => {
    const application = await app();
    const owner = await user(application, "owner", "owner_admin");
    const technician = await user(application, "tech", "technician_cleaner");
    const second = await user(application, "second", "technician_cleaner");
    const dryer = await machine(application, owner.cookies, "dryer");
    for (const worker of [technician, second]) {
      await request(application.getHttpServer())
        .put(`/production/specialties/${worker.identity.id}`)
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", randomUUID())
        .send({ specialties: ["dryer"] })
        .expect(200);
    }
    const orderId = (
      await get(application, "/production/work", technician.cookies).expect(200)
    ).body.orders[0].order.id as string;
    let current = (
      await post(
        application,
        `/production/work/${orderId}/start`,
        technician.cookies,
        { expectedVersion: 1 },
      ).expect(201)
    ).body;
    await post(
      application,
      `/production/work/${orderId}/start`,
      second.cookies,
      { expectedVersion: 1 },
    ).expect(409);
    await post(
      application,
      `/production/work/${orderId}/steps`,
      technician.cookies,
      {
        expectedVersion: current.order.version,
        stepKey: "dryer_02",
        result: "na",
      },
    ).expect(409);
    current = (
      await post(
        application,
        `/production/work/${orderId}/steps`,
        technician.cookies,
        {
          expectedVersion: current.order.version,
          stepKey: "dryer_02",
          result: "pass",
        },
      ).expect(201)
    ).body;
    current = (
      await post(
        application,
        `/production/work/${orderId}/steps`,
        technician.cookies,
        {
          expectedVersion: current.order.version,
          stepKey: "dryer_02",
          result: "fail",
        },
      ).expect(201)
    ).body;
    expect(
      current.run.results.map((result: { result: string }) => result.result),
    ).toEqual(["pass", "fail"]);
    current = (
      await post(
        application,
        `/production/work/${orderId}/assignment`,
        owner.cookies,
        { expectedVersion: current.order.version, userId: second.identity.id },
      ).expect(201)
    ).body;
    current = (
      await post(
        application,
        `/production/work/${orderId}/start`,
        second.cookies,
        { expectedVersion: current.order.version },
      ).expect(201)
    ).body;
    await post(
      application,
      `/production/work/${orderId}/steps`,
      technician.cookies,
      {
        expectedVersion: current.order.version,
        stepKey: "dryer_02",
        result: "pass",
      },
    ).expect(409);
    for (const step of current.run.template.steps.slice(1)) {
      current = (
        await post(
          application,
          `/production/work/${orderId}/steps`,
          second.cookies,
          {
            expectedVersion: current.order.version,
            stepKey: step.key,
            result: "pass",
          },
        ).expect(201)
      ).body;
    }
    const completed = (
      await post(
        application,
        `/production/work/${orderId}/finish`,
        second.cookies,
        {
          expectedVersion: current.order.version,
          expectedSessionVersion: await activeSessionVersion(
            application,
            second.cookies,
            current,
          ),
          videoFileId: null,
        },
      ).expect(201)
    ).body;
    expect(completed).toMatchObject({
      order: { state: "awaiting_repair" },
      machine: {
        inventoryState: "on_hand",
        productionState: "awaiting_repair",
      },
    });
    await reinspect(
      application,
      dryer.id,
      completed.machine.version,
      owner.cookies,
    ).expect(409);
    const repairAfterReinspection = (
      await get(
        application,
        `/production/work/${orderId}`,
        second.cookies,
      ).expect(200)
    ).body;
    expect(repairAfterReinspection.order.version).toBe(completed.order.version);
    expect(repairAfterReinspection.machine).toMatchObject({
      version: completed.machine.version,
      productionState: "awaiting_repair",
    });
    expect(
      completed.claims.map((claim: { action: string }) => claim.action),
    ).toEqual(["claimed", "reassigned"]);
    expect(
      (
        await get(
          application,
          `/inventory/machines/${dryer.id}/production/active-test`,
          second.cookies,
        ).expect(200)
      ).body.orderId,
    ).toBeNull();
  });

  it("removes read and execution access after role change or deactivation without erasing specialties", async () => {
    const application = await app();
    const owner = await user(application, "owner", "owner_admin");
    const technician = await user(application, "worker", "technician_cleaner");
    await machine(application, owner.cookies, "washer");
    await request(application.getHttpServer())
      .put(`/production/specialties/${technician.identity.id}`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ specialties: ["washer"] })
      .expect(200);
    const orderId = (
      await get(application, "/production/work", technician.cookies).expect(200)
    ).body.orders[0].order.id as string;
    const demoted = await request(application.getHttpServer())
      .patch(`/identity/users/${technician.identity.id}/role`)
      .set("Cookie", owner.cookies)
      .send({ role: "warehouse", expectedVersion: technician.identity.version })
      .expect(200);
    await get(application, "/production/work", technician.cookies).expect(401);
    await post(
      application,
      `/production/work/${orderId}/start`,
      technician.cookies,
      { expectedVersion: 1 },
    ).expect(401);
    const warehouseLogin = await request(application.getHttpServer())
      .post("/auth/sign-in/email")
      .set("origin", "http://localhost:3000")
      .send({ email: "worker@work.test", password: "worker-secure-password" })
      .expect(200);
    const warehouseCookies = warehouseLogin.headers[
      "set-cookie"
    ] as unknown as string[];
    await get(application, "/production/work", warehouseCookies).expect(403);
    await get(
      application,
      `/production/work/${orderId}`,
      warehouseCookies,
    ).expect(403);
    await post(
      application,
      `/production/work/${orderId}/start`,
      warehouseCookies,
      { expectedVersion: 1 },
    ).expect(403);
    const restored = await request(application.getHttpServer())
      .patch(`/identity/users/${technician.identity.id}/role`)
      .set("Cookie", owner.cookies)
      .send({
        role: "technician_cleaner",
        expectedVersion: demoted.body.user.version,
      })
      .expect(200);
    const restoredLogin = await request(application.getHttpServer())
      .post("/auth/sign-in/email")
      .set("origin", "http://localhost:3000")
      .send({ email: "worker@work.test", password: "worker-secure-password" })
      .expect(200);
    const restoredCookies = restoredLogin.headers[
      "set-cookie"
    ] as unknown as string[];
    expect(
      (await get(application, "/production/work", restoredCookies).expect(200))
        .body.orders,
    ).toHaveLength(1);
    await request(application.getHttpServer())
      .patch(`/identity/users/${technician.identity.id}/active`)
      .set("Cookie", owner.cookies)
      .send({ active: false, expectedVersion: restored.body.user.version })
      .expect(200);
    await get(
      application,
      `/production/work/${orderId}`,
      restoredCookies,
    ).expect(401);
    await post(
      application,
      `/production/work/${orderId}/start`,
      restoredCookies,
      { expectedVersion: 1 },
    ).expect(401);
    expect(
      (
        await get(application, "/production/specialties", owner.cookies).expect(
          200,
        )
      ).body.assignments,
    ).toEqual(
      expect.arrayContaining([
        { userId: technician.identity.id, specialties: ["washer"] },
      ]),
    );
  });

  it("pins a later approved checklist and rejects missing, wrong-Machine, or reused private photos", async () => {
    const application = await app();
    const owner = await user(application, "owner", "owner_admin");
    const technician = await user(application, "tech", "technician_cleaner");
    const first = await machine(application, owner.cookies, "washer");
    const second = await machine(application, owner.cookies, "washer");
    const database =
      application.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const templateId = randomUUID();
    await database.execute(
      sql`insert into production_test_template(id, machine_type, version) values (${templateId}, 'washer', 3)`,
    );
    await database.execute(
      sql`insert into production_test_step(template_id, step_key, position, instruction, allow_na, stop_on_failure, photo_required) values (${templateId}, 'washer_photo', 0, 'Capture private Machine photo', false, false, true)`,
    );
    await database.execute(
      sql`update production_test_template set approved_at = now() where id = ${templateId}`,
    );
    await request(application.getHttpServer())
      .put(`/production/specialties/${technician.identity.id}`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ specialties: ["washer"] })
      .expect(200);
    const orderId = (
      await get(application, "/production/work", technician.cookies).expect(200)
    ).body.orders.find(
      (item: { machine: { id: string } }) => item.machine.id === first.id,
    ).order.id as string;
    let current = (
      await post(
        application,
        `/production/work/${orderId}/start`,
        technician.cookies,
        { expectedVersion: 1 },
      ).expect(201)
    ).body;
    expect(current.run.template).toMatchObject({ id: templateId, version: 3 });
    await expect(
      database.execute(
        sql`insert into production_test_step(template_id, step_key, position, instruction) values (${templateId}, 'late_pinned_step', 1, 'Would alter active run')`,
      ),
    ).rejects.toThrow();
    const nextTemplateId = randomUUID();
    await database.execute(
      sql`insert into production_test_template(id, machine_type, version) values (${nextTemplateId}, 'washer', 4)`,
    );
    await database.execute(
      sql`insert into production_test_step(template_id, step_key, position, instruction) values (${nextTemplateId}, 'washer_v3', 0, 'New-version test')`,
    );
    await database.execute(
      sql`update production_test_template set approved_at = now() where id = ${nextTemplateId}`,
    );
    await expect(
      database.execute(
        sql`update production_test_run set template_id = ${nextTemplateId} where id = ${current.run.id}`,
      ),
    ).rejects.toThrow();
    const secondOrderId = (
      await get(application, "/production/work", technician.cookies).expect(200)
    ).body.orders.find(
      (item: { machine: { id: string } }) => item.machine.id === second.id,
    ).order.id as string;
    const secondStarted = (
      await post(
        application,
        `/production/work/${secondOrderId}/start`,
        technician.cookies,
        { expectedVersion: 1 },
      ).expect(201)
    ).body;
    expect(secondStarted.run.template).toMatchObject({
      id: nextTemplateId,
      version: 4,
    });
    expect(
      (
        await get(
          application,
          `/production/work/${orderId}`,
          technician.cookies,
        ).expect(200)
      ).body.run.template,
    ).toMatchObject({
      id: templateId,
      version: 3,
      steps: [expect.objectContaining({ key: "washer_photo" })],
    });
    await post(
      application,
      `/production/work/${orderId}/steps`,
      technician.cookies,
      {
        expectedVersion: current.order.version,
        stepKey: "washer_photo",
        result: "pass",
      },
    ).expect(409);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    async function photo(machineId: string, purpose: string) {
      const grant = await request(application.getHttpServer())
        .post("/files/upload-grants")
        .set("Cookie", technician.cookies)
        .send({
          target: { type: "machine", id: machineId },
          purpose,
          originalFilename: "test.jpg",
          declaredMediaType: "image/jpeg",
          declaredByteCount: bytes.length,
        })
        .expect(201);
      await request(application.getHttpServer())
        .post(`/files/${grant.body.file.id}/upload-content`)
        .set("Cookie", technician.cookies)
        .set("x-file-grant", grant.body.grant.token)
        .attach("file", bytes, {
          filename: "test.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
      return grant.body.file.id as string;
    }
    const wrongMachine = await photo(second.id, "production_test_evidence");
    const wrongPurpose = await photo(first.id, "preliminary_inspection");
    for (const fileId of [wrongMachine, wrongPurpose, randomUUID()]) {
      await post(
        application,
        `/production/work/${orderId}/steps`,
        technician.cookies,
        {
          expectedVersion: current.order.version,
          stepKey: "washer_photo",
          result: "pass",
          fileId,
        },
      ).expect(409);
    }
    const good = await photo(first.id, "production_test_evidence");
    const key = randomUUID();
    const body = {
      expectedVersion: current.order.version,
      stepKey: "washer_photo",
      result: "pass",
      fileId: good,
    };
    current = (
      await post(
        application,
        `/production/work/${orderId}/steps`,
        technician.cookies,
        body,
        key,
      ).expect(201)
    ).body;
    expect(
      (
        await post(
          application,
          `/production/work/${orderId}/steps`,
          technician.cookies,
          body,
          key,
        ).expect(201)
      ).body.run.results,
    ).toHaveLength(1);
    await post(
      application,
      `/production/work/${orderId}/steps`,
      technician.cookies,
      {
        expectedVersion: current.order.version,
        stepKey: "washer_photo",
        result: "fail",
        fileId: good,
      },
    ).expect(409);
    await expect(
      database.execute(
        sql`update production_test_step_result set result = 'fail' where run_id = ${current.run.id}`,
      ),
    ).rejects.toThrow();
    const wrongMachineVideo = await video(
      application,
      technician.cookies,
      second.id,
    );
    const pendingVideo = await request(application.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", technician.cookies)
      .send({
        target: { type: "machine", id: first.id },
        purpose: "production_test_video",
        originalFilename: "pending.mp4",
        declaredMediaType: "video/mp4",
        declaredByteCount: 16,
      })
      .expect(201);
    for (const invalidVideoFileId of [
      null,
      wrongMachineVideo,
      wrongPurpose,
      pendingVideo.body.file.id,
      randomUUID(),
    ]) {
      await post(
        application,
        `/production/work/${orderId}/finish`,
        technician.cookies,
        {
          expectedVersion: current.order.version,
          expectedSessionVersion: await activeSessionVersion(
            application,
            technician.cookies,
            current,
          ),
          videoFileId: invalidVideoFileId,
        },
      ).expect(409);
    }
    const videoFileId = await video(application, technician.cookies, first.id);
    const completed = (
      await post(
        application,
        `/production/work/${orderId}/finish`,
        technician.cookies,
        {
          expectedVersion: current.order.version,
          expectedSessionVersion: await activeSessionVersion(
            application,
            technician.cookies,
            current,
          ),
          videoFileId,
        },
      ).expect(201)
    ).body;
    expect(completed.order.state).toBe("awaiting_clean");
    expect(completed.run.videoFileId).toBe(videoFileId);
  });
});
