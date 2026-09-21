import { parseServerEnvironment } from "@simply-clean/config";
import { createTestEnvironment } from "@simply-clean/test-support";
import { sql } from "drizzle-orm";
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
      const result = await connection.database.execute(sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'user',
            'session',
            'account',
            'verification',
            'identity_profile',
            'identity_security_activity',
            'inventory_load',
            'inventory_location',
            'inventory_machine',
            'machine_identity_evidence',
            'machine_identity_claim',
            'machine_identity_verification_history',
            'machine_location_history',
            'file_attachment',
            'file_access_grant',
            'file_activity'
            ,'operations_audit_entry'
            ,'platform_outbox_job'
            ,'operations_idempotency_record'
            ,'inventory_import_run'
            ,'inventory_import_row'
            ,'inventory_import_approval'
            ,'inventory_import_approval_row'
            ,'inventory_import_machine_mapping'
          )
      `);
      const rows = "rows" in result ? result.rows : result;
      expect(rows).toHaveLength(24);
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
