import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@simply-clean/config";
import type { DatabaseConnection } from "@simply-clean/database";
import { createTestEnvironment } from "@simply-clean/test-support";
import { sql } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { IdentityService } from "../src/modules/identity/identity.service.js";
import { FilesService } from "../src/modules/files/files.service.js";
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
  type StorageObject,
  type StorageObjectMetadata,
} from "../src/modules/files/storage.adapter.js";
import { DATABASE_CONNECTION } from "../src/platform/database.module.js";

const applications: INestApplication[] = [];
const storageRoots: string[] = [];

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === "object" && result !== null && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${label}`)),
          3_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.close()),
  );
  await Promise.all(
    storageRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function createApplication(
  storageOverride?: StorageAdapter,
): Promise<INestApplication> {
  const root = await mkdtemp(join(tmpdir(), "simply-clean-integration-files-"));
  storageRoots.push(root);
  const config = parseServerEnvironment(
    createTestEnvironment({ FILE_LOCAL_DIRECTORY: root }),
  );
  const builder = Test.createTestingModule({
    imports: [AppModule.register(config)],
  });
  if (storageOverride) {
    builder.overrideProvider(STORAGE_ADAPTER).useValue(storageOverride);
  }
  const module = await builder.compile();
  await module.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();
  const app = module.createNestApplication({ bodyParser: false });
  applications.push(app);
  await app.init();
  return app;
}

class BlockingStorageAdapter implements StorageAdapter {
  private readonly objects = new Map<string, StorageObject>();
  private releasePut!: () => void;
  private markPutStarted!: () => void;
  readonly putStarted = new Promise<void>((resolve) => {
    this.markPutStarted = resolve;
  });

  async put(
    key: string,
    bytes: Buffer,
    metadata: StorageObjectMetadata,
  ): Promise<void> {
    this.markPutStarted();
    await new Promise<void>((resolve) => {
      this.releasePut = resolve;
    });
    this.objects.set(key, { ...metadata, bytes });
  }

  release(): void {
    this.releasePut();
  }

  async head(key: string): Promise<StorageObjectMetadata | undefined> {
    const object = this.objects.get(key);
    if (!object) return undefined;
    return {
      byteCount: object.byteCount,
      mediaType: object.mediaType,
      sha256: object.sha256,
    };
  }

  async get(key: string): Promise<StorageObject | undefined> {
    return this.objects.get(key);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
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

async function foundation(app: INestApplication, ownerCookies: string[]) {
  const load = await request(app.getHttpServer())
    .post("/inventory/loads")
    .set("Cookie", ownerCookies)
    .send({ displayName: "Private File Load" })
    .expect(201);
  const machine = await request(app.getHttpServer())
    .post("/inventory/machines")
    .set("Cookie", ownerCookies)
    .send({ machineType: "washer", sourceLoadId: load.body.load.id })
    .expect(201);
  return {
    loadId: load.body.load.id as string,
    machineId: machine.body.machine.id as string,
  };
}

describe("private files", () => {
  it("uploads, lists, and downloads identical private Machine bytes once", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const otherWarehouse = await user(app, "warehouse", "-download-other");
    const { machineId } = await foundation(app, owner.cookies);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    const granted = await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", warehouse.cookies)
      .send({
        target: { type: "machine", id: machineId },
        purpose: "nameplate",
        originalFilename: 'plate\r\n".jpg',
        declaredMediaType: "image/jpeg",
        declaredByteCount: bytes.length,
      })
      .expect(201);
    expect(granted.body.file).not.toHaveProperty("storageKey");
    expect(granted.body.grant.token).toHaveLength(43);

    const secondSession = await request(app.getHttpServer())
      .post("/auth/sign-in/email")
      .set("origin", "http://localhost:3000")
      .send({
        email: "warehouse@example.test",
        password: "warehouse-secure-password",
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/files/${granted.body.file.id}/upload-content`)
      .set("Cookie", secondSession.headers["set-cookie"] as unknown as string[])
      .set("x-file-grant", granted.body.grant.token)
      .attach("file", bytes, {
        filename: "ignored.jpg",
        contentType: "image/jpeg",
      })
      .expect(403);

    const ready = await request(app.getHttpServer())
      .post(`/files/${granted.body.file.id}/upload-content`)
      .set("Cookie", warehouse.cookies)
      .set("x-file-grant", granted.body.grant.token)
      .attach("file", bytes, {
        filename: "ignored.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);
    expect(ready.body.file).toMatchObject({
      state: "ready",
      detectedMediaType: "image/jpeg",
      byteCount: bytes.length,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    await request(app.getHttpServer())
      .get("/files")
      .query({ machineId })
      .set("Cookie", warehouse.cookies)
      .expect(200)
      .expect(({ body }) => {
        expect(body.files).toHaveLength(1);
        expect(body.files[0]).not.toHaveProperty("storageKey");
      });

    const downloadGrant = await request(app.getHttpServer())
      .post(`/files/${granted.body.file.id}/download-grants`)
      .set("Cookie", warehouse.cookies)
      .expect(201);
    await request(app.getHttpServer())
      .get(`/files/${granted.body.file.id}/download-content`)
      .query({ grant: downloadGrant.body.grant.token })
      .set("Cookie", otherWarehouse.cookies)
      .expect(403);
    const downloaded = await request(app.getHttpServer())
      .get(`/files/${granted.body.file.id}/download-content`)
      .query({ grant: downloadGrant.body.grant.token })
      .set("Cookie", warehouse.cookies)
      .expect(200);
    expect(Buffer.from(downloaded.body)).toEqual(bytes);
    expect(downloaded.headers["cache-control"]).toBe("private, no-store");
    expect(downloaded.headers["content-disposition"]).toBe(
      'attachment; filename="plate___.jpg"',
    );
    await request(app.getHttpServer())
      .get(`/files/${granted.body.file.id}/download-content`)
      .query({ grant: downloadGrant.body.grant.token })
      .set("Cookie", warehouse.cookies)
      .expect(403);

    const expiredDownload = await request(app.getHttpServer())
      .post(`/files/${granted.body.file.id}/download-grants`)
      .set("Cookie", warehouse.cookies)
      .expect(201);

    const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    await connection.database.execute(sql`
      update file_access_grant set expires_at = now() - interval '1 second'
      where file_id = ${granted.body.file.id}
        and operation = 'download' and consumed_at is null
    `);
    await request(app.getHttpServer())
      .get(`/files/${granted.body.file.id}/download-content`)
      .query({ grant: expiredDownload.body.grant.token })
      .set("Cookie", warehouse.cookies)
      .expect(403);
    const activity = await connection.database.execute(sql`
      select action from file_activity where file_id = ${granted.body.file.id}
      order by created_at
    `);
    expect(
      resultRows<{ action: string }>(activity).map((row) => row.action),
    ).toEqual([
      "upload_grant_created",
      "upload_ready",
      "download_grant_created",
      "downloaded",
      "download_grant_created",
    ]);
  });

  it("enforces target access, issuer binding, expiry, and content policy", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const otherWarehouse = await user(app, "warehouse", "-other");
    const technician = await user(app, "technician_cleaner");
    const { loadId, machineId } = await foundation(app, owner.cookies);

    await request(app.getHttpServer())
      .post("/files/upload-grants")
      .send({
        target: { type: "machine", id: machineId },
        purpose: "nameplate",
        originalFilename: "plate.jpg",
        declaredMediaType: "image/jpeg",
        declaredByteCount: 4,
      })
      .expect(401);
    await request(app.getHttpServer())
      .get(
        "/files/3498c172-93d8-4eca-b0f6-0e70fe03516c/a6ebd4ca-f41a-4e94-a247-b0b359a65d66/download-content",
      )
      .set("Cookie", owner.cookies)
      .expect(404);
    await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", technician.cookies)
      .send({
        target: { type: "load", id: loadId },
        purpose: "receipt",
        originalFilename: "receipt.pdf",
        declaredMediaType: "application/pdf",
        declaredByteCount: 8,
      })
      .expect(403);
    await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", warehouse.cookies)
      .send({
        target: { type: "machine", id: machineId },
        purpose: "nameplate",
        originalFilename: "too-large.jpg",
        declaredMediaType: "image/jpeg",
        declaredByteCount: 15 * 1_024 * 1_024 + 1,
      })
      .expect(400);

    const grant = await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", warehouse.cookies)
      .send({
        target: { type: "machine", id: machineId },
        purpose: "nameplate",
        originalFilename: "plate.jpg",
        declaredMediaType: "image/jpeg",
        declaredByteCount: 4,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/files/${grant.body.file.id}/upload-content`)
      .set("Cookie", otherWarehouse.cookies)
      .set("x-file-grant", grant.body.grant.token)
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "plate.jpg")
      .expect(403);
    await request(app.getHttpServer())
      .post(`/files/${grant.body.file.id}/upload-content`)
      .set("Cookie", warehouse.cookies)
      .set("x-file-grant", grant.body.grant.token)
      .attach("file", Buffer.from("text"), "plate.jpg")
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("unsupported_content"));

    await request(app.getHttpServer())
      .get("/files")
      .query({ machineId })
      .set("Cookie", technician.cookies)
      .expect(200)
      .expect(({ body }) =>
        expect(body.files[0]).toMatchObject({
          state: "failed",
          failureCode: "unsupported_content",
        }),
      );

    const mismatch = await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", warehouse.cookies)
      .send({
        target: { type: "machine", id: machineId },
        purpose: "nameplate",
        originalFilename: "disguised.png",
        declaredMediaType: "image/png",
        declaredByteCount: 4,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/files/${mismatch.body.file.id}/upload-content`)
      .set("Cookie", warehouse.cookies)
      .set("x-file-grant", mismatch.body.grant.token)
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "disguised.png")
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("media_type_mismatch"));

    const expired = await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", warehouse.cookies)
      .send({
        target: { type: "machine", id: machineId },
        purpose: "nameplate",
        originalFilename: "expired.jpg",
        declaredMediaType: "image/jpeg",
        declaredByteCount: 4,
      })
      .expect(201);
    const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    await connection.database.execute(sql`
      update file_access_grant set expires_at = now() - interval '1 second'
      where file_id = ${expired.body.file.id}
    `);
    await request(app.getHttpServer())
      .post(`/files/${expired.body.file.id}/upload-content`)
      .set("Cookie", warehouse.cookies)
      .set("x-file-grant", expired.body.grant.token)
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "plate.jpg")
      .expect(403);
  });

  it("reviews and abandons expired incomplete objects without touching ready files", async () => {
    const app = await createApplication();
    const owner = await user(app, "owner_admin");
    const { loadId } = await foundation(app, owner.cookies);
    const pdf = Buffer.from("%PDF-1.4");
    const readyGrant = await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", owner.cookies)
      .send({
        target: { type: "load", id: loadId },
        purpose: "receipt",
        originalFilename: "ready-receipt.pdf",
        declaredMediaType: "application/pdf",
        declaredByteCount: pdf.length,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/files/${readyGrant.body.file.id}/upload-content`)
      .set("Cookie", owner.cookies)
      .set("x-file-grant", readyGrant.body.grant.token)
      .attach("file", pdf, "ready-receipt.pdf")
      .expect(201)
      .expect(({ body }) => expect(body.file.state).toBe("ready"));
    const pending = await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", owner.cookies)
      .send({
        target: { type: "load", id: loadId },
        purpose: "receipt",
        originalFilename: "receipt.pdf",
        declaredMediaType: "application/pdf",
        declaredByteCount: pdf.length,
      })
      .expect(201);
    const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    await request(app.getHttpServer())
      .post(`/files/${pending.body.file.id}/abandon`)
      .set("Cookie", owner.cookies)
      .expect(409);
    const privateRows = await connection.database.execute(sql`
      select storage_key from file_attachment where id = ${pending.body.file.id}
    `);
    const storageKey = resultRows<{ storage_key: string }>(privateRows)[0]!
      .storage_key;
    const readyRows = await connection.database.execute(sql`
      select storage_key from file_attachment where id = ${readyGrant.body.file.id}
    `);
    const readyStorageKey = resultRows<{ storage_key: string }>(readyRows)[0]!
      .storage_key;
    const storage = app.get<StorageAdapter>(STORAGE_ADAPTER);
    await storage.put(storageKey, pdf, {
      byteCount: pdf.length,
      mediaType: "application/pdf",
      sha256: "0".repeat(64),
    });
    await connection.database.execute(sql`
      update file_access_grant set expires_at = now() - interval '1 second'
      where file_id = ${pending.body.file.id}
    `);

    await request(app.getHttpServer())
      .get("/files/review/incomplete")
      .set("Cookie", owner.cookies)
      .expect(200)
      .expect(({ body }) => expect(body.files).toHaveLength(1));
    await request(app.getHttpServer())
      .post(`/files/${pending.body.file.id}/abandon`)
      .set("Cookie", owner.cookies)
      .expect(201)
      .expect(({ body }) => expect(body.file.state).toBe("abandoned"));
    await expect(storage.head(storageKey)).resolves.toBeUndefined();
    await request(app.getHttpServer())
      .post(`/files/${readyGrant.body.file.id}/abandon`)
      .set("Cookie", owner.cookies)
      .expect(409);
    await expect(storage.head(readyStorageKey)).resolves.toBeDefined();
  });

  it("does not let cleanup race an in-flight upload into ready metadata without bytes", async () => {
    const storage = new BlockingStorageAdapter();
    const app = await createApplication(storage);
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const { machineId } = await foundation(app, owner.cookies);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const granted = await request(app.getHttpServer())
      .post("/files/upload-grants")
      .set("Cookie", warehouse.cookies)
      .send({
        target: { type: "machine", id: machineId },
        purpose: "nameplate",
        originalFilename: "racing.jpg",
        declaredMediaType: "image/jpeg",
        declaredByteCount: bytes.length,
      })
      .expect(201);

    const upload = request(app.getHttpServer())
      .post(`/files/${granted.body.file.id}/upload-content`)
      .set("Cookie", warehouse.cookies)
      .set("x-file-grant", granted.body.grant.token)
      .attach("file", bytes, "racing.jpg")
      .then((response) => response);
    const startResult = await within(
      Promise.race([
        storage.putStarted.then(() => ({ kind: "started" as const })),
        upload.then((response) => ({
          kind: "response" as const,
          status: response.status,
        })),
      ]),
      "upload storage start",
    );
    expect(startResult).toEqual({ kind: "started" });
    const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    await connection.database.execute(sql`
      update file_attachment set upload_lease_expires_at = now() - interval '1 second'
      where id = ${granted.body.file.id}
    `);
    await expect(
      within(
        app.get(FilesService).abandon(granted.body.file.id, owner.identity, {
          actorUserId: owner.identity.id,
          sessionId: "not-used-by-cleanup",
          requestId: "cleanup-race",
        }),
        "abandon expired lease",
      ),
    ).resolves.toMatchObject({ state: "abandoned" });
    storage.release();
    expect((await within(upload, "upload completion")).status).toBe(409);

    await request(app.getHttpServer())
      .get("/files")
      .query({ machineId })
      .set("Cookie", owner.cookies)
      .expect(200)
      .expect(({ body }) => {
        expect(body.files[0].state).toBe("abandoned");
      });
  }, 15_000);
});
