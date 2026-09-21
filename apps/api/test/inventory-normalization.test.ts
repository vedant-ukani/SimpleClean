import { describe, expect, it } from "vitest";

import { normalizeManufacturerMatchValue } from "../src/modules/inventory/normalization.js";

describe("inventory identity normalization", () => {
  it("matches the Speedqueen alias without changing its display value", () => {
    expect(normalizeManufacturerMatchValue("Speedqueen")).toBe("speed queen");
    expect(normalizeManufacturerMatchValue("Speed Queen")).toBe("speed queen");
  });
});
