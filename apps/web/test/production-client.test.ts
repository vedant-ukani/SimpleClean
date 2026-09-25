import { createTestEnvironment } from "@laundrorama/test-support";
import { describe, expect, it, vi } from "vitest";
import { postBrowserJson } from "../src/lib/api-client";
import { getActiveTestWork, getPreliminaryHistory } from "../src/lib/production-client";

describe("Production client", () => {
  it("distinguishes a successful no-work response from active-work API failure", async () => {
    const machineId = "3498c172-93d8-4eca-b0f6-0e70fe03516c";
    const noWork = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ orderId: null })));
    await expect(getActiveTestWork(machineId, noWork)).resolves.toBeNull();
    const failed = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: "unavailable" }), { status: 503 }));
    await expect(getActiveTestWork(machineId, failed)).rejects.toMatchObject({ status: 503 });
  });
  it("sends a bounded idempotent protected JSON mutation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    await expect(
      postBrowserJson(
        "/inventory/machines/id/production/inspections",
        { reason: "review" },
        "key-1234567890123456",
        fetcher,
      ),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/inventory/machines/id/production/inspections",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": "key-1234567890123456",
        },
        body: JSON.stringify({ reason: "review" }),
      }),
    );
  });

  it("retries one transport failure with the same idempotency key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    await expect(
      postBrowserJson("/production", { reason: "review" }, "same-key", fetcher),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      "idempotency-key": "same-key",
    });
  });

  it("parses server history and preserves failed request status", async () => {
    const id = "3498c172-93d8-4eca-b0f6-0e70fe03516c";
    const timestamp = new Date().toISOString();
    const valid = {
      machine: {
        id,
        machineType: "washer",
        manufacturer: null,
        model: null,
        serial: null,
        voltage: null,
        phase: null,
        fuel: null,
        sourceLoadId: id,
        sourceLoadDisplayName: "Load",
        identityVerificationState: "provisional",
        conflictingMachineId: null,
        inventoryState: "on_hand",
        productionState: "not_assessed",
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      inspections: [],
      decisions: [],
      currentDisposition: null,
    };
    const validFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(valid)));
    await expect(
      getPreliminaryHistory(id, validFetcher, createTestEnvironment()),
    ).resolves.toMatchObject(valid);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ machine: {}, inspections: [] })),
      );
    await expect(
      getPreliminaryHistory(
        "machine-id",
        fetcher,
        createTestEnvironment(),
        "session=cookie",
      ),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:3001/inventory/machines/machine-id/production",
      expect.objectContaining({
        headers: { accept: "application/json", cookie: "session=cookie" },
      }),
    );
    const rejected = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: "conflict" }), { status: 409 }),
      );
    await expect(
      postBrowserJson("/production", {}, "key-1234567890123456", rejected),
    ).rejects.toMatchObject({
      status: 409,
      detail: { code: "conflict" },
    });
  });
});
