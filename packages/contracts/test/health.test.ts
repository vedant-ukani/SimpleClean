import { describe, expect, it } from "vitest";

import {
  LivenessResponseSchema,
  ReadinessResponseSchema,
} from "../src/index.js";

describe("health contracts", () => {
  it("accepts the public liveness and readiness response shapes", () => {
    expect(
      LivenessResponseSchema.parse({
        status: "ok",
        service: "api",
        timestamp: new Date().toISOString(),
      }).status,
    ).toBe("ok");

    expect(
      ReadinessResponseSchema.parse({
        status: "ready",
        dependencies: { database: "up" },
        timestamp: new Date().toISOString(),
      }).status,
    ).toBe("ready");
  });
});
