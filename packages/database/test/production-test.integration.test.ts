import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return result && typeof result === "object" && "rows" in result
    ? rows(result.rows)
    : [];
}

describe("Production Test migration", () => {
  it("backfills one queued order, pins both approved templates, and protects immutable results", async () => {
    const folder = fileURLToPath(new URL("../drizzle", import.meta.url));
    const oldFolder = await mkdtemp(join(tmpdir(), "laundrorama-pre-0016-"));
    const client = new PGlite();
    try {
      const journal = JSON.parse(
        await readFile(join(folder, "meta", "_journal.json"), "utf8"),
      ) as { entries: { idx: number; tag: string }[] };
      const oldEntries = journal.entries.filter((entry) => entry.idx < 16);
      await mkdir(join(oldFolder, "meta"));
      await writeFile(
        join(oldFolder, "meta", "_journal.json"),
        JSON.stringify({ ...journal, entries: oldEntries }),
      );
      await Promise.all(
        oldEntries.map((entry) =>
          copyFile(
            join(folder, `${entry.tag}.sql`),
            join(oldFolder, `${entry.tag}.sql`),
          ),
        ),
      );
      const database = drizzle(client);
      await migrate(database, { migrationsFolder: oldFolder });
      await database.execute(
        sql`insert into inventory_load(id, display_name) values ('test-load', 'Existing machines')`,
      );
      await database.execute(
        sql`insert into "user"(id, name, email) values ('test-user', 'Tester', 'tester@example.test')`,
      );
      await database.execute(sql`
        insert into inventory_machine(id, machine_type, source_load_id, inventory_state, production_state)
        values ('washer-1', 'washer', 'test-load', 'on_hand', 'preliminary_passed'),
               ('dryer-1', 'dryer', 'test-load', 'on_hand', 'preliminary_passed'),
               ('other-1', 'other', 'test-load', 'on_hand', 'preliminary_passed')
      `);
      await database.execute(sql`
        insert into file_attachment(id, machine_id, purpose, storage_key, original_filename, declared_media_type, declared_byte_count, uploader_user_id)
        values ('existing-photo', 'washer-1', 'preliminary_inspection', 'existing/photo', 'before.jpg', 'image/jpeg', 4, 'test-user')
      `);
      await migrate(database, { migrationsFolder: folder });
      await migrate(database, { migrationsFolder: folder });
      expect(
        rows(
          await database.execute(
            sql`select purpose, declared_media_type from file_attachment where id = 'existing-photo'`,
          ),
        ),
      ).toEqual([
        {
          purpose: "preliminary_inspection",
          declared_media_type: "image/jpeg",
        },
      ]);
      await database.execute(sql`
        insert into file_attachment(id, machine_id, purpose, storage_key, original_filename, declared_media_type, declared_byte_count, uploader_user_id)
        values ('new-video', 'washer-1', 'production_test_video', 'video/new', 'operation.mp4', 'video/mp4', 16, 'test-user')
      `);
      await expect(
        database.execute(sql`
        insert into file_attachment(id, load_id, purpose, storage_key, original_filename, declared_media_type, declared_byte_count, uploader_user_id)
        values ('bad-target', 'test-load', 'production_test_video', 'video/bad-target', 'operation.mp4', 'video/mp4', 16, 'test-user')
      `),
      ).rejects.toThrow();
      await expect(
        database.execute(sql`
        insert into file_attachment(id, machine_id, purpose, storage_key, original_filename, declared_media_type, declared_byte_count, uploader_user_id)
        values ('bad-media', 'washer-1', 'production_test_video', 'video/bad-media', 'operation.mp4', 'video/unknown', 16, 'test-user')
      `),
      ).rejects.toThrow();
      expect(
        rows(
          await database.execute(
            sql`select machine_id, machine_type from production_test_work_order order by machine_id`,
          ),
        ),
      ).toMatchObject([
        { machine_id: "dryer-1", machine_type: "dryer" },
        { machine_id: "washer-1", machine_type: "washer" },
      ]);
      const washerOrder = rows(
        await database.execute(
          sql`select id from production_test_work_order where machine_id = 'washer-1'`,
        ),
      )[0]!;
      const dryerOrder = rows(
        await database.execute(
          sql`select id from production_test_work_order where machine_id = 'dryer-1'`,
        ),
      )[0]!;
      await database.execute(sql`insert into production_test_run(id, order_id, template_id, started_by_user_id, video_file_id)
        values ('washer-run', ${String(washerOrder.id)}, '00000000-0000-4000-8000-000000000161', 'test-user', 'new-video')`);
      await expect(
        database.execute(sql`insert into production_test_run(id, order_id, template_id, started_by_user_id, video_file_id)
        values ('dryer-run', ${String(dryerOrder.id)}, '00000000-0000-4000-8000-000000000162', 'test-user', 'new-video')`),
      ).rejects.toThrow();
      expect(
        rows(
          await database.execute(
            sql`select production_state from inventory_machine where id = 'washer-1'`,
          ),
        ),
      ).toMatchObject([{ production_state: "awaiting_test" }]);
      expect(
        rows(
          await database.execute(
            sql`select count(*)::integer as count from production_test_step where template_id = '00000000-0000-4000-8000-000000000161'`,
          ),
        )[0]?.count,
      ).toBe(15);
      expect(
        rows(
          await database.execute(
            sql`select count(*)::integer as count from production_test_step where template_id = '00000000-0000-4000-8000-000000000162'`,
          ),
        )[0]?.count,
      ).toBe(16);
      expect(
        rows(
          await database.execute(
            sql`select count(*)::integer as count from production_test_template where approved_at is not null`,
          ),
        )[0]?.count,
      ).toBe(4);
      expect(
        rows(
          await database.execute(
            sql`select version, count(*)::integer as count from production_test_template group by version order by version`,
          ),
        ),
      ).toEqual([
        { version: 1, count: 2 },
        { version: 2, count: 2 },
      ]);
      expect(
        rows(
          await database.execute(
            sql`select count(*)::integer as count from production_test_step where template_id = '00000000-0000-4000-8000-000000000181'`,
          ),
        )[0]?.count,
      ).toBe(14);
      expect(
        rows(
          await database.execute(
            sql`select count(*)::integer as count from production_test_step where template_id = '00000000-0000-4000-8000-000000000182'`,
          ),
        )[0]?.count,
      ).toBe(15);
      await expect(
        database.execute(
          sql`update production_test_step set instruction = 'changed' where step_key = 'washer_01'`,
        ),
      ).rejects.toThrow();
      await expect(
        database.execute(
          sql`insert into production_test_step(template_id, step_key, position, instruction) values ('00000000-0000-4000-8000-000000000161', 'late_step', 15, 'Late change')`,
        ),
      ).rejects.toThrow();
      await expect(
        database.execute(
          sql`insert into production_test_template(id, machine_type, version, approved_at) values ('preapproved', 'washer', 4, now())`,
        ),
      ).rejects.toThrow();
      await database.execute(
        sql`insert into production_test_template(id, machine_type, version) values ('washer-v3', 'washer', 3)`,
      );
      await database.execute(
        sql`insert into production_test_step(template_id, step_key, position, instruction) values ('washer-v3', 'new_step', 0, 'New approved-version step')`,
      );
      await database.execute(
        sql`update production_test_template set approved_at = now() where id = 'washer-v3'`,
      );
      await expect(
        database.execute(
          sql`insert into production_test_step(template_id, step_key, position, instruction) values ('washer-v3', 'late_step', 1, 'Late change')`,
        ),
      ).rejects.toThrow();
      expect(
        rows(
          await database.execute(
            sql`select count(*)::integer as count from production_test_step where template_id = '00000000-0000-4000-8000-000000000161'`,
          ),
        )[0]?.count,
      ).toBe(15);
      expect(
        rows(
          await database.execute(
            sql`select count(*)::integer as count from production_test_step where template_id = 'washer-v3'`,
          ),
        )[0]?.count,
      ).toBe(1);
      const backfillAudit = rows(
        await database.execute(
          sql`select action, target_type, target_id, actor_kind, actor_user_id, request_id, safe_summary from operations_audit_entry where request_id = 'migration:0016:production-test-queue' order by action, target_id`,
        ),
      );
      const backfillOutbox = rows(
        await database.execute(
          sql`select event_type, target_type, target_id, actor_kind, actor_user_id, request_id, safe_summary from platform_outbox_job where request_id = 'migration:0016:production-test-queue' order by event_type, target_id`,
        ),
      );
      expect(backfillAudit).toHaveLength(4);
      expect(backfillOutbox).toHaveLength(4);
      expect(
        backfillAudit.map((entry) => [entry.action, entry.target_type]),
      ).toEqual([
        ["inventory.machine.lifecycle_updated", "machine"],
        ["inventory.machine.lifecycle_updated", "machine"],
        ["production.test_work_order.created", "production_test_work_order"],
        ["production.test_work_order.created", "production_test_work_order"],
      ]);
      expect(
        backfillOutbox.map((entry) => [
          entry.event_type,
          entry.target_type,
          entry.target_id,
        ]),
      ).toEqual(
        backfillAudit.map((entry) => [
          entry.action,
          entry.target_type,
          entry.target_id,
        ]),
      );
      expect(
        backfillAudit.every(
          (entry) =>
            entry.actor_kind === "system" &&
            entry.actor_user_id === null &&
            typeof entry.safe_summary === "object",
        ),
      ).toBe(true);
      await expect(
        database.execute(
          sql`insert into production_test_work_order(id, machine_id, machine_type, state) values ('duplicate', 'washer-1', 'washer', 'queued')`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.close();
      await rm(oldFolder, { recursive: true, force: true });
    }
  });
});
