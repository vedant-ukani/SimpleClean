import type { CatalogSeedManifest } from "@laundrorama/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@laundrorama/database";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { CatalogRepository } from "../src/modules/catalog/catalog.repository.js";
import { FilesRepository } from "../src/modules/files/files.repository.js";
import type { MutationRecorder } from "../src/modules/operations/operations.ports.js";
import {
  OperationsRepository,
  type ClaimedJob,
} from "../src/modules/operations/operations.repository.js";

const now = new Date("2026-09-28T12:00:00.000Z");
const dialect = new PgDialect();
const recorder = {
  record: async () => ({ auditId: "audit", jobId: "job" }),
} as MutationRecorder;

function postgresCompatibleConnection(
  result: (query: string) => unknown = () => [],
): DatabaseConnection {
  const execute = async (statement: SQL): Promise<unknown> => {
    const compiled = dialect.sqlToQuery(statement);
    if (compiled.params.some((parameter) => parameter instanceof Date)) {
      throw new TypeError("PostgresJS cannot serialize a raw Date parameter");
    }
    return result(compiled.sql);
  };
  const transaction = async <T>(
    operation: (database: DatabaseExecutor) => Promise<T>,
  ): Promise<T> => operation({ execute });
  return {
    driver: "postgres",
    database: { execute },
    transaction,
  } as unknown as DatabaseConnection;
}

const fileRow = {
  id: "file-1",
  load_id: "load-1",
  machine_id: null,
  purpose: "intake_evidence",
  storage_key: "private/file-1",
  preview_storage_key: null,
  original_filename: "nameplate.jpg",
  declared_media_type: "image/jpeg",
  detected_media_type: null,
  declared_byte_count: 4,
  byte_count: null,
  sha256: null,
  uploader_user_id: "worker-1",
  state: "pending_upload",
  failure_code: null,
  version: 1,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
  preview_byte_count: null,
};
const context = {
  actorUserId: "worker-1",
  sessionId: "session-1",
  requestId: "request-1",
};

