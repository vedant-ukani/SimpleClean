import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@simply-clean/config";
import type { DatabaseConnection } from "@simply-clean/database";
import { createTestEnvironment } from "@simply-clean/test-support";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { IdentityService } from "../src/modules/identity/identity.service.js";
import { DATABASE_CONNECTION } from "../src/platform/database.module.js";

const applications: INestApplication[] = [];
const roots: string[] = [];

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function application() {
  const root = await mkdtemp(join(tmpdir(), "simply-clean-imports-"));
  roots.push(root);
  const config = parseServerEnvironment(
    createTestEnvironment({ FILE_LOCAL_DIRECTORY: root }),
  );
  const module = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();
  await module.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();
  const app = module.createNestApplication({ bodyParser: false });
  applications.push(app);
  await app.init();
  return app;
}

async function user(
  app: INestApplication,
  role: "owner_admin" | "warehouse",
  suffix = "",
) {
  const email = `${role}${suffix}@example.test`;
  const password = `${role}-secure-password`;
  const identity = await app
    .get(IdentityService)
    .provisionUser(
      { name: role, email, password, role },
      { requestId: `provision-${role}-${suffix}` },
    );
  const response = await request(app.getHttpServer())
    .post("/auth/sign-in/email")
    .set("origin", "http://localhost:3000")
    .send({ email, password })
    .expect(200);
  return {
    identity,
    cookies: response.headers["set-cookie"] as unknown as string[],
  };
}

async function load(app: INestApplication, cookies: string[]) {
  const response = await request(app.getHttpServer())
    .post("/inventory/loads")
    .set("Cookie", cookies)
    .set("Idempotency-Key", randomUUID())
    .send({ displayName: "Legacy workbook migration" })
    .expect(201);
  return response.body.load as { id: string };
}

const csv = Buffer.from(
  "Make,Model,Serial,Status,Price,Testing Status\n" +
    "Speedqueen,SC30,001,In Inventory,1000,Tested (Passed)\n" +
    "Dexter,D50,002,Purchased (Shipped),2000,Not Tested\n" +
    "Dexter,D60,001,In Inventory,3000,\n",
);
const suppliedWorkbookPath = resolve(
  process.cwd(),
  "../../source-materials/inventory/Inventory List.xlsx",
);

function stage(
  app: INestApplication,
  cookies: string[],
  loadId: string,
  key = randomUUID(),
  bytes = csv,
) {
  return request(app.getHttpServer())
    .post("/imports")
    .set("Cookie", cookies)
    .set("Idempotency-Key", key)
    .field("loadId", loadId)
    .attach("file", bytes, {
      filename: "William Inventory.csv",
      contentType: "text/csv",
    });
}

