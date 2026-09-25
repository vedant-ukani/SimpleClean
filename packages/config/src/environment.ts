import {
  ApplicationRoleSchema,
  type ApplicationRole,
} from "@laundrorama/contracts";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

const booleanFromString = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((value) => value === "true"),
]);

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalBoundedNumber = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().min(minimum).max(maximum).optional(),
  );

const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
    DATABASE_DRIVER: z.enum(["pglite", "postgres"]).default("pglite"),
    DATABASE_URL: optionalNonEmptyString,
    PGLITE_DATA_DIR: z.string().min(1).default(".local-data/pglite"),
    ALLOW_PGLITE_IN_DEPLOYED: booleanFromString.default(false),
    API_PORT: z.coerce.number().int().positive().max(65_535).default(3001),
    LOG_LEVEL: z
      .enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    AUTH_SECRET: z.string().min(32),
    AUTH_BASE_URL: z.url().default("http://localhost:3001"),
    AUTH_TRUSTED_ORIGIN: z.url().default("http://localhost:3000"),
    AUTH_SESSION_DURATION_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(86_400)
      .default(28_800),
    QR_SIGNING_SECRET: z.string().min(32),
    PLATFORM_PUBLIC_ORIGIN: z.url().default("http://localhost:3000"),
    FILE_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    FILE_LOCAL_DIRECTORY: z.string().min(1).default(".local-data/files"),
    ALLOW_LOCAL_FILE_STORAGE_IN_DEPLOYED: booleanFromString.default(false),
    FILE_S3_BUCKET: optionalNonEmptyString,
    FILE_S3_REGION: optionalNonEmptyString,
    FILE_S3_ENDPOINT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url().optional(),
    ),
    FILE_S3_FORCE_PATH_STYLE: booleanFromString.default(false),
    FILE_S3_ACCESS_KEY_ID: optionalNonEmptyString,
    FILE_S3_SECRET_ACCESS_KEY: optionalNonEmptyString,
    FILE_UPLOAD_GRANT_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(900)
      .default(300),
    FILE_DOWNLOAD_GRANT_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(15)
      .max(300)
      .default(60),
    FILE_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(100 * 1_024 * 1_024)
      .default(15 * 1_024 * 1_024),
    FILE_VIDEO_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(100 * 1_024 * 1_024)
      .default(100 * 1_024 * 1_024),
    OPERATIONS_WORKER_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5),
    OPERATIONS_WORKER_LEASE_SECONDS: z.coerce
      .number()
      .int()
      .min(5)
      .max(900)
      .default(180),
    OPERATIONS_WORKER_POLL_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60_000)
      .default(1_000),
    OPERATIONS_WORKER_BACKOFF_BASE_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(300_000)
      .default(1_000),
    OPERATIONS_WORKER_POLLING_ENABLED: booleanFromString.optional(),
    INTAKE_RECOGNITION_ENABLED: booleanFromString.default(false),
    INTAKE_RECOGNITION_SEMANTIC_PROVIDER: z
      .enum(["fake", "openai", "gemini", "disabled"])
      .default("disabled"),
    INTAKE_RECOGNITION_SEMANTIC_MODEL: z
      .string()
      .min(1)
      .max(120)
      .default("gpt-6-luna"),
    INTAKE_RECOGNITION_SEMANTIC_ENDPOINT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url().optional(),
    ),
    INTAKE_RECOGNITION_SEMANTIC_API_KEY: optionalNonEmptyString,
    INTAKE_RECOGNITION_VERIFIER_PROVIDER: z
      .enum(["fake", "paddleocr", "google-vision", "disabled"])
      .default("disabled"),
    INTAKE_RECOGNITION_VERIFIER_MODEL: z
      .string()
      .min(1)
      .max(120)
      .default("paddleocr"),
    INTAKE_RECOGNITION_VERIFIER_ENDPOINT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url().optional(),
    ),
    INTAKE_RECOGNITION_VERIFIER_API_KEY: optionalNonEmptyString,
    INTAKE_RECOGNITION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(60_000),
    INTAKE_RECOGNITION_MAX_IMAGE_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(25 * 1_024 * 1_024)
      .default(8 * 1_024 * 1_024),
    INTAKE_RECOGNITION_MAX_BATCH_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(200 * 1_024 * 1_024)
      .default(40 * 1_024 * 1_024),
    INTAKE_RECOGNITION_MAX_PIXELS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(100_000_000)
      .default(20_000_000),
    INTAKE_RECOGNITION_MAX_OUTPUT_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(20 * 1_024 * 1_024)
      .default(2 * 1_024 * 1_024),
    INTAKE_RECOGNITION_POLICY_VERSION: z
      .string()
      .min(1)
      .max(120)
      .default("intake-nameplate-policy-v4"),
    INTAKE_RECOGNITION_GROUP_FLOOR: optionalBoundedNumber(0, 1),
    INTAKE_RECOGNITION_FIELD_FLOOR: optionalBoundedNumber(0, 1),
    INTAKE_RECOGNITION_OCR_FLOOR: optionalBoundedNumber(0, 1),
    CATALOG_DISCOVERY_ENABLED: booleanFromString.default(false),
    CATALOG_DISCOVERY_PROVIDER: z
      .enum(["fake", "openai", "disabled"])
      .default("disabled"),
    CATALOG_DISCOVERY_MODEL: z.string().min(1).max(120).default("gpt-6-luna"),
    CATALOG_DISCOVERY_ENDPOINT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url().optional(),
    ),
    CATALOG_DISCOVERY_API_KEY: optionalNonEmptyString,
    CATALOG_DISCOVERY_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(60_000),
    CATALOG_DISCOVERY_MAX_OUTPUT_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(20 * 1_024 * 1_024)
      .default(1_048_576),
    CATALOG_DISCOVERY_PROMPT_VERSION: z
      .string()
      .min(1)
      .max(120)
      .default("catalog-discovery-prompt-v2"),
    CATALOG_DISCOVERY_SCHEMA_VERSION: z
      .string()
      .min(1)
      .max(120)
      .default("catalog-discovery-schema-v1"),
    CATALOG_DISCOVERY_POLICY_VERSION: z
      .string()
      .min(1)
      .max(120)
      .default("automatic-official-source-policy-v2"),
    CATALOG_DISCOVERY_PRICING_VERSION: z
      .string()
      .min(1)
      .max(120)
      .default("openai-gpt-6-luna-standard-2026-09-23"),
    CATALOG_DISCOVERY_INPUT_USD_PER_MILLION_TOKENS: z.coerce
      .number()
      .min(0)
      .max(10_000)
      .default(0.1),
    CATALOG_DISCOVERY_OUTPUT_USD_PER_MILLION_TOKENS: z.coerce
      .number()
      .min(0)
      .max(10_000)
      .default(0.5),
    CATALOG_DISCOVERY_WEB_SEARCH_USD_PER_CALL: z.coerce
      .number()
      .min(0)
      .max(10_000)
      .default(0.01),
  })
  .superRefine((environment, context) => {
    if (
      environment.DATABASE_DRIVER === "postgres" &&
      !environment.DATABASE_URL
    ) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "is required when DATABASE_DRIVER is postgres",
      });
    }

    const isDeployed =
      environment.NODE_ENV === "staging" ||
      environment.NODE_ENV === "production";
    if (isDeployed && environment.INTAKE_RECOGNITION_ENABLED) {
      if (["fake"].includes(environment.INTAKE_RECOGNITION_SEMANTIC_PROVIDER)) {
        context.addIssue({
          code: "custom",
          path: ["INTAKE_RECOGNITION_SEMANTIC_PROVIDER"],
          message: "fake providers are not allowed in deployed environments",
        });
      }
      if (["fake"].includes(environment.INTAKE_RECOGNITION_VERIFIER_PROVIDER)) {
        context.addIssue({
          code: "custom",
          path: ["INTAKE_RECOGNITION_VERIFIER_PROVIDER"],
          message: "fake providers are not allowed in deployed environments",
        });
      }
    }
    if (
      isDeployed &&
      environment.CATALOG_DISCOVERY_ENABLED &&
      environment.CATALOG_DISCOVERY_PROVIDER === "fake"
    ) {
      context.addIssue({
        code: "custom",
        path: ["CATALOG_DISCOVERY_PROVIDER"],
        message: "fake providers are not allowed in deployed environments",
      });
    }
    if (isDeployed) {
      for (const key of [
        "INTAKE_RECOGNITION_SEMANTIC_ENDPOINT",
        "INTAKE_RECOGNITION_VERIFIER_ENDPOINT",
        "CATALOG_DISCOVERY_ENDPOINT",
      ] as const) {
        const endpoint = environment[key];
        if (endpoint && !endpoint.startsWith("https://")) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "must use HTTPS in staging or production",
          });
        }
      }
    }
    if (
      environment.CATALOG_DISCOVERY_ENABLED &&
      environment.CATALOG_DISCOVERY_PROVIDER === "disabled"
    ) {
      context.addIssue({
        code: "custom",
        path: ["CATALOG_DISCOVERY_PROVIDER"],
        message: "is required when Catalog discovery is enabled",
      });
    }
    if (
      environment.CATALOG_DISCOVERY_ENABLED &&
      environment.CATALOG_DISCOVERY_PROVIDER === "openai" &&
      !environment.CATALOG_DISCOVERY_API_KEY &&
      !environment.INTAKE_RECOGNITION_SEMANTIC_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: ["CATALOG_DISCOVERY_API_KEY"],
        message:
          "is required for OpenAI Catalog discovery when no Intake OpenAI key is configured",
      });
    }
    if (
      environment.INTAKE_RECOGNITION_ENABLED &&
      environment.INTAKE_RECOGNITION_SEMANTIC_PROVIDER === "disabled"
    ) {
      context.addIssue({
        code: "custom",
        path: ["INTAKE_RECOGNITION_SEMANTIC_PROVIDER"],
        message: "is required when intake recognition is enabled",
      });
    }
    if (
      environment.INTAKE_RECOGNITION_ENABLED &&
      environment.INTAKE_RECOGNITION_VERIFIER_PROVIDER === "disabled"
    ) {
      context.addIssue({
        code: "custom",
        path: ["INTAKE_RECOGNITION_VERIFIER_PROVIDER"],
        message: "is required when intake recognition is enabled",
      });
    }
    if (
      environment.INTAKE_RECOGNITION_ENABLED &&
      environment.INTAKE_RECOGNITION_SEMANTIC_PROVIDER === "openai" &&
      !environment.INTAKE_RECOGNITION_SEMANTIC_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: ["INTAKE_RECOGNITION_SEMANTIC_API_KEY"],
        message: "is required when OpenAI semantic recognition is enabled",
      });
    }
    if (
      environment.INTAKE_RECOGNITION_ENABLED &&
      environment.INTAKE_RECOGNITION_SEMANTIC_PROVIDER === "gemini" &&
      !environment.INTAKE_RECOGNITION_SEMANTIC_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: ["INTAKE_RECOGNITION_SEMANTIC_API_KEY"],
        message: "is required when Gemini semantic recognition is enabled",
      });
    }
    if (
      environment.INTAKE_RECOGNITION_ENABLED &&
      ["paddleocr", "google-vision"].includes(
        environment.INTAKE_RECOGNITION_VERIFIER_PROVIDER,
      ) &&
      !environment.INTAKE_RECOGNITION_VERIFIER_ENDPOINT
    ) {
      context.addIssue({
        code: "custom",
        path: ["INTAKE_RECOGNITION_VERIFIER_ENDPOINT"],
        message: "is required when OCR verification is enabled",
      });
    }
    if (
      environment.INTAKE_RECOGNITION_ENABLED &&
      environment.INTAKE_RECOGNITION_VERIFIER_PROVIDER === "google-vision" &&
      !environment.INTAKE_RECOGNITION_VERIFIER_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: ["INTAKE_RECOGNITION_VERIFIER_API_KEY"],
        message: "is required when Google Vision verification is enabled",
      });
    }
    if (
      isDeployed &&
      environment.DATABASE_DRIVER === "pglite" &&
      !environment.ALLOW_PGLITE_IN_DEPLOYED
    ) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_DRIVER"],
        message:
          "pglite in staging or production requires ALLOW_PGLITE_IN_DEPLOYED=true",
      });
    }

    if (
      isDeployed &&
      environment.FILE_STORAGE_DRIVER === "local" &&
      !environment.ALLOW_LOCAL_FILE_STORAGE_IN_DEPLOYED
    ) {
      context.addIssue({
        code: "custom",
        path: ["FILE_STORAGE_DRIVER"],
        message:
          "local file storage in staging or production requires ALLOW_LOCAL_FILE_STORAGE_IN_DEPLOYED=true",
      });
    }

    if (environment.FILE_STORAGE_DRIVER === "s3") {
      if (!environment.FILE_S3_BUCKET) {
        context.addIssue({
          code: "custom",
          path: ["FILE_S3_BUCKET"],
          message: "is required when FILE_STORAGE_DRIVER is s3",
        });
      }
      if (!environment.FILE_S3_REGION) {
        context.addIssue({
          code: "custom",
          path: ["FILE_S3_REGION"],
          message: "is required when FILE_STORAGE_DRIVER is s3",
        });
      }
    }

    if (
      Boolean(environment.FILE_S3_ACCESS_KEY_ID) !==
      Boolean(environment.FILE_S3_SECRET_ACCESS_KEY)
    ) {
      context.addIssue({
        code: "custom",
        path: ["FILE_S3_ACCESS_KEY_ID"],
        message:
          "explicit S3 access key and secret must be configured together",
      });
    }

    if (environment.QR_SIGNING_SECRET === environment.AUTH_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["QR_SIGNING_SECRET"],
        message: "must be distinct from AUTH_SECRET",
      });
    }

    const publicOrigin = new URL(environment.PLATFORM_PUBLIC_ORIGIN);
    if (
      !["http:", "https:"].includes(publicOrigin.protocol) ||
      publicOrigin.username !== "" ||
      publicOrigin.password !== "" ||
      publicOrigin.pathname !== "/" ||
      publicOrigin.search !== "" ||
      publicOrigin.hash !== ""
    ) {
      context.addIssue({
        code: "custom",
        path: ["PLATFORM_PUBLIC_ORIGIN"],
        message:
          "must be an HTTP(S) origin without credentials, path, query, or fragment",
      });
    }

    if (isDeployed) {
      if (
        /change-me|replace-me|test-only/i.test(environment.AUTH_SECRET) ||
        new Set(environment.AUTH_SECRET).size < 10
      ) {
        context.addIssue({
          code: "custom",
          path: ["AUTH_SECRET"],
          message: "must be a high-entropy deployed secret",
        });
      }
      for (const key of ["AUTH_BASE_URL", "AUTH_TRUSTED_ORIGIN"] as const) {
        if (!environment[key].startsWith("https://")) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "must use HTTPS in staging or production",
          });
        }
      }
      if (
        /change-me|replace-me|test-only/i.test(environment.QR_SIGNING_SECRET) ||
        new Set(environment.QR_SIGNING_SECRET).size < 10
      ) {
        context.addIssue({
          code: "custom",
          path: ["QR_SIGNING_SECRET"],
          message: "must be a high-entropy deployed secret",
        });
      }
      if (publicOrigin.protocol !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["PLATFORM_PUBLIC_ORIGIN"],
          message: "must use HTTPS in staging or production",
        });
      }
    }
  });