describe("PostgresJS raw timestamp parameters", () => {
  it("creates and consumes an Intake upload grant with timestamp parameters PostgresJS can encode", async () => {
    const connection = postgresCompatibleConnection((query) =>
      query.includes("insert into file_attachment") ? [fileRow] : [],
    );
    const files = new FilesRepository(connection, recorder);
    await expect(
      files.createPendingUpload({
        fileId: "file-1",
        storageKey: "private/file-1",
        tokenHash: "token-hash",
        expiresAt: now,
        context,
        request: {
          target: { type: "load", id: "load-1" },
          purpose: "intake_evidence",
          originalFilename: "nameplate.jpg",
          declaredMediaType: "image/jpeg",
          declaredByteCount: 4,
        },
      }),
    ).resolves.toMatchObject({ id: "file-1" });
    await expect(
      files.consumeGrant({
        fileId: "file-1",
        operation: "upload",
        tokenHash: "token-hash",
        actorUserId: "worker-1",
        sessionId: "session-1",
        uploadLeaseExpiresAt: now,
      }),
    ).resolves.toBeUndefined();
  });

  it("creates private download and preview grants with encodable expiration times", async () => {
    const files = new FilesRepository(postgresCompatibleConnection(), recorder);
    await expect(
      files.createDownloadGrant({
        fileId: "file-1",
        tokenHash: "download-token",
        expiresAt: now,
        context,
      }),
    ).resolves.toBeUndefined();
    await expect(
      files.createPreviewGrant({
        fileId: "file-1",
        tokenHash: "preview-token",
        expiresAt: now,
        context,
      }),
    ).resolves.toBeUndefined();
  });

  it("claims, delivers, retries, and dead letters jobs with encodable timestamps", async () => {
    const jobRow = {
      id: "job-1",
      event_type: "inventory.load.created",
      target_type: "load",
      target_id: "load-1",
      actor_kind: "system",
      actor_user_id: null,
      request_id: "request-1",
      safe_summary: { changedFields: ["state"], outcome: "created" },
      version: 2,
      attempt_count: 1,
    };
    let candidateState: "queued" | "processing" = "queued";
    const operations = new OperationsRepository(
      postgresCompatibleConnection((query) => {
        if (query.includes("select id, state, attempt_count")) {
          return [{ id: "job-1", state: candidateState, attempt_count: 1 }];
        }
        if (query.includes("state = 'processing'")) return [jobRow];
        return [];
      }),
    );
    const [claimed] = await operations.claim(now, 30, 3, 10);
    expect(claimed).toMatchObject({ id: "job-1" });
    await expect(operations.markDelivered(claimed!, now)).resolves.toBe(true);
    await expect(
      operations.markFailed(claimed!, {
        now,
        nextAvailableAt: new Date(now.getTime() + 60_000),
        maximumAttempts: 3,
        errorCode: "handler_failed",
      }),
    ).resolves.toBe(true);
    await expect(
      operations.markFailed(
        { ...claimed!, attemptCount: 3 } satisfies ClaimedJob,
        {
          now,
          nextAvailableAt: new Date(now.getTime() + 60_000),
          maximumAttempts: 3,
          errorCode: "handler_failed",
        },
      ),
    ).resolves.toBe(true);
    candidateState = "processing";
    await expect(operations.claim(now, 30, 1, 10)).resolves.toEqual([]);
  });

  it("imports catalog source and approved revision timestamps with encodable parameters", async () => {
    const repository = new CatalogRepository(
      postgresCompatibleConnection((query) =>
        query.includes("returning id") ? [{ id: "stored" }] : [],
      ),
      recorder,
    );
    const manifest: CatalogSeedManifest = {
      datasetId: "sample",
      snapshotDate: "2026-09-28",
      checksum: "a".repeat(64),
      manufacturers: [
        {
          id: "maker",
          name: "Maker",
          aliases: [],
          sources: [
            {
              id: "source",
              url: "https://example.test/source",
              title: "Official source",
              retrievedAt: now.toISOString(),
              documentRevision: null,
              checksum: "b".repeat(64),
            },
          ],
          models: [
            {
              id: "model",
              family: "Family",
              model: "Model",
              aliases: [],
              equipmentClass: "washer",
              serialRules: [],
              revision: {
                id: "revision",
                revision: 1,
                approvedAt: now.toISOString(),
                productionStartYear: null,
                productionEndYear: null,
                specs: {
                  widthIn: null,
                  depthIn: null,
                  heightIn: null,
                  weightLb: null,
                  capacityLb: null,
                  voltage: [],
                  phase: [],
                  fuel: [],
                  configuration: [],
                },
                evidence: [],
              },
            },
          ],
        },
      ],
    };
    await expect(repository.importManifest(manifest)).resolves.toMatchObject({
      imported: true,
      manufacturers: 1,
      models: 1,
    });
  });

  it("reserves a Catalog discovery lease with a timestamp PostgresJS can encode", async () => {
    const pricing = {
      version: "test",
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
      webSearchUsdPerCall: 0,
    };
    const runRow = {
      id: "run-1",
      status: "retryable_failure",
      normalized_manufacturer: "maker",
      normalized_model: "model",
      provider: "fake",
      provider_model: "fake-model",
      prompt_version: "test",
      schema_version: "test",
      policy_version: "test",
      revision_id: null,
      no_result_reason: null,
      usage: null,
      web_search_call_count: 0,
      pricing,
      estimated_cost_usd: 0,
      response_fingerprint: null,
      created_at: now.toISOString(),
      completed_at: null,
      lease_expires_at: null,
    };
    const repository = new CatalogRepository(
      postgresCompatibleConnection((query) => {
        if (query.includes("select * from catalog_discovery_run")) {
          return [runRow];
        }
        if (query.includes("update catalog_discovery_run")) {
          return [{ ...runRow, status: "running" }];
        }
        return [];
      }),
      recorder,
    );
    await expect(
      repository.reserveDiscoveryRun({
        dedupeKey: "maker:model",
        manufacturerId: "maker",
        normalizedManufacturer: "maker",
        normalizedModel: "model",
        provider: "fake",
        model: "fake-model",
        promptVersion: "test",
        schemaVersion: "test",
        policyVersion: "test",
        pricing,
        requestId: "request-1",
        leaseMs: 60_000,
      }),
    ).resolves.toMatchObject({ claimToken: expect.any(String) });
  });
});