describe("Owner-reviewed inventory imports", () => {
  it.runIf(existsSync(suppliedWorkbookPath))(
    "stages William's supplied workbook read-only with the expected evidence counts",
    async () => {
      const before = await stat(suppliedWorkbookPath);
      const bytes = await readFile(suppliedWorkbookPath);
      const app = await application();
      const owner = await user(app, "owner_admin", "workbook");
      const sourceLoad = await load(app, owner.cookies);
      const response = await request(app.getHttpServer())
        .post("/imports")
        .set("Cookie", owner.cookies)
        .set("Idempotency-Key", randomUUID())
        .field("loadId", sourceLoad.id)
        .attach("file", bytes, {
          filename: "Inventory List.xlsx",
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        .expect(201);
      expect(response.body.run).toMatchObject({
        totalRows: 227,
        warningRows: 172,
        errorRows: 55,
        committedRows: 0,
      });
      const stagedRows = await request(app.getHttpServer())
        .get(`/imports/${response.body.run.id}/rows`)
        .query({ pageSize: 200, classification: "warning" })
        .set("Cookie", owner.cookies)
        .expect(200);
      expect(stagedRows.body.total).toBe(172);
      expect(
        stagedRows.body.rows.filter((row: { findings: string[] }) =>
          row.findings.includes("duplicate_in_import"),
        ),
      ).toHaveLength(10);
      const after = await stat(suppliedWorkbookPath);
      expect(after.size).toBe(before.size);
      expect(after.mtimeMs).toBe(before.mtimeMs);
      expect(await readFile(suppliedWorkbookPath)).toEqual(bytes);
    },
  );

  it("stages evidence, enforces review, commits through Inventory once, and protects source/report", async () => {
    const app = await application();
    const owner = await user(app, "owner_admin");
    const warehouse = await user(app, "warehouse");
    const sourceLoad = await load(app, owner.cookies);
    const uploadKey = randomUUID();

    await stage(app, warehouse.cookies, sourceLoad.id).expect(403);
    const [created, concurrentUpload] = await Promise.all([
      stage(app, owner.cookies, sourceLoad.id, uploadKey),
      stage(app, owner.cookies, sourceLoad.id, uploadKey),
    ]);
    expect([created.status, concurrentUpload.status]).toEqual([201, 201]);
    expect(concurrentUpload.body.run.id).toBe(created.body.run.id);
    expect(created.body.run).toMatchObject({
      sourceLoadId: sourceLoad.id,
      state: "staged",
      totalRows: 3,
      warningRows: 2,
      errorRows: 1,
      approvedRows: 0,
    });
    const replay = await stage(
      app,
      owner.cookies,
      sourceLoad.id,
      uploadKey,
    ).expect(201);
    expect(replay.body.run.id).toBe(created.body.run.id);
    await stage(
      app,
      owner.cookies,
      sourceLoad.id,
      uploadKey,
      Buffer.from(`${csv.toString("utf8")}Dexter,D70,003,In Inventory,,\n`),
    ).expect(409);

    const runId = created.body.run.id as string;
    await request(app.getHttpServer())
      .get(`/imports/${runId}`)
      .set("Cookie", warehouse.cookies)
      .expect(403);
    const rowResponse = await request(app.getHttpServer())
      .get(`/imports/${runId}/rows`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(rowResponse.body.total).toBe(3);
    expect(rowResponse.body.rows[0]).toMatchObject({
      sourceRowNumber: 2,
      candidate: {
        manufacturer: "Speedqueen",
        serial: "001",
        machineType: "other",
      },
      classification: "warning",
      findings: expect.arrayContaining([
        "machine_type_unknown",
        "manufacturer_alias_applied",
        "duplicate_in_import",
      ]),
    });
    const firstRow = rowResponse.body.rows[0];
    const errorRow = rowResponse.body.rows[1];
    await request(app.getHttpServer())
      .post(`/imports/${runId}/approve`)
      .set("Cookie", owner.cookies)
      .send({ expectedVersion: 1, rowIds: [errorRow.id] })
      .expect(409);
    const approved = await request(app.getHttpServer())
      .post(`/imports/${runId}/approve`)
      .set("Cookie", owner.cookies)
      .send({ expectedVersion: 1, rowIds: [firstRow.id] })
      .expect(201);
    expect(approved.body.run).toMatchObject({
      state: "approved",
      version: 2,
      approvedRows: 1,
    });

    const commitKey = randomUUID();
    const committed = await request(app.getHttpServer())
      .post(`/imports/${runId}/commit`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", commitKey)
      .send({ expectedVersion: 2 })
      .expect(201);
    expect(committed.body.run).toMatchObject({
      state: "committed",
      committedRows: 1,
      version: 3,
    });
    expect(committed.body.machineIds).toHaveLength(1);
    const commitReplay = await request(app.getHttpServer())
      .post(`/imports/${runId}/commit`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", commitKey)
      .send({ expectedVersion: 2 })
      .expect(201);
    expect(commitReplay.body.machineIds).toEqual(committed.body.machineIds);
    await request(app.getHttpServer())
      .post(`/imports/${runId}/commit`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", commitKey)
      .send({ expectedVersion: 3 })
      .expect(409);

    const machine = await request(app.getHttpServer())
      .get(`/inventory/machines/${committed.body.machineIds[0]}`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(machine.body.machine).toMatchObject({
      machineType: "other",
      manufacturer: "Speedqueen",
      serial: "001",
      inventoryState: "on_hand",
      identityVerificationState: "provisional",
    });
    expect(machine.body.identityEvidence[0].sourceKind).toBe(
      "spreadsheet_import",
    );

    const source = await request(app.getHttpServer())
      .get(`/imports/${runId}/source`)
      .set("Cookie", owner.cookies)
      .expect(200)
      .expect("Content-Type", /text\/csv/);
    expect(source.text).toBe(csv.toString("utf8"));
    const report = await request(app.getHttpServer())
      .get(`/imports/${runId}/report`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(report.text).toContain(committed.body.machineIds[0]);

    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    const evidence = await database.database.execute(sql`
      select r.source_row_number, r.match_snapshot,
        r.match_fingerprint, m.machine_id
      from inventory_import_row r
      inner join inventory_import_machine_mapping m on m.row_id = r.id
      where r.run_id = ${runId}
    `);
    const evidenceRows = resultRows<{
      match_snapshot: unknown;
      match_fingerprint: string;
    }>(evidence);
    expect(evidenceRows).toHaveLength(1);
    expect(evidenceRows[0]?.match_snapshot).toEqual({
      exactIdentityMachineIds: [],
      serialMachineIds: [],
      modelMachineIds: [],
    });
    expect(evidenceRows[0]?.match_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      database.database.execute(sql`
        update inventory_import_row set source_row_number = 999
        where run_id = ${runId}
      `),
    ).rejects.toThrow();
    await expect(
      database.database.execute(sql`
        update inventory_import_run set original_filename = 'changed.csv'
        where id = ${runId}
      `),
    ).rejects.toThrow();
    const audit = await request(app.getHttpServer())
      .get("/operations/audit")
      .query({ targetType: "import_run", targetId: runId })
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(
      audit.body.entries.map((entry: { action: string }) => entry.action),
    ).toEqual(
      expect.arrayContaining([
        "imports.run.staged",
        "imports.run.approved",
        "imports.run.committed",
      ]),
    );
    const auditContent = JSON.stringify(
      audit.body.entries.map((entry: { action: string; summary: unknown }) => ({
        action: entry.action,
        summary: entry.summary,
      })),
    );
    expect(auditContent).not.toContain("William Inventory.csv");
    expect(auditContent).not.toContain("001");
  });

  it("returns a privacy-safe failure and removes source bytes when staging fails", async () => {
    const app = await application();
    const owner = await user(app, "owner_admin", "stage-failure");
    const sourceLoad = await load(app, owner.cookies);
    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    await database.database.execute(sql`
      create function force_private_import_row_failure() returns trigger as $$
      begin raise exception 'private serial and row content'; end;
      $$ language plpgsql
    `);
    await database.database.execute(sql`
      create trigger force_private_import_row_failure before insert
      on inventory_import_row for each row
      execute function force_private_import_row_failure()
    `);
    const response = await stage(
      app,
      owner.cookies,
      sourceLoad.id,
      randomUUID(),
      Buffer.from(
        "Make,Model,Serial,Status,Notes\nDexter,D50,PRIVATE-123,In Inventory,private row content\n",
      ),
    ).expect(500);
    expect(response.body.message).toBe(
      "Inventory import staging failed safely",
    );
    expect(JSON.stringify(response.body)).not.toContain("PRIVATE-123");
    expect(JSON.stringify(response.body)).not.toContain("private row content");
    const runCount = await database.database.execute(sql`
      select count(*)::integer as count from inventory_import_run
    `);
    expect(Number(resultRows<{ count: number }>(runCount)[0]?.count)).toBe(0);
    const storageEntries = await readdir(roots.at(-1)!, {
      recursive: true,
      withFileTypes: true,
    });
    expect(storageEntries.filter((entry) => entry.isFile())).toHaveLength(0);
  });

  it("enforces approval, provenance, and lifecycle invariants in the database", async () => {
    const app = await application();
    const owner = await user(app, "owner_admin", "db-guards");
    const sourceLoad = await load(app, owner.cookies);
    const staged = await stage(app, owner.cookies, sourceLoad.id).expect(201);
    const runId = staged.body.run.id as string;
    const rowResponse = await request(app.getHttpServer())
      .get(`/imports/${runId}/rows`)
      .set("Cookie", owner.cookies)
      .expect(200);
    const selectedRow = rowResponse.body.rows.find(
      (row: { classification: string }) => row.classification !== "error",
    ) as { id: string };
    const errorRow = rowResponse.body.rows.find(
      (row: { classification: string }) => row.classification === "error",
    ) as { id: string };
    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    await expect(
      database.database.execute(sql`
        insert into inventory_import_row (
          id, run_id, sheet_name, source_row_number, raw_cells, candidate,
          normalized_manufacturer, normalized_model, normalized_serial,
          match_snapshot, match_fingerprint, classification, findings
        )
        select ${randomUUID()}, run_id, sheet_name, 9998, raw_cells, candidate,
          normalized_manufacturer, normalized_model, normalized_serial,
          match_snapshot, match_fingerprint, classification, findings
        from inventory_import_row where id = ${selectedRow.id}
      `),
    ).rejects.toThrow();
    const approvalId = randomUUID();
    await database.database.execute(sql`
      insert into inventory_import_approval (
        id, run_id, actor_user_id, request_id
      ) values (
        ${approvalId}, ${runId}, ${owner.identity.id}, 'db-guard-approval'
      )
    `);
    await expect(
      database.database.execute(sql`
        insert into inventory_import_approval_row (approval_id, run_id, row_id)
        values (${approvalId}, ${runId}, ${errorRow.id})
      `),
    ).rejects.toThrow();
    await database.database.execute(sql`
      insert into inventory_import_approval_row (approval_id, run_id, row_id)
      values (${approvalId}, ${runId}, ${selectedRow.id})
    `);
    await database.database.execute(sql`
      update inventory_import_run set state = 'approved', approved_rows = 1,
        version = 2, updated_at = now() where id = ${runId}
    `);
    await expect(
      database.database.execute(sql`
        insert into inventory_import_row (
          id, run_id, sheet_name, source_row_number, raw_cells, candidate,
          normalized_manufacturer, normalized_model, normalized_serial,
          match_snapshot, match_fingerprint, classification, findings
        )
        select ${randomUUID()}, run_id, sheet_name, 9999, raw_cells, candidate,
          normalized_manufacturer, normalized_model, normalized_serial,
          match_snapshot, match_fingerprint, classification, findings
        from inventory_import_row where id = ${selectedRow.id}
      `),
    ).rejects.toThrow();
    await expect(
      database.database.execute(sql`
        insert into inventory_import_approval (
          id, run_id, actor_user_id, request_id
        ) values (
          ${randomUUID()}, ${runId}, ${owner.identity.id}, 'late-approval'
        )
      `),
    ).rejects.toThrow();

    const machine = await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "other",
        sourceLoadId: sourceLoad.id,
        manufacturer: "Unrelated",
        serial: "DB-GUARD-MACHINE",
      })
      .expect(201);
    await expect(
      database.database.execute(sql`
        insert into inventory_import_machine_mapping (
          id, approval_id, run_id, row_id, machine_id
        ) values (
          ${randomUUID()}, ${approvalId}, ${runId}, ${errorRow.id},
          ${machine.body.machine.id}
        )
      `),
    ).rejects.toThrow();
    await database.database.execute(sql`
      update inventory_import_run set state = 'commit_failed',
        failure_code = 'duplicate_state_changed', version = 3,
        updated_at = now() where id = ${runId}
    `);
    await expect(
      database.database.execute(sql`
        insert into inventory_import_machine_mapping (
          id, approval_id, run_id, row_id, machine_id
        ) values (
          ${randomUUID()}, ${approvalId}, ${runId}, ${selectedRow.id},
          ${machine.body.machine.id}
        )
      `),
    ).rejects.toThrow();
    await expect(
      database.database.execute(sql`
        update inventory_import_run set state = 'approved',
          failure_code = null, version = 4, updated_at = now()
        where id = ${runId}
      `),
    ).rejects.toThrow();
  });

  it("rolls back all Machines on a late commit failure and records only a safe failure", async () => {
    const app = await application();
    const owner = await user(app, "owner_admin", "rollback");
    const sourceLoad = await load(app, owner.cookies);
    const staged = await stage(app, owner.cookies, sourceLoad.id).expect(201);
    const runId = staged.body.run.id as string;
    const rowsResponse = await request(app.getHttpServer())
      .get(`/imports/${runId}/rows`)
      .set("Cookie", owner.cookies)
      .expect(200);
    const selected = rowsResponse.body.rows
      .filter(
        (row: { classification: string }) => row.classification !== "error",
      )
      .map((row: { id: string }) => row.id);
    await request(app.getHttpServer())
      .post(`/imports/${runId}/approve`)
      .set("Cookie", owner.cookies)
      .send({ expectedVersion: 1, rowIds: selected })
      .expect(201);
    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    await database.database.execute(sql`
      create function force_import_mapping_failure() returns trigger as $$
      begin raise exception 'private row content'; end;
      $$ language plpgsql
    `);
    await database.database.execute(sql`
      create trigger force_import_mapping_failure before insert
      on inventory_import_machine_mapping for each row
      execute function force_import_mapping_failure()
    `);
    await request(app.getHttpServer())
      .post(`/imports/${runId}/commit`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 2 })
      .expect(500);
    const machineCount = await database.database.execute(sql`
      select count(*)::integer as count from inventory_machine where source_load_id = ${sourceLoad.id}
    `);
    expect(Number(resultRows<{ count: number }>(machineCount)[0]?.count)).toBe(
      0,
    );
    const failed = await request(app.getHttpServer())
      .get(`/imports/${runId}`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(failed.body.run).toMatchObject({
      state: "commit_failed",
      failureCode: "commit_failed",
      version: 3,
    });
    const stored = await database.database.execute(sql`
      select safe_summary::text as summary from operations_audit_entry
      where target_type = 'import_run' and target_id = ${runId}
    `);
    expect(JSON.stringify(resultRows(stored))).not.toContain(
      "private row content",
    );
    await database.database.execute(sql`
      drop trigger force_import_mapping_failure on inventory_import_machine_mapping
    `);
    await database.database.execute(sql`
      drop function force_import_mapping_failure()
    `);
    const retried = await request(app.getHttpServer())
      .post(`/imports/${runId}/commit`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 3 })
      .expect(201);
    expect(retried.body.run).toMatchObject({
      state: "committed",
      committedRows: selected.length,
      version: 4,
    });
  });

  it("stops when an additional Inventory match appears and requires a new Import Run", async () => {
    const app = await application();
    const owner = await user(app, "owner_admin", "race");
    const sourceLoad = await load(app, owner.cookies);
    const oneRow = Buffer.from(
      "Make,Model,Serial,Status\nDexter,D80,RACE-1,In Inventory\n",
    );
    await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "other",
        sourceLoadId: sourceLoad.id,
        manufacturer: "Dexter",
        model: "D80",
        serial: "RACE-1",
      })
      .expect(201);
    const staged = await stage(
      app,
      owner.cookies,
      sourceLoad.id,
      randomUUID(),
      oneRow,
    ).expect(201);
    const runId = staged.body.run.id as string;
    const rowResult = await request(app.getHttpServer())
      .get(`/imports/${runId}/rows`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(rowResult.body.rows[0].findings).toEqual(
      expect.arrayContaining(["existing_identity_match"]),
    );
    await request(app.getHttpServer())
      .post(`/imports/${runId}/approve`)
      .set("Cookie", owner.cookies)
      .send({ expectedVersion: 1, rowIds: [rowResult.body.rows[0].id] })
      .expect(201);
    await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "other",
        sourceLoadId: sourceLoad.id,
        manufacturer: "Dexter",
        model: "D80",
        serial: "RACE-1",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/imports/${runId}/commit`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 2 })
      .expect(409);
    const failed = await request(app.getHttpServer())
      .get(`/imports/${runId}`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(failed.body.run).toMatchObject({
      state: "commit_failed",
      failureCode: "duplicate_state_changed",
      version: 3,
      committedRows: 0,
    });
    await request(app.getHttpServer())
      .post(`/imports/${runId}/commit`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 3 })
      .expect(409);
    const terminal = await request(app.getHttpServer())
      .get(`/imports/${runId}`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(terminal.body.run).toMatchObject({
      state: "commit_failed",
      failureCode: "duplicate_state_changed",
      version: 3,
      committedRows: 0,
    });
  });

  it("rechecks the staged match snapshot when retrying a recoverable failed commit", async () => {
    const app = await application();
    const owner = await user(app, "owner_admin", "failed-recheck");
    const sourceLoad = await load(app, owner.cookies);
    const oneRow = Buffer.from(
      "Make,Model,Serial,Status\nDexter,D90,FAILED-RACE,In Inventory\n",
    );
    const staged = await stage(
      app,
      owner.cookies,
      sourceLoad.id,
      randomUUID(),
      oneRow,
    ).expect(201);
    const runId = staged.body.run.id as string;
    const rowResult = await request(app.getHttpServer())
      .get(`/imports/${runId}/rows`)
      .set("Cookie", owner.cookies)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/imports/${runId}/approve`)
      .set("Cookie", owner.cookies)
      .send({ expectedVersion: 1, rowIds: [rowResult.body.rows[0].id] })
      .expect(201);
    const database = app.get<DatabaseConnection>(DATABASE_CONNECTION);
    await database.database.execute(sql`
      create function force_failed_retry_mapping_failure() returns trigger as $$
      begin raise exception 'forced failure'; end;
      $$ language plpgsql
    `);
    await database.database.execute(sql`
      create trigger force_failed_retry_mapping_failure before insert
      on inventory_import_machine_mapping for each row
      execute function force_failed_retry_mapping_failure()
    `);
    await request(app.getHttpServer())
      .post(`/imports/${runId}/commit`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 2 })
      .expect(500);
    await database.database.execute(sql`
      drop trigger force_failed_retry_mapping_failure on inventory_import_machine_mapping
    `);
    await database.database.execute(sql`
      drop function force_failed_retry_mapping_failure()
    `);
    await request(app.getHttpServer())
      .post("/inventory/machines")
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        machineType: "other",
        sourceLoadId: sourceLoad.id,
        manufacturer: "Dexter",
        model: "D90",
        serial: "FAILED-RACE",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/imports/${runId}/commit`)
      .set("Cookie", owner.cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ expectedVersion: 3 })
      .expect(409);
    const failed = await request(app.getHttpServer())
      .get(`/imports/${runId}`)
      .set("Cookie", owner.cookies)
      .expect(200);
    expect(failed.body.run).toMatchObject({
      state: "commit_failed",
      failureCode: "duplicate_state_changed",
      version: 4,
      committedRows: 0,
    });
  });
});