const bootstrapEnvironmentSchema = z.object({
  AUTH_BOOTSTRAP_EMAIL: z.email(),
  AUTH_BOOTSTRAP_NAME: z.string().trim().min(1).max(120),
  AUTH_BOOTSTRAP_PASSWORD: z.string().min(8).max(128),
  AUTH_BOOTSTRAP_ROLE: ApplicationRoleSchema.default("owner_admin"),
});

const webServerEnvironmentSchema = z.object({
  API_BASE_URL: z.url().default("http://localhost:3001"),
});

export interface ServerConfig {
  nodeEnv: "development" | "test" | "staging" | "production";
  databaseDriver: "pglite" | "postgres";
  databaseUrl?: string;
  pgliteDataDir: string;
  allowPgliteInDeployed: boolean;
  apiPort: number;
  logLevel: "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  authSecret: string;
  authBaseUrl: string;
  authTrustedOrigin: string;
  authSessionDurationSeconds: number;
  qrSigningSecret: string;
  platformPublicOrigin: string;
  fileStorageDriver: "local" | "s3";
  fileLocalDirectory: string;
  allowLocalFileStorageInDeployed: boolean;
  fileS3Bucket?: string;
  fileS3Region?: string;
  fileS3Endpoint?: string;
  fileS3ForcePathStyle: boolean;
  fileS3AccessKeyId?: string;
  fileS3SecretAccessKey?: string;
  fileUploadGrantTtlSeconds: number;
  fileDownloadGrantTtlSeconds: number;
  fileMaxBytes: number;
  fileVideoMaxBytes: number;
  operationsWorkerMaxAttempts: number;
  operationsWorkerLeaseSeconds: number;
  operationsWorkerPollMs: number;
  operationsWorkerBackoffBaseMs: number;
  operationsWorkerPollingEnabled: boolean;
  intakeRecognitionEnabled: boolean;
  intakeRecognitionSemanticProvider: "fake" | "openai" | "gemini" | "disabled";
  intakeRecognitionSemanticModel: string;
  intakeRecognitionSemanticEndpoint?: string;
  intakeRecognitionSemanticApiKey?: string;
  intakeRecognitionVerifierProvider:
    "fake" | "paddleocr" | "google-vision" | "disabled";
  intakeRecognitionVerifierModel: string;
  intakeRecognitionVerifierEndpoint?: string;
  intakeRecognitionVerifierApiKey?: string;
  intakeRecognitionTimeoutMs: number;
  intakeRecognitionMaxImageBytes: number;
  intakeRecognitionMaxBatchBytes: number;
  intakeRecognitionMaxPixels: number;
  intakeRecognitionMaxOutputBytes: number;
  intakeRecognitionPolicyVersion: string;
  intakeRecognitionGroupFloor?: number;
  intakeRecognitionFieldFloor?: number;
  intakeRecognitionOcrFloor?: number;
  catalogDiscoveryEnabled: boolean;
  catalogDiscoveryProvider: "fake" | "openai" | "disabled";
  catalogDiscoveryModel: string;
  catalogDiscoveryEndpoint?: string;
  catalogDiscoveryApiKey?: string;
  catalogDiscoveryTimeoutMs: number;
  catalogDiscoveryMaxOutputBytes: number;
  catalogDiscoveryPromptVersion: string;
  catalogDiscoverySchemaVersion: string;
  catalogDiscoveryPolicyVersion: string;
  catalogDiscoveryPricingVersion: string;
  catalogDiscoveryInputUsdPerMillionTokens: number;
  catalogDiscoveryOutputUsdPerMillionTokens: number;
  catalogDiscoveryWebSearchUsdPerCall: number;
}

