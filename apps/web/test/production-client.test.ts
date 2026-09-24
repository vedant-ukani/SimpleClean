import { createTestEnvironment } from "@simply-clean/test-support";
import { describe, expect, it, vi } from "vitest";
import { postBrowserJson } from "../src/lib/api-client";
import { getPreliminaryHistory } from "../src/lib/production-client";

describe("Production client", () => {
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

  it("parses server history and preserves failed request status", async () => {
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
