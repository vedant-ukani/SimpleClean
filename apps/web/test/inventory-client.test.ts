import { createTestEnvironment } from "@laundrorama/test-support";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLoad,
  getMachine,
  getBrowserMachine,
  InventoryRequestError,
  searchMachines,
  updateMachineActualSpecs,
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
  identityVerificationState: "provisional",
  conflictingMachineId: null,
  inventoryState: "expected",
  productionState: "not_assessed",
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

afterEach(() => vi.unstubAllGlobals());

describe("inventory client", () => {
  it("refreshes Machine details through the private same-origin endpoint", async () => {
    const detail = {
      machine,
      identityEvidence: [],
      verificationHistory: [],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(detail)));
    vi.stubGlobal("fetch", fetcher);
    await expect(getBrowserMachine(machine.id)).resolves.toMatchObject(detail);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/inventory/machines/${machine.id}`,
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
  });

  it("saves actual measurements with their own version and parses refreshed details", async () => {
    const detail = {
      machine,
      identityEvidence: [],
      verificationHistory: [],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(detail)));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      updateMachineActualSpecs(machine.id, {
        widthIn: 31.5,
        weightLb: null,
        expectedVersion: 0,
      }),
    ).resolves.toMatchObject(detail);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/inventory/machines/${machine.id}/actual-specs`,
      expect.objectContaining({
        method: "PATCH",
        cache: "no-store",
        body: JSON.stringify({
          widthIn: 31.5,
          weightLb: null,
          expectedVersion: 0,
        }),
      }),
    );
  });

  it("sends a fresh idempotency key for a browser create attempt", async () => {
    const response = {
      id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
      displayName: "Incoming Load",
      sourceName: null,
      sourceReference: null,
      expectedArrivalAt: null,
      receivedAt: null,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValue(new Response(JSON.stringify({ load: response })));
    vi.stubGlobal("fetch", fetcher);
    await expect(createLoad({ displayName: "Incoming Load" })).resolves.toEqual(
      response,
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/api/inventory/loads",
      expect.objectContaining({
        headers: expect.objectContaining({
          "idempotency-key": expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      (fetcher.mock.calls[0]![1]!.headers as Record<string, string>)[
        "idempotency-key"
      ],
    ).toBe(
      (fetcher.mock.calls[1]![1]!.headers as Record<string, string>)[
        "idempotency-key"
      ],
    );
  });

  it("forwards the session and validates Machine details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          machine,
          identityEvidence: [],
          verificationHistory: [],
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
    ).resolves.toMatchObject({ machine: { productionState: "not_assessed" } });
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
          machines: [{ ...machine, productionState: "qa_released" }],
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