export interface WebServerConfig {
  apiBaseUrl: string;
}

export interface BootstrapConfig {
  email: string;
  name: string;
  password: string;
  role: ApplicationRole;
}

export class EnvironmentValidationError extends Error {
  constructor(issues: readonly z.core.$ZodIssue[]) {
    const details = issues.map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    );
    super(`Invalid environment configuration: ${details.join("; ")}`);
    this.name = "EnvironmentValidationError";
  }
}

function resolveLocalWorkspacePath(
  value: string,
  input: Record<string, string | undefined>,
): string {
  if (value === ":memory:" || isAbsolute(value)) return value;

  const workspaceRoot = input.npm_config_local_prefix?.trim();
  return workspaceRoot ? resolve(workspaceRoot, value) : value;
}

export function parseServerEnvironment(
  input: Record<string, string | undefined>,
): ServerConfig {
  const result = serverEnvironmentSchema.safeParse(input);
  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }
  const catalogDiscoveryApiKey =
    result.data.CATALOG_DISCOVERY_API_KEY ??
    result.data.INTAKE_RECOGNITION_SEMANTIC_API_KEY;

  return {
    nodeEnv: result.data.NODE_ENV,
    databaseDriver: result.data.DATABASE_DRIVER,
    ...(result.data.DATABASE_URL
      ? { databaseUrl: result.data.DATABASE_URL }
      : {}),
    pgliteDataDir: resolveLocalWorkspacePath(
      result.data.PGLITE_DATA_DIR,
      input,
    ),
    allowPgliteInDeployed: result.data.ALLOW_PGLITE_IN_DEPLOYED,
    apiPort: result.data.API_PORT,
    logLevel: result.data.LOG_LEVEL,
    authSecret: result.data.AUTH_SECRET,
    authBaseUrl: result.data.AUTH_BASE_URL,
    authTrustedOrigin: result.data.AUTH_TRUSTED_ORIGIN,
    authSessionDurationSeconds: result.data.AUTH_SESSION_DURATION_SECONDS,
    qrSigningSecret: result.data.QR_SIGNING_SECRET,
    platformPublicOrigin: new URL(result.data.PLATFORM_PUBLIC_ORIGIN).origin,
    fileStorageDriver: result.data.FILE_STORAGE_DRIVER,
    fileLocalDirectory: resolveLocalWorkspacePath(
      result.data.FILE_LOCAL_DIRECTORY,
      input,
    ),
    allowLocalFileStorageInDeployed:
      result.data.ALLOW_LOCAL_FILE_STORAGE_IN_DEPLOYED,
    ...(result.data.FILE_S3_BUCKET
      ? { fileS3Bucket: result.data.FILE_S3_BUCKET }
      : {}),
    ...(result.data.FILE_S3_REGION
      ? { fileS3Region: result.data.FILE_S3_REGION }
      : {}),
    ...(result.data.FILE_S3_ENDPOINT
      ? { fileS3Endpoint: result.data.FILE_S3_ENDPOINT }
      : {}),
    fileS3ForcePathStyle: result.data.FILE_S3_FORCE_PATH_STYLE,
    ...(result.data.FILE_S3_ACCESS_KEY_ID
      ? { fileS3AccessKeyId: result.data.FILE_S3_ACCESS_KEY_ID }
      : {}),
    ...(result.data.FILE_S3_SECRET_ACCESS_KEY
      ? { fileS3SecretAccessKey: result.data.FILE_S3_SECRET_ACCESS_KEY }
      : {}),
    fileUploadGrantTtlSeconds: result.data.FILE_UPLOAD_GRANT_TTL_SECONDS,
    fileDownloadGrantTtlSeconds: result.data.FILE_DOWNLOAD_GRANT_TTL_SECONDS,
    fileMaxBytes: result.data.FILE_MAX_BYTES,
    fileVideoMaxBytes: result.data.FILE_VIDEO_MAX_BYTES,
    operationsWorkerMaxAttempts: result.data.OPERATIONS_WORKER_MAX_ATTEMPTS,
    operationsWorkerLeaseSeconds: result.data.OPERATIONS_WORKER_LEASE_SECONDS,
    operationsWorkerPollMs: result.data.OPERATIONS_WORKER_POLL_MS,
    operationsWorkerBackoffBaseMs:
      result.data.OPERATIONS_WORKER_BACKOFF_BASE_MS,
    operationsWorkerPollingEnabled:
      result.data.OPERATIONS_WORKER_POLLING_ENABLED ??
      result.data.NODE_ENV !== "test",
    intakeRecognitionEnabled: result.data.INTAKE_RECOGNITION_ENABLED,
    intakeRecognitionSemanticProvider:
      result.data.INTAKE_RECOGNITION_SEMANTIC_PROVIDER,
    intakeRecognitionSemanticModel:
      result.data.INTAKE_RECOGNITION_SEMANTIC_MODEL,
    ...(result.data.INTAKE_RECOGNITION_SEMANTIC_ENDPOINT
      ? {
          intakeRecognitionSemanticEndpoint:
            result.data.INTAKE_RECOGNITION_SEMANTIC_ENDPOINT,
        }
      : {}),
    ...(result.data.INTAKE_RECOGNITION_SEMANTIC_API_KEY
      ? {
          intakeRecognitionSemanticApiKey:
            result.data.INTAKE_RECOGNITION_SEMANTIC_API_KEY,
        }
      : {}),
    intakeRecognitionVerifierProvider:
      result.data.INTAKE_RECOGNITION_VERIFIER_PROVIDER,
    intakeRecognitionVerifierModel:
      result.data.INTAKE_RECOGNITION_VERIFIER_MODEL,
    ...(result.data.INTAKE_RECOGNITION_VERIFIER_ENDPOINT
      ? {
          intakeRecognitionVerifierEndpoint:
            result.data.INTAKE_RECOGNITION_VERIFIER_ENDPOINT,
        }
      : {}),
    ...(result.data.INTAKE_RECOGNITION_VERIFIER_API_KEY
      ? {
          intakeRecognitionVerifierApiKey:
            result.data.INTAKE_RECOGNITION_VERIFIER_API_KEY,
        }
      : {}),
    intakeRecognitionTimeoutMs: result.data.INTAKE_RECOGNITION_TIMEOUT_MS,
    intakeRecognitionMaxImageBytes:
      result.data.INTAKE_RECOGNITION_MAX_IMAGE_BYTES,
    intakeRecognitionMaxBatchBytes:
      result.data.INTAKE_RECOGNITION_MAX_BATCH_BYTES,
    intakeRecognitionMaxPixels: result.data.INTAKE_RECOGNITION_MAX_PIXELS,
    intakeRecognitionMaxOutputBytes:
      result.data.INTAKE_RECOGNITION_MAX_OUTPUT_BYTES,
    intakeRecognitionPolicyVersion:
      result.data.INTAKE_RECOGNITION_POLICY_VERSION,
    ...(result.data.INTAKE_RECOGNITION_GROUP_FLOOR === undefined
      ? {}
      : {
          intakeRecognitionGroupFloor:
            result.data.INTAKE_RECOGNITION_GROUP_FLOOR,
        }),
    ...(result.data.INTAKE_RECOGNITION_FIELD_FLOOR === undefined
      ? {}
      : {
          intakeRecognitionFieldFloor:
            result.data.INTAKE_RECOGNITION_FIELD_FLOOR,
        }),
    ...(result.data.INTAKE_RECOGNITION_OCR_FLOOR === undefined
      ? {}
      : {
          intakeRecognitionOcrFloor: result.data.INTAKE_RECOGNITION_OCR_FLOOR,
        }),
    catalogDiscoveryEnabled: result.data.CATALOG_DISCOVERY_ENABLED,
    catalogDiscoveryProvider: result.data.CATALOG_DISCOVERY_PROVIDER,
    catalogDiscoveryModel: result.data.CATALOG_DISCOVERY_MODEL,
    ...(result.data.CATALOG_DISCOVERY_ENDPOINT
      ? { catalogDiscoveryEndpoint: result.data.CATALOG_DISCOVERY_ENDPOINT }
      : {}),
    ...(catalogDiscoveryApiKey
      ? {
          catalogDiscoveryApiKey,
        }
      : {}),
    catalogDiscoveryTimeoutMs: result.data.CATALOG_DISCOVERY_TIMEOUT_MS,
    catalogDiscoveryMaxOutputBytes:
      result.data.CATALOG_DISCOVERY_MAX_OUTPUT_BYTES,
    catalogDiscoveryPromptVersion: result.data.CATALOG_DISCOVERY_PROMPT_VERSION,
    catalogDiscoverySchemaVersion: result.data.CATALOG_DISCOVERY_SCHEMA_VERSION,
    catalogDiscoveryPolicyVersion: result.data.CATALOG_DISCOVERY_POLICY_VERSION,
    catalogDiscoveryPricingVersion:
      result.data.CATALOG_DISCOVERY_PRICING_VERSION,
    catalogDiscoveryInputUsdPerMillionTokens:
      result.data.CATALOG_DISCOVERY_INPUT_USD_PER_MILLION_TOKENS,
    catalogDiscoveryOutputUsdPerMillionTokens:
      result.data.CATALOG_DISCOVERY_OUTPUT_USD_PER_MILLION_TOKENS,
    catalogDiscoveryWebSearchUsdPerCall:
      result.data.CATALOG_DISCOVERY_WEB_SEARCH_USD_PER_CALL,
  };
}

export function parseBootstrapEnvironment(
  input: Record<string, string | undefined>,
): { server: ServerConfig; bootstrap: BootstrapConfig } {
  const server = parseServerEnvironment(input);
  const result = bootstrapEnvironmentSchema.safeParse(input);
  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }
  return {
    server,
    bootstrap: {
      email: result.data.AUTH_BOOTSTRAP_EMAIL.toLowerCase(),
      name: result.data.AUTH_BOOTSTRAP_NAME,
      password: result.data.AUTH_BOOTSTRAP_PASSWORD,
      role: result.data.AUTH_BOOTSTRAP_ROLE,
    },
  };
}

export function parseWebServerEnvironment(
  input: Record<string, string | undefined>,
): WebServerConfig {
  const result = webServerEnvironmentSchema.safeParse(input);
  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }
  return { apiBaseUrl: result.data.API_BASE_URL };
}
