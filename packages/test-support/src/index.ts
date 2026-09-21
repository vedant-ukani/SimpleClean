export function createTestEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: "test",
    DATABASE_DRIVER: "pglite",
    PGLITE_DATA_DIR: ":memory:",
    ALLOW_PGLITE_IN_DEPLOYED: "false",
    API_PORT: "3001",
    API_BASE_URL: "http://localhost:3001",
    LOG_LEVEL: "silent",
    AUTH_SECRET: "test-only-auth-secret-at-least-32-characters-long",
    AUTH_BASE_URL: "http://localhost:3001",
    AUTH_TRUSTED_ORIGIN: "http://localhost:3000",
    AUTH_SESSION_DURATION_SECONDS: "28800",
    FILE_STORAGE_DRIVER: "local",
    FILE_LOCAL_DIRECTORY: ".local-data/test-files",
    ALLOW_LOCAL_FILE_STORAGE_IN_DEPLOYED: "false",
    FILE_UPLOAD_GRANT_TTL_SECONDS: "300",
    FILE_DOWNLOAD_GRANT_TTL_SECONDS: "60",
    FILE_MAX_BYTES: "15728640",
    OPERATIONS_WORKER_MAX_ATTEMPTS: "5",
    OPERATIONS_WORKER_LEASE_SECONDS: "60",
    OPERATIONS_WORKER_POLL_MS: "1000",
    OPERATIONS_WORKER_BACKOFF_BASE_MS: "1000",
    OPERATIONS_WORKER_POLLING_ENABLED: "false",
    ...overrides,
  };
}
