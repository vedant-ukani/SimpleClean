import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@laundrorama/config";
import type {
  IntakeOcrResult,
  IntakeSemanticResult,
} from "@laundrorama/contracts";
import type { DatabaseConnection } from "@laundrorama/database";
import { createTestEnvironment } from "@laundrorama/test-support";
import { sql } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { IdentityService } from "../src/modules/identity/identity.service.js";
import { OperationsWorker } from "../src/modules/operations/operations.worker.js";
import { DATABASE_CONNECTION } from "../src/platform/database.module.js";
import {
  INTAKE_OCR_VERIFIER,
  INTAKE_SEMANTIC_RECOGNIZER,
  type IntakeOcrVerifier,
  type IntakeSemanticRecognizer,
} from "../src/modules/inventory/intake/recognition.ports.js";
import {
  DeterministicFakeOcrVerifier,
  DeterministicFakeSemanticRecognizer,
  RecognitionProviderError,
} from "../src/modules/inventory/intake/recognition/providers/index.js";
import { IntakeRecognitionRepository } from "../src/modules/inventory/intake/recognition.repository.js";

const applications: INestApplication[] = [];
const roots: string[] = [];

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result)
    return (result as { rows: T[] }).rows;
  return [];
}

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.close()),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createApplication(overrides?: {
  semantic?: IntakeSemanticRecognizer;
  ocr?: IntakeOcrVerifier;
  environment?: Record<string, string>;
}): Promise<INestApplication> {
  const root = await mkdtemp(
    join(tmpdir(), "laundrorama-intake-recognition-"),
  );
  roots.push(root);
  const config = parseServerEnvironment(
    createTestEnvironment({
      FILE_LOCAL_DIRECTORY: root,
      INTAKE_RECOGNITION_ENABLED: "true",
      INTAKE_RECOGNITION_SEMANTIC_PROVIDER: "fake",
      INTAKE_RECOGNITION_SEMANTIC_MODEL: "deterministic-v1",
      INTAKE_RECOGNITION_VERIFIER_PROVIDER: "fake",
      INTAKE_RECOGNITION_VERIFIER_MODEL: "deterministic-v1",
      INTAKE_RECOGNITION_GROUP_FLOOR: "0.9",
      INTAKE_RECOGNITION_FIELD_FLOOR: "0.9",
      INTAKE_RECOGNITION_OCR_FLOOR: "0.9",
      INTAKE_RECOGNITION_POLICY_VERSION: "intake-nameplate-policy-v2",
      ...(overrides?.environment ?? {}),
    }),
  );
  const builder = Test.createTestingModule({
    imports: [AppModule.register(config)],
  });
  if (overrides?.semantic)
    builder
      .overrideProvider(INTAKE_SEMANTIC_RECOGNIZER)
      .useValue(overrides.semantic);
  if (overrides?.ocr)
    builder.overrideProvider(INTAKE_OCR_VERIFIER).useValue(overrides.ocr);
  const module = await builder.compile();
  await module.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();
  const app = module.createNestApplication({ bodyParser: false });
  applications.push(app);
  await app.init();
  return app;
}

