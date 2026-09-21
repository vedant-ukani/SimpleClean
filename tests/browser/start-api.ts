import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseServerEnvironment } from "@simply-clean/config";
import type { DatabaseConnection } from "@simply-clean/database";
import { createTestEnvironment } from "@simply-clean/test-support";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AppModule } from "../../apps/api/src/app.module.js";
import { IdentityService } from "../../apps/api/src/modules/identity/identity.service.js";
import { InventoryService } from "../../apps/api/src/modules/inventory/inventory.service.js";
import { QrLabelService } from "../../apps/api/src/modules/inventory/qr/qr-label.service.js";
import { DATABASE_CONNECTION } from "../../apps/api/src/platform/database.module.js";

const apiOrigin = "http://localhost:3101";
const webOrigin = "http://localhost:3100";
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
  const sandboxDirectory = mkdtempSync(join(tmpdir(), "simply-clean-browser-"));
  const config = parseServerEnvironment(
    createTestEnvironment({
      API_PORT: "3101",
      API_BASE_URL: apiOrigin,
      AUTH_BASE_URL: apiOrigin,
      AUTH_TRUSTED_ORIGIN: webOrigin,
      PLATFORM_PUBLIC_ORIGIN: webOrigin,
      PGLITE_DATA_DIR: join(sandboxDirectory, "database"),
      FILE_LOCAL_DIRECTORY: join(sandboxDirectory, "files"),
    }),
  );
  const application = await NestFactory.create(AppModule.register(config), {
    bodyParser: false,
    logger: false,
  });
  await application.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();

  const identity = application.get(IdentityService);
  const inventory = application.get(InventoryService);
  const qr = application.get(QrLabelService);
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
  const receiving = await inventory.createLocation(
    { code: "E2E-REC", name: "Browser receiving" },
    { ...ownerContext, idempotencyKey: randomUUID() },
  );
  await inventory.createLocation(
    { code: "E2E-STORAGE", name: "Browser storage" },
    { ...ownerContext, idempotencyKey: randomUUID() },
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
  machine = await inventory.relocateMachine(
    machine.id,
    { toLocationId: receiving.id, expectedVersion: machine.version },
    warehouseContext,
  );
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
  process.stdout.write(`Browser test API ready at ${apiOrigin}\n`);

  let closing = false;
  async function close(): Promise<void> {
    if (closing) return;
    closing = true;
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
