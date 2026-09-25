import { describe, expect, it } from "vitest";

import { IntakeBatchSchema, IntakeFindingCodeSchema } from "../src/index.js";

describe("Intake contracts", () => {
  it("keeps new and historical batches location-free at the application boundary", () => {
    const parsed = IntakeBatchSchema.parse({
      id: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
      loadId: "4498c172-93d8-4eca-b0f6-0e70fe03516c",
      state: "open",
      destinationLocationId: "5498c172-93d8-4eca-b0f6-0e70fe03516c",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(parsed).not.toHaveProperty("destinationLocationId");
    expect(IntakeBatchSchema.keyof().options).not.toContain(
      "destinationLocationId",
    );
    for (const removedCode of [
      "destination_required",
      "destination_inactive",
      "destination_locked",
    ]) {
      expect(IntakeFindingCodeSchema.safeParse(removedCode).success).toBe(
        false,
      );
    }
  });
});
