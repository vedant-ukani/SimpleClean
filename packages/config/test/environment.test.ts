import { createTestEnvironment } from "@simply-clean/test-support";
import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "../src/index.js";

describe("server environment", () => {
  it("uses PGlite safely for tests", () => {
    const config = parseServerEnvironment(
      createTestEnvironment({ DATABASE_URL: "" }),
    );
    expect(config.databaseDriver).toBe("pglite");
    expect(config.nodeEnv).toBe("test");
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
});
