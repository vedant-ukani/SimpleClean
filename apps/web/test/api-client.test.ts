import { createTestEnvironment } from "@simply-clean/test-support";
import { describe, expect, it, vi } from "vitest";

import { getPlatformHealth } from "../src/lib/api-client";

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
});
