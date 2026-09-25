import { createTestEnvironment } from "@laundrorama/test-support";
import { describe, expect, it, vi } from "vitest";

import {
  ApiRequestError,
  getPlatformHealth,
  getServerJson,
} from "../src/lib/api-client";

describe("platform health client", () => {
  it("validates API responses through the shared contracts", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            service: "api",
            timestamp: new Date().toISOString(),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ready",
            dependencies: { database: "up" },
            timestamp: new Date().toISOString(),
          }),
          { status: 200 },
        ),
      );

    await expect(
      getPlatformHealth(fetcher, createTestEnvironment()),
    ).resolves.toMatchObject({
      live: { status: "ok" },
      ready: { status: "ready" },
    });
  });

  it("forwards the server session and disables caching for protected reads", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await expect(
      getServerJson(
        "/catalog/models?query=T-400",
        fetcher,
        createTestEnvironment(),
        "session=cookie",
      ),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:3001/catalog/models?query=T-400",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json", cookie: "session=cookie" },
      }),
    );
  });

  it("preserves HTTP status for protected route-state handling", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 403 }), { status: 403 }),
      );

    await expect(
      getServerJson("/catalog/models", fetcher, createTestEnvironment()),
    ).rejects.toBeInstanceOf(ApiRequestError);
    await expect(
      getServerJson("/catalog/models", fetcher, createTestEnvironment()),
    ).rejects.toMatchObject({ status: 403, detail: { statusCode: 403 } });
  });
});
