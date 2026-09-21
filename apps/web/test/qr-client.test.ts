import { createTestEnvironment } from "@simply-clean/test-support";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createQrLabel,
  getPrintableQrLabel,
  listMachineQrLabels,
  resolveQrLabel,
} from "../src/lib/qr-client";

const timestamp = new Date().toISOString();
const machineId = "3498c172-93d8-4eca-b0f6-0e70fe03516c";
const label = {
  id: "a6ebd4ca-f41a-4e94-a247-b0b359a65d66",
  machineId,
  fallbackCode: "0123456789ABCDEF",
  state: "active" as const,
  version: 1,
  issuedByUserId: "warehouse-1",
  revokedByUserId: null,
  issuedAt: timestamp,
  revokedAt: null,
};
const machine = {
  id: machineId,
  machineType: "washer" as const,
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
  identityVerificationState: "provisional" as const,
  conflictingMachineId: null,
  inventoryState: "expected" as const,
  productionState: "not_started" as const,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

afterEach(() => vi.unstubAllGlobals());

describe("QR label client", () => {
  it("validates label history and forwards the server session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ labels: [label] }), { status: 200 }),
      );

    await expect(
      listMachineQrLabels(
        machineId,
        fetcher,
        createTestEnvironment(),
        "session=cookie",
      ),
    ).resolves.toEqual([label]);
    expect(fetcher).toHaveBeenCalledWith(
      `http://localhost:3001/inventory/machines/${machineId}/qr-labels`,
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "session=cookie" }),
      }),
    );
  });

  it("rejects an unrecognized label lifecycle response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ labels: [{ ...label, state: "superseded" }] }),
          { status: 200 },
        ),
      );

    await expect(
      listMachineQrLabels(machineId, fetcher, createTestEnvironment()),
    ).rejects.toThrow();
  });

  it("reuses one idempotency key when label creation retries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValue(
        new Response(JSON.stringify({ label }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(createQrLabel(machineId)).resolves.toEqual(label);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = fetcher.mock.calls[0]![1]!;
    const second = fetcher.mock.calls[1]![1]!;
    expect(first.body).toBe(JSON.stringify({}));
    expect((first.headers as Record<string, string>)["idempotency-key"]).toBe(
      (second.headers as Record<string, string>)["idempotency-key"],
    );
  });

  it("submits a fragment token only in the protected POST body", async () => {
    const token =
      "v1.4498c172-93d8-4eca-b0f6-0e70fe03516c.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
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
    vi.stubGlobal("fetch", fetcher);

    await expect(resolveQrLabel({ token })).resolves.toMatchObject({
      machine: { id: machineId },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/inventory/qr-labels/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    );
    expect(fetcher.mock.calls[0]![0]).not.toContain(token);
  });

  it("accepts only an SVG print response and preserves its safe filename", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<svg></svg>", {
        status: 200,
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "content-disposition":
            'attachment; filename="simply-clean-equipment-0123456789ABCDEF.svg"',
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(getPrintableQrLabel(label.id)).resolves.toMatchObject({
      filename: "simply-clean-equipment-0123456789ABCDEF.svg",
      blob: expect.any(Blob),
    });
  });
});
