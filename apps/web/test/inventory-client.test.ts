import { createTestEnvironment } from "@simply-clean/test-support";
import { describe, expect, it, vi } from "vitest";

import {
  getMachine,
  InventoryRequestError,
  searchMachines,
} from "../src/lib/inventory-client";

const timestamp = new Date().toISOString();
const machine = {
  id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
  machineType: "washer",
  manufacturer: null,
  model: null,
  serial: null,
  voltage: null,
  phase: null,
  fuel: null,
  sourceLoadId: "f13fd79e-f4ad-4ce8-9b7c-9ccb6e51c247",
  sourceLoadDisplayName: "Expected Load",
  currentLocationId: null,
  currentLocationCode: null,
  currentLocationName: null,
  identityVerificationState: "provisional",
  conflictingMachineId: null,
  inventoryState: "expected",
  productionState: "not_started",
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("inventory client", () => {
  it("forwards the session and validates Machine details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          machine,
          identityEvidence: [],
          verificationHistory: [],
          locationHistory: [],
        }),
        { status: 200 },
      ),
    );
    await expect(
      getMachine(
        machine.id,
        fetcher,
        createTestEnvironment(),
        "session=cookie",
      ),
    ).resolves.toMatchObject({ machine: { productionState: "not_started" } });
    expect(fetcher).toHaveBeenCalledWith(
      `http://localhost:3001/inventory/machines/${machine.id}`,
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "session=cookie" }),
      }),
    );
  });

  it("rejects unrecognized lifecycle values", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          machines: [{ ...machine, productionState: "testing" }],
          page: 1,
          pageSize: 25,
          total: 1,
        }),
        { status: 200 },
      ),
    );
    await expect(
      searchMachines({}, fetcher, createTestEnvironment()),
    ).rejects.toThrow();
  });

  it("retains a visible identity conflict response", async () => {
    const error = new InventoryRequestError(409, {
      statusCode: 409,
      code: "identity_conflict",
      message: "Duplicate",
      conflictingMachineId: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
      machine: {
        ...machine,
        identityVerificationState: "conflict",
        conflictingMachineId: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
        version: 2,
      },
    });
    expect(error.identityConflict()).toMatchObject({
      conflictingMachineId: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
    });
  });
});
