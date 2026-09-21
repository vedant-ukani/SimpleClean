import { createTestEnvironment } from "@simply-clean/test-support";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseBootstrapEnvironment,
  parseServerEnvironment,
} from "../src/index.js";

describe("server environment", () => {
  it("uses PGlite safely for tests", () => {
    const config = parseServerEnvironment(
      createTestEnvironment({ DATABASE_URL: "" }),
    );
    expect(config.databaseDriver).toBe("pglite");
    expect(config.nodeEnv).toBe("test");
  });

  it("anchors relative local data paths to the npm workspace root", () => {
    const workspaceRoot = join("/", "tmp", "simply-clean-workspace");
    const config = parseServerEnvironment(
      createTestEnvironment({
        PGLITE_DATA_DIR: ".local-data/pglite",
        FILE_LOCAL_DIRECTORY: ".local-data/files",
        npm_config_local_prefix: workspaceRoot,
      }),
    );

    expect(config.pgliteDataDir).toBe(
      join(workspaceRoot, ".local-data/pglite"),
    );
    expect(config.fileLocalDirectory).toBe(
      join(workspaceRoot, ".local-data/files"),
    );
  });

  it("requires a URL for the PostgreSQL wire driver without exposing its value", () => {
    const secret = "postgres://user:super-secret@example.test/database";
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          DATABASE_DRIVER: "postgres",
          DATABASE_URL: undefined,
        }),
      ),
    ).toThrow("DATABASE_URL: is required");

    try {
      parseServerEnvironment(
        createTestEnvironment({
          DATABASE_DRIVER: "not-a-driver",
          DATABASE_URL: secret,
        }),
      );
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("rejects accidental PGlite use in deployed environments", () => {
    expect(() =>
      parseServerEnvironment(createTestEnvironment({ NODE_ENV: "production" })),
    ).toThrow("ALLOW_PGLITE_IN_DEPLOYED=true");
  });

  it("validates finite secure auth configuration", () => {
    const config = parseServerEnvironment(createTestEnvironment());
    expect(config.authSessionDurationSeconds).toBe(28_800);
    expect(config.authTrustedOrigin).toBe("http://localhost:3000");

    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({ AUTH_SECRET: "too-short" }),
      ),
    ).toThrow("AUTH_SECRET");
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({ AUTH_SESSION_DURATION_SECONDS: "0" }),
      ),
    ).toThrow("AUTH_SESSION_DURATION_SECONDS");
  });

  it("validates the dedicated QR signing secret and public origin", () => {
    const config = parseServerEnvironment(createTestEnvironment());
    expect(config.platformPublicOrigin).toBe("http://localhost:3000");
    expect(config.qrSigningSecret).not.toBe(config.authSecret);

    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({ QR_SIGNING_SECRET: "too-short" }),
      ),
    ).toThrow("QR_SIGNING_SECRET");
    const sharedSecret = "shared-secret-value-with-at-least-32-characters";
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          AUTH_SECRET: sharedSecret,
          QR_SIGNING_SECRET: sharedSecret,
        }),
      ),
    ).toThrow("distinct from AUTH_SECRET");
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          PLATFORM_PUBLIC_ORIGIN: "https://app.example.test/scan?token=bad",
        }),
      ),
    ).toThrow("must be an HTTP(S) origin");
  });

  it("requires an HTTPS public origin and high-entropy QR secret when deployed", () => {
    const deployed = {
      NODE_ENV: "production",
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "postgres://database.example/simply_clean",
      AUTH_SECRET: "unique-production-auth-secret-with-entropy-42!",
      AUTH_BASE_URL: "https://api.example.test",
      AUTH_TRUSTED_ORIGIN: "https://app.example.test",
      FILE_STORAGE_DRIVER: "local",
      ALLOW_LOCAL_FILE_STORAGE_IN_DEPLOYED: "true",
    };
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          ...deployed,
          PLATFORM_PUBLIC_ORIGIN: "http://app.example.test",
        }),
      ),
    ).toThrow("PLATFORM_PUBLIC_ORIGIN: must use HTTPS");
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          ...deployed,
          PLATFORM_PUBLIC_ORIGIN: "https://app.example.test",
          QR_SIGNING_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        }),
      ),
    ).toThrow("QR_SIGNING_SECRET: must be a high-entropy");
  });

  it("requires HTTPS auth URLs in deployed environments", () => {
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          NODE_ENV: "production",
          DATABASE_DRIVER: "postgres",
          DATABASE_URL: "postgres://database.example/simply_clean",
          AUTH_BASE_URL: "http://api.example.test",
          AUTH_TRUSTED_ORIGIN: "http://app.example.test",
        }),
      ),
    ).toThrow("HTTPS");

    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          NODE_ENV: "production",
          DATABASE_DRIVER: "postgres",
          DATABASE_URL: "postgres://database.example/simply_clean",
          AUTH_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          AUTH_BASE_URL: "https://api.example.test",
          AUTH_TRUSTED_ORIGIN: "https://app.example.test",
        }),
      ),
    ).toThrow("high-entropy");
  });

  it("validates private file storage configuration", () => {
    const config = parseServerEnvironment(createTestEnvironment());
    expect(config).toMatchObject({
      fileStorageDriver: "local",
      fileUploadGrantTtlSeconds: 300,
      fileDownloadGrantTtlSeconds: 60,
      fileMaxBytes: 15 * 1_024 * 1_024,
    });

    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          NODE_ENV: "production",
          DATABASE_DRIVER: "postgres",
          DATABASE_URL: "postgres://database.example/simply_clean",
          AUTH_SECRET: "unique-production-secret-with-entropy-42!",
          AUTH_BASE_URL: "https://api.example.test",
          AUTH_TRUSTED_ORIGIN: "https://app.example.test",
        }),
      ),
    ).toThrow("ALLOW_LOCAL_FILE_STORAGE_IN_DEPLOYED=true");

    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({ FILE_STORAGE_DRIVER: "s3" }),
      ),
    ).toThrow("FILE_S3_BUCKET");
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({ FILE_S3_ACCESS_KEY_ID: "only-one-half" }),
      ),
    ).toThrow("configured together");
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({ FILE_UPLOAD_GRANT_TTL_SECONDS: "5" }),
      ),
    ).toThrow("FILE_UPLOAD_GRANT_TTL_SECONDS");
  });

  it("validates bounded Operations worker settings and disables test polling", () => {
    const config = parseServerEnvironment(createTestEnvironment());
    expect(config).toMatchObject({
      operationsWorkerMaxAttempts: 5,
      operationsWorkerLeaseSeconds: 60,
      operationsWorkerPollMs: 1_000,
      operationsWorkerBackoffBaseMs: 1_000,
      operationsWorkerPollingEnabled: false,
    });
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({ OPERATIONS_WORKER_MAX_ATTEMPTS: "0" }),
      ),
    ).toThrow("OPERATIONS_WORKER_MAX_ATTEMPTS");
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({ OPERATIONS_WORKER_LEASE_SECONDS: "0" }),
      ),
    ).toThrow("OPERATIONS_WORKER_LEASE_SECONDS");
  });

  it("requires bootstrap credentials without including the password in errors", () => {
    const secretPassword = "a-secret-bootstrap-password";
    const environment = createTestEnvironment({
      AUTH_BOOTSTRAP_EMAIL: "owner@example.test",
      AUTH_BOOTSTRAP_NAME: "Pilot Owner",
      AUTH_BOOTSTRAP_PASSWORD: secretPassword,
      AUTH_BOOTSTRAP_ROLE: "owner_admin",
    });
    expect(parseBootstrapEnvironment(environment).bootstrap.role).toBe(
      "owner_admin",
    );

    try {
      parseBootstrapEnvironment({
        ...environment,
        AUTH_BOOTSTRAP_EMAIL: "not-an-email",
      });
    } catch (error) {
      expect(String(error)).not.toContain(secretPassword);
    }
  });
});
