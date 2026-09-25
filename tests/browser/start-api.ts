import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseServerEnvironment } from "@laundrorama/config";
import type { DatabaseConnection } from "@laundrorama/database";
import { createTestEnvironment } from "@laundrorama/test-support";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AppModule } from "../../apps/api/src/app.module.js";
import {
  CatalogService,
  catalogManifestChecksum,
} from "../../apps/api/src/modules/catalog/catalog.service.js";
import { IdentityService } from "../../apps/api/src/modules/identity/identity.service.js";
import { InventoryService } from "../../apps/api/src/modules/inventory/inventory.service.js";
import { OperationsWorker } from "../../apps/api/src/modules/operations/operations.worker.js";
import { QrLabelService } from "../../apps/api/src/modules/inventory/qr/qr-label.service.js";
import { ProductionService } from "../../apps/api/src/modules/production/production.service.js";
import { DATABASE_CONNECTION } from "../../apps/api/src/platform/database.module.js";

const apiOrigin = "http://localhost:3101";
const webOrigin = process.env.BROWSER_WEB_ORIGIN ?? "http://localhost:3100";
const people = [
  {
    name: "Browser Owner",
    email: "owner.browser@example.test",
    password: "owner-browser-password",
    role: "owner_admin" as const,
  },
  {
    name: "Browser Warehouse",
    email: "warehouse.browser@example.test",
    password: "warehouse-browser-password",
    role: "warehouse" as const,
  },
  {
    name: "Browser Technician",
    email: "technician.browser@example.test",
    password: "technician-browser-password",
    role: "technician_cleaner" as const,
  },
];

