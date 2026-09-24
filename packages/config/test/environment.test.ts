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
    expect(config.intakeRecognitionSemanticModel).toBe("gpt-6-luna");
    expect(config.intakeRecognitionPolicyVersion).toBe(
      "intake-nameplate-policy-v4",
    );
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

  it("requires HTTPS recognition provider endpoints when deployed", () => {
    expect(
      parseServerEnvironment(
        createTestEnvironment({
          INTAKE_RECOGNITION_SEMANTIC_ENDPOINT: "http://semantic.local.test",
          INTAKE_RECOGNITION_VERIFIER_ENDPOINT: "http://verifier.local.test",
        }),
      ),
    ).toMatchObject({
      intakeRecognitionSemanticEndpoint: "http://semantic.local.test",
      intakeRecognitionVerifierEndpoint: "http://verifier.local.test",
    });
    const deployed = {
      NODE_ENV: "production",
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "postgres://database.example/simply_clean",
      AUTH_SECRET: "unique-production-auth-secret-with-entropy-42!",
      AUTH_BASE_URL: "https://api.example.test",
      AUTH_TRUSTED_ORIGIN: "https://app.example.test",
      PLATFORM_PUBLIC_ORIGIN: "https://app.example.test",
      QR_SIGNING_SECRET: "unique-production-qr-secret-with-entropy-42!",
      FILE_STORAGE_DRIVER: "local",
      ALLOW_LOCAL_FILE_STORAGE_IN_DEPLOYED: "true",
    };
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          ...deployed,
          INTAKE_RECOGNITION_SEMANTIC_ENDPOINT: "http://semantic.example.test",
        }),
      ),
    ).toThrow(
      "INTAKE_RECOGNITION_SEMANTIC_ENDPOINT: must use HTTPS in staging or production",
    );
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          ...deployed,
          INTAKE_RECOGNITION_VERIFIER_ENDPOINT: "http://verifier.example.test",
        }),
      ),
    ).toThrow(
      "INTAKE_RECOGNITION_VERIFIER_ENDPOINT: must use HTTPS in staging or production",
    );
    expect(
      parseServerEnvironment(
        createTestEnvironment({
          ...deployed,
          INTAKE_RECOGNITION_SEMANTIC_ENDPOINT: "https://semantic.example.test",
          INTAKE_RECOGNITION_VERIFIER_ENDPOINT: "https://verifier.example.test",
        }),
      ).intakeRecognitionSemanticEndpoint,
    ).toBe("https://semantic.example.test");
  });

  it("requires a Google Vision credential when the verifier is enabled", () => {
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          INTAKE_RECOGNITION_ENABLED: "true",
          INTAKE_RECOGNITION_SEMANTIC_PROVIDER: "fake",
          INTAKE_RECOGNITION_VERIFIER_PROVIDER: "google-vision",
          INTAKE_RECOGNITION_VERIFIER_ENDPOINT:
            "https://vision.example.test/annotate",
        }),
      ),
    ).toThrow("Google Vision verification");
    expect(
      parseServerEnvironment(
        createTestEnvironment({
          INTAKE_RECOGNITION_ENABLED: "true",
          INTAKE_RECOGNITION_SEMANTIC_PROVIDER: "fake",
          INTAKE_RECOGNITION_VERIFIER_PROVIDER: "google-vision",
          INTAKE_RECOGNITION_VERIFIER_ENDPOINT:
            "https://vision.example.test/annotate",
          INTAKE_RECOGNITION_VERIFIER_API_KEY: "test-key",
        }),
      ),
    ).toMatchObject({
      intakeRecognitionVerifierProvider: "google-vision",
      intakeRecognitionVerifierApiKey: "test-key",
    });
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
      operationsWorkerLeaseSeconds: 180,
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

  it("gives sequential Intake recognition providers enough bounded time", () => {
    expect(parseServerEnvironment(createTestEnvironment())).toMatchObject({
      intakeRecognitionTimeoutMs: 60_000,
    });
  });

  it("keeps Catalog discovery disabled by default and supports an explicit or fallback OpenAI key", () => {
    expect(parseServerEnvironment(createTestEnvironment())).toMatchObject({
      catalogDiscoveryEnabled: false,
      catalogDiscoveryProvider: "disabled",
      catalogDiscoveryPromptVersion: "catalog-discovery-prompt-v2",
      catalogDiscoverySchemaVersion: "catalog-discovery-schema-v1",
      catalogDiscoveryPolicyVersion: "automatic-official-source-policy-v2",
      catalogDiscoveryPricingVersion: "openai-gpt-6-luna-standard-2026-09-23",
      catalogDiscoveryInputUsdPerMillionTokens: 0.1,
      catalogDiscoveryOutputUsdPerMillionTokens: 0.5,
      catalogDiscoveryWebSearchUsdPerCall: 0.01,
    });
    expect(
      parseServerEnvironment(
        createTestEnvironment({
          CATALOG_DISCOVERY_ENABLED: "true",
          CATALOG_DISCOVERY_PROVIDER: "openai",
          INTAKE_RECOGNITION_SEMANTIC_API_KEY: "shared-openai-key",
        }),
      ),
    ).toMatchObject({
      catalogDiscoveryEnabled: true,
      catalogDiscoveryApiKey: "shared-openai-key",
    });
    expect(
      parseServerEnvironment(
        createTestEnvironment({
          CATALOG_DISCOVERY_ENABLED: "true",
          CATALOG_DISCOVERY_PROVIDER: "openai",
          CATALOG_DISCOVERY_API_KEY: "catalog-only-key",
          INTAKE_RECOGNITION_SEMANTIC_API_KEY: "shared-openai-key",
        }),
      ).catalogDiscoveryApiKey,
    ).toBe("catalog-only-key");
    expect(() =>
      parseServerEnvironment(
        createTestEnvironment({
          CATALOG_DISCOVERY_ENABLED: "true",
          CATALOG_DISCOVERY_PROVIDER: "openai",
          CATALOG_DISCOVERY_API_KEY: undefined,
          INTAKE_RECOGNITION_SEMANTIC_API_KEY: undefined,
        }),
      ),
    ).toThrow("Catalog discovery");
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
