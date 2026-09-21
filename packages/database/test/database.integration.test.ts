import { parseServerEnvironment } from "@simply-clean/config";
import { createTestEnvironment } from "@simply-clean/test-support";
import { describe, expect, it } from "vitest";

import { createDatabase, migrateDatabase } from "../src/index.js";

describe("database migrations", () => {
  it("runs explicitly against the configured database", async () => {
    await expect(
      migrateDatabase(parseServerEnvironment(createTestEnvironment())),
    ).resolves.toBeUndefined();
  });
});

describe("PGlite integration", () => {
  it("runs migrations and a readiness query in an isolated database", async () => {
    const connection = createDatabase(
      parseServerEnvironment(createTestEnvironment()),
    );
    try {
      await connection.migrate();
      await expect(connection.isReady()).resolves.toBe(true);
    } finally {
      await connection.close();
    }
  });
});

describe.runIf(process.env.RUN_POSTGRES_INTEGRATION === "true")(
  "PostgreSQL wire integration",
  () => {
    it("runs migrations and a readiness query through the wire driver", async () => {
      const connection = createDatabase(
        parseServerEnvironment({
          ...createTestEnvironment(),
          DATABASE_DRIVER: "postgres",
          DATABASE_URL: process.env.DATABASE_URL,
        }),
      );
      try {
        expect(connection.driver).toBe("postgres");
        await connection.migrate();
        await expect(connection.isReady()).resolves.toBe(true);
      } finally {
        await connection.close();
      }
    });
  },
);