async function main(): Promise<void> {
  const sandboxDirectory = mkdtempSync(join(tmpdir(), "laundrorama-browser-"));
  const config = parseServerEnvironment(
    createTestEnvironment({
      API_PORT: "3101",
      API_BASE_URL: apiOrigin,
      AUTH_BASE_URL: apiOrigin,
      AUTH_TRUSTED_ORIGIN: webOrigin,
      PLATFORM_PUBLIC_ORIGIN: webOrigin,
      PGLITE_DATA_DIR: join(sandboxDirectory, "database"),
      FILE_LOCAL_DIRECTORY: join(sandboxDirectory, "files"),
      OPERATIONS_WORKER_POLL_MS: "100",
      OPERATIONS_WORKER_POLLING_ENABLED: "true",
      INTAKE_RECOGNITION_ENABLED: "true",
      INTAKE_RECOGNITION_SEMANTIC_PROVIDER: "fake",
      INTAKE_RECOGNITION_VERIFIER_PROVIDER: "fake",
      INTAKE_RECOGNITION_GROUP_FLOOR: "0.9",
      INTAKE_RECOGNITION_FIELD_FLOOR: "0.9",
      INTAKE_RECOGNITION_OCR_FLOOR: "0.9",
      CATALOG_DISCOVERY_ENABLED: "true",
      CATALOG_DISCOVERY_PROVIDER: "fake",
      CATALOG_DISCOVERY_MODEL: "deterministic-catalog-v1",
      CATALOG_DISCOVERY_PRICING_VERSION: "browser-test-pricing-v1",
      CATALOG_DISCOVERY_INPUT_USD_PER_MILLION_TOKENS: "1",
      CATALOG_DISCOVERY_OUTPUT_USD_PER_MILLION_TOKENS: "2",
      CATALOG_DISCOVERY_WEB_SEARCH_USD_PER_CALL: "0.01",
    }),
  );
  const application = await NestFactory.create(AppModule.register(config), {
    bodyParser: false,
    logger: false,
  });
  await application.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();
  await application
    .get(CatalogService)
    .importManifest(
      JSON.parse(
        readFileSync(
          new URL(
            "../../apps/api/catalog-data/official-models.2026-09-23.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
  const fakeManufacturerSnapshot = {
    datasetId: "browser-fake-manufacturer",
    snapshotDate: "2026-09-23",
    checksum: "0".repeat(64),
    manufacturers: [
      {
        id: "browser-fake-manufacturer",
        name: "FAKE",
        aliases: [],
        sources: [
          {
            id: "browser-fake-source",
            url: "https://example.test/models",
            title: "Deterministic browser manufacturer source",
            retrievedAt: "2026-09-23T00:00:00.000Z",
            documentRevision: null,
            checksum: "f".repeat(64),
          },
        ],
        models: [],
      },
    ],
  };
  fakeManufacturerSnapshot.checksum = catalogManifestChecksum(
    fakeManufacturerSnapshot,
  );
  await application
    .get(CatalogService)
    .importManifest(fakeManufacturerSnapshot);

  const identity = application.get(IdentityService);
  const inventory = application.get(InventoryService);
  const qr = application.get(QrLabelService);
  const production = application.get(ProductionService);
  const provisioned = new Map<
    (typeof people)[number]["role"],
    Awaited<ReturnType<IdentityService["provisionUser"]>>
  >();
  for (const person of people) {
    provisioned.set(
      person.role,
      await identity.provisionUser(person, {
        requestId: `browser-provision-${person.role}`,
      }),
    );
  }

  const owner = provisioned.get("owner_admin");
  const warehouse = provisioned.get("warehouse");
  if (!owner || !warehouse) {
    throw new Error("Browser users were not provisioned");
  }
  for (const person of [
    { name: "Browser Washer Tech", email: "washer.browser@example.test", password: "washer-browser-password", role: "technician_cleaner" as const },
    { name: "Browser Dryer Tech", email: "dryer.browser@example.test", password: "dryer-browser-password", role: "technician_cleaner" as const },
  ]) await identity.provisionUser(person, { requestId: `browser-provision-${person.name}` });

  const ownerContext = {
    actorUserId: owner.id,
    requestId: "browser-seed-owner",
    idempotencyKey: randomUUID(),
  };
  const load = await inventory.createLoad(
    {
      displayName: "Browser Test Expected Load",
      sourceName: "Synthetic browser fixture",
      sourceReference: "E2E-LOAD-001",
    },
    ownerContext,
  );
  const warehouseContext = {
    actorUserId: warehouse.id,
    requestId: "browser-seed-warehouse",
    idempotencyKey: randomUUID(),
  };
  let machine = await inventory.createMachine(
    { machineType: "washer", sourceLoadId: load.id },
    warehouseContext,
  );
  machine = await inventory.updateMachineIdentity(
    machine.id,
    {
      manufacturer: "Speed Queen",
      model: "SC30",
      serial: "BROWSER-SERIAL-001",
      voltage: "208-240V",
      phase: "three_phase",
      fuel: "electric",
      sourceKind: "manual",
      expectedVersion: machine.version,
    },
    warehouseContext,
  );
  machine = await inventory.verifyMachine(
    machine.id,
    { expectedVersion: machine.version },
    warehouseContext,
  );
  for (const project of [
    "desktop-chromium",
    "tablet-chromium",
    "tablet-landscape-chromium",
  ]) {
    await inventory.createMachine(
      {
        machineType: "washer",
        sourceLoadId: load.id,
        inventoryState: "on_hand",
        manufacturer: "Speed Queen",
        model: "SC30",
        serial: `PRODUCTION-${project}`,
      },
      { ...warehouseContext, idempotencyKey: randomUUID() },
    );
    for (const [machineType, serial] of [
      ["washer", `INITIAL-WASHER-${project}`],
      ["dryer", `INITIAL-EXCEPTION-${project}`],
    ] as const) {
      const unassessed = await inventory.createMachine({
        machineType, sourceLoadId: load.id, inventoryState: "on_hand",
        manufacturer: "Dexter", model: machineType === "washer" ? "W-Initial" : "D-Exception", serial,
      }, { ...warehouseContext, idempotencyKey: randomUUID() });
      await qr.create(unassessed.id, {}, {
        actorUserId: warehouse.id, role: "warehouse", requestId: `browser-initial-qr-${project}-${machineType}`,
        idempotencyKey: randomUUID(),
      });
    }
    for (const machineType of ["washer", "dryer"] as const) {
      const ready = await inventory.createMachine({
        machineType, sourceLoadId: load.id, inventoryState: "on_hand",
        manufacturer: "Dexter", model: machineType === "washer" ? "W-Test" : "D-Test",
        serial: `TEST-${machineType.toUpperCase()}-${project}`,
      }, { ...warehouseContext, idempotencyKey: randomUUID() });
      await production.create(ready.id, {
        expectedMachineVersion: ready.version, condition: "Ready for full test",
        bearingAssessment: "no_concern_observed", bearingNotes: "", missingParts: "", damage: "",
        recommendation: "repairable", reason: "Browser test fixture", evidenceFileIds: [],
      }, owner, { requestId: `browser-test-${project}-${machineType}`, idempotencyKey: randomUUID() });
      await qr.create(ready.id, {}, {
        actorUserId: warehouse.id, role: "warehouse", requestId: `browser-test-qr-${project}-${machineType}`,
        idempotencyKey: randomUUID(),
      });
    }
  }
  await qr.create(
    machine.id,
    {},
    {
      actorUserId: warehouse.id,
      role: "warehouse",
      requestId: "browser-seed-qr",
      idempotencyKey: randomUUID(),
    },
  );

  await application.listen(config.apiPort, "127.0.0.1");
  // Keep the browser fixture deterministic: the acceptance journey exercises
  // the same durable outbox worker, but drives a bounded poll from the fixture
  // so queued targeted recognition cannot depend on Nest lifecycle timing.
  const worker = application.get(OperationsWorker);
  const workerTimer = setInterval(() => {
    void worker.runOnce().catch(() => undefined);
  }, config.operationsWorkerPollMs);
  workerTimer.unref();
  process.stdout.write(`Browser test API ready at ${apiOrigin}\n`);

  let closing = false;
  async function close(): Promise<void> {
    if (closing) return;
    closing = true;
    clearInterval(workerTimer);
    await application.close();
    rmSync(sandboxDirectory, { recursive: true, force: true });
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void close().finally(() => process.exit(0));
    });
  }
}

void main();