async function signIn(app: INestApplication) {
  const email = `recognition-owner-${randomUUID()}@example.test`;
  const password = "recognition-owner-password";
  const identity = await app.get(IdentityService).provisionUser(
    {
      name: "recognition-owner",
      email,
      password,
      role: "owner_admin",
    },
    { requestId: randomUUID() },
  );
  const response = await request(app.getHttpServer())
    .post("/auth/sign-in/email")
    .set("origin", "http://localhost:3000")
    .send({ email, password })
    .expect(200);
  return {
    cookies: response.headers["set-cookie"] as unknown as string[],
    userId: identity.id,
  };
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function createPhoto(
  app: INestApplication,
  cookies: string[],
  loadId: string,
  filename: string,
  photoBytes: Buffer = png,
): Promise<string> {
  const grant = await request(app.getHttpServer())
    .post("/files/upload-grants")
    .set("Cookie", cookies)
    .send({
      target: { type: "load", id: loadId },
      purpose: "intake_evidence",
      originalFilename: filename,
      declaredMediaType: "image/png",
      declaredByteCount: photoBytes.length,
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/files/${grant.body.file.id}/upload-content`)
    .set("Cookie", cookies)
    .set("x-file-grant", grant.body.grant.token)
    .attach("file", photoBytes, { filename, contentType: "image/png" })
    .expect(201);
  return grant.body.file.id as string;
}

async function createLoadAndBatch(
  app: INestApplication,
  cookies: string[],
  label: string,
  photoBytes: Buffer = png,
) {
  const load = await request(app.getHttpServer())
    .post("/inventory/loads")
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({ displayName: label })
    .expect(201);
  const loadId = load.body.load.id as string;
  const fileId = await createPhoto(
    app,
    cookies,
    loadId,
    `${label}.png`,
    photoBytes,
  );
  const batch = await request(app.getHttpServer())
    .post(`/inventory/loads/${loadId}/intake`)
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({ loadId })
    .expect(201);
  const batchId = batch.body.batch.id as string;
  const linked = await request(app.getHttpServer())
    .post(`/inventory/intake/${batchId}/photos`)
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({ fileId, expectedVersion: batch.body.batch.version })
    .expect(201);
  return {
    loadId,
    batchId,
    fileId,
    detail: linked.body as {
      batch: { id: string; version: number };
      photos: { id: string; fileId: string }[];
    },
  };
}

describe("Intake recognition API and worker journey", () => {
  it("passes distinct OCR and semantic derivatives with the same source checksum and safe timings", async () => {
    const profiles: Array<{
      stage: string;
      width: number;
      height: number;
      bytes: number;
      checksum: string;
    }> = [];
    const ocr: IntakeOcrVerifier = {
      verify: async (images) => {
        profiles.push(
          ...images.map((image) => ({
            stage: "ocr",
            width: image.width,
            height: image.height,
            bytes: image.bytes.byteLength,
            checksum: image.sourceChecksum,
          })),
        );
        return new DeterministicFakeOcrVerifier().verify(images);
      },
    };
    const semantic: IntakeSemanticRecognizer = {
      recognize: async (images, evidence) => {
        profiles.push(
          ...images.map((image) => ({
            stage: "semantic",
            width: image.width,
            height: image.height,
            bytes: image.bytes.byteLength,
            checksum: image.sourceChecksum,
          })),
        );
        return new DeterministicFakeSemanticRecognizer().recognize(
          images,
          evidence,
        );
      },
    };
    const app = await createApplication({ semantic, ocr });
    const session = await signIn(app);
    const largePhoto = await sharp({
      create: { width: 3_000, height: 2_200, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const { batchId, detail } = await createLoadAndBatch(
      app,
      session.cookies,
      "Dual image profile",
      largePhoto,
    );
    await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", session.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: detail.batch.version, retry: false })
      .expect(201);
    await app.get(OperationsWorker).runOnce(100);
    expect(profiles).toHaveLength(2);
    expect(profiles[0]).toMatchObject({
      stage: "ocr",
      width: 3_000,
      height: 2_200,
    });
    expect(profiles[1]).toMatchObject({ stage: "semantic", width: 2_000 });
    expect(profiles[1]!.height).toBeLessThanOrEqual(2_000);
    expect(profiles[1]!.bytes).toBeLessThan(profiles[0]!.bytes);
    expect(profiles[0]!.checksum).toBe(profiles[1]!.checksum);
    const status = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", session.cookies)
      .expect(200);
    const attempt = status.body.latestRun.provenance.attempts[0];
    expect(attempt).toMatchObject({
      attempt: 1,
      ocrBytes: profiles[0]!.bytes,
      semanticBytes: profiles[1]!.bytes,
    });
    for (const stage of ["preparationMs", "ocrMs", "semanticMs", "totalMs"])
      expect(attempt[stage]).toEqual(expect.any(Number));
    expect(JSON.stringify(attempt)).not.toMatch(
      /ocrText|imageBase64|serial|prompt|credential/i,
    );
  }, 20_000);
  it("retries a timed-out recognition run through the durable worker", async () => {
    let semanticAttempts = 0;
    const callOrder: string[] = [];
    const semantic: IntakeSemanticRecognizer = {
      recognize: async (images) => {
        callOrder.push("openai");
        semanticAttempts += 1;
        if (semanticAttempts === 1)
          throw new RecognitionProviderError(
            "timeout",
            "Recognition provider timed out",
          );
        return new DeterministicFakeSemanticRecognizer().recognize(images);
      },
    };
    const ocr: IntakeOcrVerifier = {
      verify: async (images) => {
        callOrder.push("ocr");
        return new DeterministicFakeOcrVerifier().verify(images);
      },
    };
    const app = await createApplication({
      semantic,
      ocr,
      environment: {
        OPERATIONS_WORKER_MAX_ATTEMPTS: "2",
        OPERATIONS_WORKER_BACKOFF_BASE_MS: "100",
      },
    });
    const session = await signIn(app);
    const { batchId, detail } = await createLoadAndBatch(
      app,
      session.cookies,
      "Recognition timeout retry",
    );
    const queued = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", session.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: detail.batch.version, retry: false })
      .expect(201);
    const worker = app.get(OperationsWorker);

    await expect(worker.runOnce(100)).resolves.toMatchObject({ failed: 1 });
    const waiting = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", session.cookies)
      .expect(200);
    expect(waiting.body.latestRun).toMatchObject({
      id: queued.body.latestRun.id,
      state: "queued",
    });
    expect(waiting.body.latestRun.provenance.attempts).toMatchObject([
      { attempt: 1, outcome: "retry", errorCode: "provider_timeout" },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 125));
    const workerResult = await worker.runOnce(100);
    expect(workerResult.delivered).toBeGreaterThan(0);
    const completed = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", session.cookies)
      .expect(200);
    expect(completed.body.latestRun).toMatchObject({
      id: queued.body.latestRun.id,
      state: "needs_recapture",
      errorCode: null,
    });
    expect(semanticAttempts).toBe(2);
    expect(callOrder).toEqual(["ocr", "openai", "ocr", "openai"]);
    expect(completed.body.latestRun.provenance.attempts).toMatchObject([
      { attempt: 1, outcome: "retry", errorCode: "provider_timeout" },
      {
        attempt: 2,
        outcome: "needs_recapture",
        errorCode: "missing_critical_fact",
      },
    ]);
  }, 20_000);

  it("recovers an abandoned running run on outbox redelivery", async () => {
    let semanticAttempts = 0;
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const semantic: IntakeSemanticRecognizer = {
      recognize: async (images) => {
        semanticAttempts += 1;
        if (semanticAttempts === 1) {
          await firstBlocked;
        }
        return new DeterministicFakeSemanticRecognizer().recognize(images);
      },
    };
    const ocr: IntakeOcrVerifier = {
      verify: async (images) =>
        new DeterministicFakeOcrVerifier().verify(images),
    };
    const app = await createApplication({
      semantic,
      ocr,
      environment: {
        OPERATIONS_WORKER_MAX_ATTEMPTS: "2",
        OPERATIONS_WORKER_LEASE_SECONDS: "5",
        OPERATIONS_WORKER_BACKOFF_BASE_MS: "100",
      },
    });
    const session = await signIn(app);
    const { batchId, detail } = await createLoadAndBatch(
      app,
      session.cookies,
      "Recognition abandoned running retry",
    );
    const queued = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", session.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: detail.batch.version, retry: false })
      .expect(201);
    const worker = app.get(OperationsWorker);
    await expect(worker.runOnce(100)).resolves.toMatchObject({ failed: 1 });

    await new Promise((resolve) => setTimeout(resolve, 125));
    const redelivery = await worker.runOnce(100);
    expect(redelivery.delivered).toBeGreaterThan(0);
    const completed = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", session.cookies)
      .expect(200);
    expect(completed.body.latestRun).toMatchObject({
      id: queued.body.latestRun.id,
      errorCode: null,
    });
    expect(["ready", "needs_recapture", "failed", "stale"]).toContain(
      completed.body.latestRun.state,
    );
    expect(semanticAttempts).toBe(2);

    // Let the expired first handler finish after the redelivery has already
    // reached a terminal state. Its late completion must be fenced out.
    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const outboxJob = rows<{ id: string }>(
      await database.execute(
        sql`select id from platform_outbox_job where target_id = ${queued.body.latestRun.id}`,
      ),
    )[0]!;
    const artifacts = rows<{ count: number }>(
      await database.execute(sql`
        select count(*)::int as count
        from inventory_intake_recognition_group
        where run_id = ${queued.body.latestRun.id}
      `),
    );
    expect(artifacts[0]?.count).toBe(1);
    await app
      .get(IntakeRecognitionRepository)
      .fail(
        queued.body.latestRun.id,
        "provider_unavailable",
        `${outboxJob.id}:1`,
        {
          attempt: 1,
          preparationMs: 0,
          ocrMs: 0,
          semanticMs: 0,
          totalMs: 0,
          ocrBytes: 0,
          semanticBytes: 0,
          outcome: "failed",
          errorCode: "provider_unavailable",
        },
      );
    const stillTerminal = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", session.cookies)
      .expect(200);
    expect(stillTerminal.body.latestRun.state).toBe(
      completed.body.latestRun.state,
    );
  }, 20_000);

  it("links evidence, idempotently queues targeted work, applies fake recognition provenance, and marks stale output", async () => {
    const app = await createApplication();
    const { cookies } = await signIn(app);
    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;

    const journey = await createLoadAndBatch(
      app,
      cookies,
      "Recognition journey",
    );
    const requestKey = randomUUID();
    const requestBody = {
      expectedVersion: journey.detail.batch.version,
      retry: false,
    };
    const queued = await request(app.getHttpServer())
      .post(`/inventory/intake/${journey.batchId}/recognition`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", requestKey)
      .send(requestBody)
      .expect(201);
    const runId = queued.body.latestRun.id as string;
    expect(queued.body.latestRun.state).toBe("queued");

    const replay = await request(app.getHttpServer())
      .post(`/inventory/intake/${journey.batchId}/recognition`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", requestKey)
      .send(requestBody)
      .expect(201);
    expect(replay.body.latestRun.id).toBe(runId);
    const targetedJobs = rows<{
      event_type: string;
      target_type: string;
      target_id: string;
    }>(
      await database.execute(
        sql`select event_type, target_type, target_id from platform_outbox_job where event_type = 'inventory.intake.recognition.requested' and target_id = ${runId}`,
      ),
    );
    expect(targetedJobs).toEqual([
      {
        event_type: "inventory.intake.recognition.requested",
        target_type: "intake_recognition_run",
        target_id: runId,
      },
    ]);

    const worker = app.get(OperationsWorker);
    await expect(worker.runOnce(100)).resolves.toMatchObject({
      delivered: expect.any(Number),
    });
    const completed = await request(app.getHttpServer())
      .get(`/inventory/intake/${journey.batchId}/recognition`)
      .set("Cookie", cookies)
      .expect(200);
    expect(completed.body.latestRun).toMatchObject({
      id: runId,
      state: "ready",
      provider: "fake",
      model: "deterministic-v1",
      policyVersion: "intake-nameplate-policy-v2",
      provenance: {
        provider: "fake",
        verifier: "fake",
        verifierModel: "deterministic-v1",
      },
    });
    expect(completed.body.latestRun.groups).toHaveLength(1);
    expect(completed.body.latestRun.groups[0]).toMatchObject({
      accepted: true,
      photoIds: [journey.detail.photos[0]!.id],
    });
    expect(
      completed.body.latestRun.groups[0].fields.every(
        (field: { accepted: boolean; verifierAgreement: boolean }) =>
          field.accepted && field.verifierAgreement,
      ),
    ).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/inventory/intake/${journey.batchId}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(detail.body.candidates).toHaveLength(1);
    expect(detail.body.candidates[0]).toMatchObject({
      state: "confirmed",
      confirmationSource: "recognition",
      manufacturer: "FAKE",
      model: `FAKE-MODEL-${journey.detail.photos[0]!.id.slice(0, 8)}`,
      serial: `FAKE-${journey.detail.photos[0]!.id.slice(0, 8)}`,
    });
    expect(detail.body.photos[0]).toMatchObject({
      disposition: "assigned",
      candidateId: detail.body.candidates[0].id,
    });
    const persisted = rows<{
      candidate_source: string;
      candidate_id: string;
      photo_candidate_id: string;
      verification: { verifierAgreement?: boolean };
    }>(
      await database.execute(
        sql`select c.confirmation_source as candidate_source, c.id as candidate_id, p.candidate_id as photo_candidate_id, f.verification from inventory_intake_candidate c inner join inventory_intake_photo p on p.candidate_id = c.id inner join inventory_intake_recognition_group g on g.run_id = ${runId} inner join inventory_intake_recognition_field f on f.group_id = g.id where c.batch_id = ${journey.batchId} and f.field = 'serial'`,
      ),
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      candidate_source: "recognition",
      candidate_id: detail.body.candidates[0].id,
      photo_candidate_id: detail.body.candidates[0].id,
      verification: { verifierAgreement: true },
    });

    const retry = await request(app.getHttpServer())
      .post(`/inventory/intake/${journey.batchId}/recognition`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: detail.body.batch.version, retry: true })
      .expect(201);
    const retryRunId = retry.body.latestRun.id as string;
    expect(retryRunId).not.toBe(runId);
    expect(retry.body.latestRun.state).toBe("queued");
    await worker.runOnce(100);
    const retriedDetail = await request(app.getHttpServer())
      .get(`/inventory/intake/${journey.batchId}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(retriedDetail.body.candidates).toHaveLength(1);
    expect(retriedDetail.body.candidates[0].id).toBe(
      detail.body.candidates[0].id,
    );
    const retried = await request(app.getHttpServer())
      .get(`/inventory/intake/${journey.batchId}/recognition`)
      .set("Cookie", cookies)
      .expect(200);
    expect(retried.body.latestRun).toMatchObject({
      id: retryRunId,
      state: "ready",
    });

    const staleJourney = await createLoadAndBatch(
      app,
      cookies,
      "Stale recognition journey",
    );
    const staleRequest = await request(app.getHttpServer())
      .post(`/inventory/intake/${staleJourney.batchId}/recognition`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        expectedVersion: staleJourney.detail.batch.version,
        retry: false,
      })
      .expect(201);
    const staleRunId = staleRequest.body.latestRun.id as string;
    await request(app.getHttpServer())
      .post(`/inventory/intake/${staleJourney.batchId}/candidates`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: staleJourney.detail.batch.version })
      .expect(201);
    await worker.runOnce(100);
    const stale = await request(app.getHttpServer())
      .get(`/inventory/intake/${staleJourney.batchId}/recognition`)
      .set("Cookie", cookies)
      .expect(200);
    expect(stale.body.latestRun).toMatchObject({
      id: staleRunId,
      state: "stale",
      errorCode: "stale_input",
    });
  }, 20_000);

  it("fills capacity from targeted recognition without replacing worker-confirmed capacity", async () => {
    let semanticCalls = 0;
    const semantic: IntakeSemanticRecognizer = {
      recognize: async (images) => {
        const photoId = images[0]!.photoId;
        const capacity = semanticCalls++ === 0 ? "40 lb" : "60 lb";
        const result: IntakeSemanticResult = {
          provider: "fake",
          model: "capacity-fixture",
          schemaVersion: "intake-nameplate-v2",
          requestId: null,
          groups: [
            {
              key: `photo-${photoId}`,
              photoIds: [photoId],
              confidence: 1,
              fields: [
                ["manufacturer", "ACME", "manufacturer"],
                ["model", `MX-${photoId.slice(0, 8)}`, "model"],
                ["serial", `SN-${photoId.slice(0, 8)}`, "serial"],
                ["machineType", "washer", "machineType"],
                ["voltage", "120V", "voltage"],
                ["phase", "single_phase", "phase"],
                ["fuel", "electric", "fuel"],
                ["capacityLb", capacity, "capacity"],
              ].map(([field, value, lineId]) => ({
                field: field as
                  "manufacturer" | "model" | "serial" | "capacityLb",
                value: value ?? "",
                confidence: 1,
                photoId,
                box: { x: 0, y: 0, width: 0.5, height: 0.1 },
                ocrLineIds: [lineId ?? ""],
              })),
              quality: [],
            },
          ],
        };
        return result;
      },
    };
    const ocr: IntakeOcrVerifier = {
      verify: async (images) => {
        const photoId = images[0]!.photoId;
        const result: IntakeOcrResult = {
          provider: "fake",
          model: "capacity-ocr-fixture",
          lines: [
            ["manufacturer", "ACME"],
            ["model", `MX-${photoId.slice(0, 8)}`],
            ["serial", `SN-${photoId.slice(0, 8)}`],
            ["machineType", "washer"],
            ["voltage", "120V"],
            ["phase", "single_phase"],
            ["fuel", "electric"],
            ["capacity", semanticCalls === 0 ? "40 lb" : "60 lb"],
          ].map(([lineId, text]) => ({
            lineId: lineId ?? "",
            photoId,
            text: text ?? "",
            confidence: 1,
            box: { x: 0, y: 0, width: 0.5, height: 0.1 },
          })),
        };
        return result;
      },
    };
    const app = await createApplication({ semantic, ocr });
    const { cookies } = await signIn(app);
    const journey = await createLoadAndBatch(
      app,
      cookies,
      "Targeted capacity preservation",
    );
    const worker = app.get(OperationsWorker);

    const initial = await request(app.getHttpServer())
      .post(`/inventory/intake/${journey.batchId}/recognition`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: journey.detail.batch.version })
      .expect(201);
    await worker.runOnce(100);
    const firstDetail = await request(app.getHttpServer())
      .get(`/inventory/intake/${journey.batchId}`)
      .set("Cookie", cookies)
      .expect(200);
    const candidate = firstDetail.body.candidates[0] as {
      id: string;
      capacityLb: number;
    };
    expect(initial.body.latestRun.id).toBeTruthy();
    expect(candidate.capacityLb).toBe(40);

    const workerConfirmed = await request(app.getHttpServer())
      .patch(
        `/inventory/intake/${journey.batchId}/candidates/${candidate.id}/capacity`,
      )
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ capacityLb: 50, expectedVersion: firstDetail.body.batch.version })
      .expect(200);
    expect(
      workerConfirmed.body.candidates.find(
        (item: { id: string }) => item.id === candidate.id,
      ).capacityLb,
    ).toBe(50);

    await request(app.getHttpServer())
      .post(`/inventory/intake/${journey.batchId}/recognition`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        expectedVersion: workerConfirmed.body.batch.version,
        photoId: journey.detail.photos[0]!.id,
        candidateId: candidate.id,
      })
      .expect(201);
    await worker.runOnce(100);
    const finalDetail = await request(app.getHttpServer())
      .get(`/inventory/intake/${journey.batchId}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(
      finalDetail.body.candidates.find(
        (item: { id: string }) => item.id === candidate.id,
      ).capacityLb,
    ).toBe(50);
    expect(semanticCalls).toBe(2);
  }, 20_000);

  it("accepts OCR-authoritative targeted mapping without creating a recapture", async () => {
    let semanticCalls = 0;
    let ocrCalls = 0;
    let unsupported = false;
    const semantic: IntakeSemanticRecognizer = {
      recognize: async (images, ocr) => {
        semanticCalls += 1;
        const photoId = images[0]!.photoId;
        const lines = ocr?.lines ?? [];
        const valueFor = (text: string) =>
          lines.find((line) => line.text === text)?.lineId ?? "missing-line";
        const fields = (
          [
            ["machineType", "dryer"],
            ["manufacturer", "THE DEXTER COMPANY"],
            ["model", unsupported ? "DL2X30QB" : "DL2X30QA"],
            ["serial", "1990300131068"],
            ["voltage", "120 V"],
            ["fuel", "gas"],
          ] as const
        ).map(([field, value]) => ({
          field,
          value,
          confidence: 0.2,
          photoId,
          box: { x: 0, y: 0, width: 0.5, height: 0.1 },
          ocrLineIds: [valueFor(value)],
        }));
        return {
          provider: "fake",
          model: "ocr-authoritative-fixture",
          schemaVersion: "intake-nameplate-v2",
          requestId: null,
          groups: [
            {
              key: `photo-${photoId}`,
              photoIds: [photoId],
              confidence: 0.2,
              fields,
              quality: [{ photoId, reason: "glare" }],
            },
          ],
        };
      },
    };
    const ocr: IntakeOcrVerifier = {
      verify: async (images) => {
        ocrCalls += 1;
        const photoId = images[0]!.photoId;
        const entries = [
          ["machineType", "dryer"],
          ["manufacturer", "THE DEXTER COMPANY"],
          ["model", "DL2X30QA"],
          ["serial", "1990300131068"],
          ["voltage", "120 V"],
          ["fuel", "gas"],
        ] as const;
        return {
          provider: "google-vision",
          model: "document-text-detection",
          lines: entries.map(([lineId, text]) => ({
            lineId,
            photoId,
            text,
            confidence: 0.2,
            box: { x: 0, y: 0, width: 0.5, height: 0.1 },
          })),
        };
      },
    };
    const app = await createApplication({ semantic, ocr });
    const { cookies } = await signIn(app);
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "OCR authoritative targeted mapping" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const fileId = await createPhoto(app, cookies, loadId, "dexter.png");
    const batch = await request(app.getHttpServer())
      .post(`/inventory/loads/${loadId}/intake`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(201);
    const item = await request(app.getHttpServer())
      .post(`/inventory/intake/${batch.body.batch.id}/items`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        fileId,
        expectedVersion: batch.body.batch.version,
      })
      .expect(201);
    const batchId = item.body.batch.id as string;
    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION).database;
    const existingMachineId = randomUUID();
    await database.execute(sql`
      insert into inventory_machine (
        id, machine_type, manufacturer, normalized_manufacturer, model, serial,
        normalized_serial, source_load_id, inventory_state
      ) values (
        ${existingMachineId}, 'dryer', 'THE DEXTER COMPANY', 'the dexter company',
        'DL2X30QA', '1990300131068', '1990300131068', ${loadId}, 'on_hand'
      )
    `);
    await app.get(OperationsWorker).runOnce(100);
    expect({ semanticCalls, ocrCalls }).toEqual({
      semanticCalls: 1,
      ocrCalls: 1,
    });
    const recognition = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", cookies)
      .expect(200);
    expect(recognition.body.latestRun).toMatchObject({
      state: "ready",
      errorCode: null,
      provenance: {
        model: "ocr-authoritative-fixture",
        verifier: "google-vision",
      },
    });
    expect(recognition.body.recaptures).toEqual([]);
    const detail = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(detail.body.candidates[0]).toMatchObject({
      state: "confirmed",
      machineType: null,
      manufacturer: "THE DEXTER COMPANY",
      model: "DL2X30QA",
      serial: "1990300131068",
    });
    unsupported = true;
    const candidate = detail.body.candidates[0];
    const photo = detail.body.photos[0];
    await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        expectedVersion: detail.body.batch.version,
        photoId: photo.id,
        candidateId: candidate.id,
        retry: true,
      })
      .expect(201);
    await app.get(OperationsWorker).runOnce(100);
    const rejected = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", cookies)
      .expect(200);
    expect(rejected.body.latestRun).toMatchObject({
      state: "failed",
      errorCode: "unsupported_evidence",
    });
    expect(rejected.body.recaptures).toEqual([]);

    const afterRetryDetail = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}`)
      .set("Cookie", cookies)
      .expect(200);
    const typed = await request(app.getHttpServer())
      .patch(`/inventory/intake/${batchId}/candidates/${candidate.id}/type`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "dryer",
        expectedVersion: afterRetryDetail.body.batch.version,
      })
      .expect(200);
    const committed = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/candidates/${candidate.id}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: typed.body.batch.version })
      .expect(201);
    const committedMachineId = committed.body.machineId as string;
    expect(committedMachineId).toBeTruthy();
    expect(committedMachineId).not.toBe(existingMachineId);

    const mappings = rows<{ candidate_id: string; machine_id: string }>(
      await database.execute(
        sql`select candidate_id, machine_id from inventory_intake_machine_mapping where candidate_id = ${candidate.id}`,
      ),
    );
    expect(mappings).toEqual([
      { candidate_id: candidate.id, machine_id: committedMachineId },
    ]);
    const evidence = rows<{ machine_id: string; source_kind: string }>(
      await database.execute(
        sql`select machine_id, source_kind from machine_identity_evidence where machine_id = ${committedMachineId}`,
      ),
    );
    expect(evidence).toEqual([
      { machine_id: committedMachineId, source_kind: "photo_intake" },
    ]);
    const machines = rows<{
      id: string;
      identity_verification_state: string;
      normalized_manufacturer: string;
      normalized_serial: string;
    }>(
      await database.execute(
        sql`select id, identity_verification_state, normalized_manufacturer, normalized_serial from inventory_machine where id in (${sql.join(
          [existingMachineId, committedMachineId].map((id) => sql`${id}`),
          sql`, `,
        )}) order by id`,
      ),
    );
    expect(machines).toHaveLength(2);
    expect(
      machines.map((machine) => machine.identity_verification_state),
    ).toEqual(["provisional", "provisional"]);
    expect(
      new Set(machines.map((machine) => machine.normalized_manufacturer)),
    ).toEqual(new Set(["the dexter company"]));
    expect(
      new Set(machines.map((machine) => machine.normalized_serial)),
    ).toEqual(new Set(["1990300131068"]));
  }, 20_000);

  it("queues independent machine items without staling the first item", async () => {
    const app = await createApplication();
    const { cookies } = await signIn(app);
    const worker = app.get(OperationsWorker);
    const load = await request(app.getHttpServer())
      .post("/inventory/loads")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ displayName: "Pipelined intake" })
      .expect(201);
    const loadId = load.body.load.id as string;
    const batch = await request(app.getHttpServer())
      .post(`/inventory/loads/${loadId}/intake`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ loadId })
      .expect(201);
    const batchId = batch.body.batch.id as string;
    const fileA = await createPhoto(app, cookies, loadId, "machine-a.png");
    const fileB = await createPhoto(app, cookies, loadId, "machine-b.png");
    const first = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/items`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fileId: fileA, expectedVersion: 1 })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/items`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        fileId: fileB,
        expectedVersion: first.body.batch.version,
      })
      .expect(201);
    expect(second.body.items).toHaveLength(2);
    const firstItem = second.body.items.find(
      (item: { fileId: string }) => item.fileId === fileA,
    );
    const secondItem = second.body.items.find(
      (item: { fileId: string }) => item.fileId === fileB,
    );
    expect(firstItem.machineType).toBeNull();
    expect(secondItem.machineType).toBeNull();
    const workerResult = await worker.runOnce(100);
    expect(workerResult.delivered).toBeGreaterThan(0);
    const afterFirst = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}/recognition`)
      .set("Cookie", cookies)
      .expect(200);
    expect(afterFirst.body.runs).toHaveLength(2);
    expect(
      new Set(
        afterFirst.body.runs.map(
          (run: { photoId: string; candidateId: string }) =>
            `${run.photoId}:${run.candidateId}`,
        ),
      ).size,
    ).toBe(2);
    expect(
      afterFirst.body.runs.every(
        (run: { state: string }) =>
          run.state === "ready" || run.state === "needs_recapture",
      ),
    ).toBe(true);
    expect(
      afterFirst.body.runs.some(
        (run: { state: string }) => run.state === "stale",
      ),
    ).toBe(false);
    const itemDetail = await request(app.getHttpServer())
      .get(`/inventory/intake/${batchId}`)
      .set("Cookie", cookies)
      .expect(200);
    const itemA = itemDetail.body.items.find(
      (item: { fileId: string }) => item.fileId === fileA,
    );
    const itemB = itemDetail.body.items.find(
      (item: { fileId: string }) => item.fileId === fileB,
    );
    expect(itemA.latestRunState).toBe("ready");
    expect(itemB.latestRunState).toBe("ready");
    const typedA = await request(app.getHttpServer())
      .patch(
        `/inventory/intake/${batchId}/candidates/${itemA.candidateId}/type`,
      )
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "washer",
        expectedVersion: itemDetail.body.batch.version,
      })
      .expect(200);
    const typedB = await request(app.getHttpServer())
      .patch(
        `/inventory/intake/${batchId}/candidates/${itemB.candidateId}/type`,
      )
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "dryer",
        expectedVersion: typedA.body.batch.version,
      })
      .expect(200);
    expect(
      typedB.body.candidates.every(
        (candidate: { state: string; machineType: string | null }) =>
          candidate.state === "confirmed" && candidate.machineType,
      ),
    ).toBe(true);
    const committed = await request(app.getHttpServer())
      .post(`/inventory/intake/${batchId}/commit`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: typedB.body.batch.version, finishOnly: false })
      .expect(201);
    expect(committed.body.batch.state).toBe("committed");
    expect(committed.body.machines).toHaveLength(2);
  }, 20_000);
});
