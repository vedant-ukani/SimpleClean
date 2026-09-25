import { parseServerEnvironment } from "@laundrorama/config";
import { createTestEnvironment } from "@laundrorama/test-support";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createDatabase, migrateDatabase } from "../src/index.js";

describe("database migrations", () => {
  it("runs explicitly against the configured database", async () => {
    await expect(
      migrateDatabase(parseServerEnvironment(createTestEnvironment())),
    ).resolves.toBeUndefined();
  });

  it("upgrades a populated pre-0015 database without violating the old production check", async () => {
    const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
    const oldFolder = await mkdtemp(join(tmpdir(), "laundrorama-pre-0015-"));
    const client = new PGlite();
    try {
      const journal = JSON.parse(
        await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
      ) as { entries: { idx: number; tag: string }[] };
      const previousEntries = journal.entries.filter((entry) => entry.idx < 15);
      await mkdir(join(oldFolder, "meta"));
      await writeFile(
        join(oldFolder, "meta", "_journal.json"),
        JSON.stringify({ ...journal, entries: previousEntries }),
      );
      await Promise.all(
        previousEntries.map((entry) =>
          copyFile(
            join(migrationsFolder, `${entry.tag}.sql`),
            join(oldFolder, `${entry.tag}.sql`),
          ),
        ),
      );
      const database = drizzlePglite(client);
      await migratePglite(database, { migrationsFolder: oldFolder });
      await database.execute(sql`
        insert into inventory_load (id, display_name)
        values ('upgrade-load', 'Existing load')
      `);
      await database.execute(sql`
        insert into inventory_machine (id, machine_type, source_load_id)
        values ('upgrade-machine', 'washer', 'upgrade-load')
      `);
      await migratePglite(database, { migrationsFolder });
      const result = await database.execute(sql`
        select production_state from inventory_machine
        where id = 'upgrade-machine'
      `);
      const rows = "rows" in result ? result.rows : result;
      expect(rows).toMatchObject([{ production_state: "not_assessed" }]);
    } finally {
      await client.close();
      await rm(oldFolder, { recursive: true, force: true });
    }
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
            ,'inventory_qr_label'
            ,'inventory_qr_label_activity'
          )
      `);
      const rows = "rows" in result ? result.rows : result;
      expect(rows).toHaveLength(26);
    } finally {
      await connection.close();
    }
  });

  it("enforces QR label identity, lifecycle, one-active, and immutable activity", async () => {
    const connection = createDatabase(
      parseServerEnvironment(createTestEnvironment()),
    );
    try {
      await connection.migrate();
      await connection.database.execute(sql`
        insert into "user" (id, name, email)
        values ('qr-user', 'QR User', 'qr-user@example.test')
      `);
      await connection.database.execute(sql`
        insert into inventory_load (id, display_name)
        values ('qr-load', 'QR fixture load')
      `);
      await connection.database.execute(sql`
        insert into inventory_machine (id, machine_type, source_load_id)
        values
          ('qr-machine-1', 'washer', 'qr-load'),
          ('qr-machine-2', 'dryer', 'qr-load')
      `);
      await connection.database.execute(sql`
        insert into inventory_qr_label (
          id, machine_id, fallback_code, issued_by_user_id
        ) values (
          '4498c172-93d8-4eca-b0f6-0e70fe03516c',
          'qr-machine-1',
          '0123456789ABCDEF',
          'qr-user'
        )
      `);

      await expect(
        connection.database.execute(sql`
          insert into inventory_qr_label (
            id, machine_id, fallback_code, issued_by_user_id
          ) values (
            '4598c172-93d8-4eca-b0f6-0e70fe03516c',
            'qr-machine-1',
            '12345678ABCDEFGH',
            'qr-user'
          )
        `),
      ).rejects.toThrow();
      await expect(
        connection.database.execute(sql`
          insert into inventory_qr_label (
            id, machine_id, fallback_code, issued_by_user_id
          ) values (
            '4698c172-93d8-4eca-b0f6-0e70fe03516c',
            'qr-machine-2',
            '0123456789ABCDEF',
            'qr-user'
          )
        `),
      ).rejects.toThrow();
      await expect(
        connection.database.execute(sql`
          update inventory_qr_label
          set fallback_code = '12345678ABCDEFGH', version = 2
          where id = '4498c172-93d8-4eca-b0f6-0e70fe03516c'
        `),
      ).rejects.toThrow();

      await connection.database.execute(sql`
        update inventory_qr_label
        set state = 'revoked', version = 2,
            revoked_by_user_id = 'qr-user', revoked_at = now()
        where id = '4498c172-93d8-4eca-b0f6-0e70fe03516c'
      `);
      await connection.database.execute(sql`
        insert into inventory_qr_label (
          id, machine_id, fallback_code, issued_by_user_id
        ) values (
          '4598c172-93d8-4eca-b0f6-0e70fe03516c',
          'qr-machine-1',
          '12345678ABCDEFGH',
          'qr-user'
        )
      `);
      await expect(
        connection.database.execute(sql`
          delete from inventory_qr_label
          where id = '4498c172-93d8-4eca-b0f6-0e70fe03516c'
        `),
      ).rejects.toThrow();
      await expect(
        connection.database.execute(sql`
          insert into inventory_qr_label_activity (
            id, label_id, machine_id, action, actor_user_id, request_id
          ) values (
            'activity-wrong-machine',
            '4598c172-93d8-4eca-b0f6-0e70fe03516c',
            'qr-machine-2',
            'resolved',
            'qr-user',
            'request-wrong-machine'
          )
        `),
      ).rejects.toThrow();
      await connection.database.execute(sql`
        insert into inventory_qr_label_activity (
          id, label_id, machine_id, action, actor_user_id, request_id
        ) values (
          'activity-1',
          '4598c172-93d8-4eca-b0f6-0e70fe03516c',
          'qr-machine-1',
          'printed',
          'qr-user',
          'request-1'
        )
      `);
      await expect(
        connection.database.execute(sql`
          update inventory_qr_label_activity
          set action = 'resolved'
          where id = 'activity-1'
        `),
      ).rejects.toThrow();

      await expect(
        connection.database.execute(sql`
          insert into operations_idempotency_record (
            id, scope, actor_user_id, key_hash, request_fingerprint,
            state, target_type, target_id, completed_at
          ) values (
            'qr-idempotency', 'inventory.qr_label.create', 'qr-user',
            repeat('a', 64), repeat('b', 64), 'completed', 'qr_label',
            '4598c172-93d8-4eca-b0f6-0e70fe03516c', now()
          )
        `),
      ).resolves.toBeDefined();
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
