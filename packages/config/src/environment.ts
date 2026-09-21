import { z } from "zod";

const booleanFromString = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((value) => value === "true"),
]);

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
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
}

export interface WebServerConfig {
  apiBaseUrl: string;
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

export function parseServerEnvironment(
  input: Record<string, string | undefined>,
): ServerConfig {
  const result = serverEnvironmentSchema.safeParse(input);
  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    databaseDriver: result.data.DATABASE_DRIVER,
    ...(result.data.DATABASE_URL
      ? { databaseUrl: result.data.DATABASE_URL }
      : {}),
    pgliteDataDir: result.data.PGLITE_DATA_DIR,
    allowPgliteInDeployed: result.data.ALLOW_PGLITE_IN_DEPLOYED,
    apiPort: result.data.API_PORT,
    logLevel: result.data.LOG_LEVEL,
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
