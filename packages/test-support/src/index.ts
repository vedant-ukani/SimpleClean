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
    ...overrides,
  };
}
