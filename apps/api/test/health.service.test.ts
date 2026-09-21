import type { DatabaseConnection } from "@simply-clean/database";
import { describe, expect, it } from "vitest";

import { HealthService } from "../src/platform/health.service.js";

function databaseWithReadiness(isReady: boolean): DatabaseConnection {
  return {
    driver: "pglite",
    migrate: async () => undefined,
    isReady: async () => isReady,
    close: async () => undefined,
  };
}

describe("HealthService", () => {
  it("keeps liveness independent from database readiness", async () => {
    const health = new HealthService(databaseWithReadiness(false));
    expect(health.liveness().status).toBe("ok");
    await expect(health.readiness()).resolves.toMatchObject({
      status: "not_ready",
      dependencies: { database: "down" },
    });
  });
});
