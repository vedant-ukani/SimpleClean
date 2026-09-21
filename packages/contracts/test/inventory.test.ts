import { describe, expect, it } from "vitest";

import {
  CreateMachineRequestSchema,
  MachineSchema,
  MachineSearchQuerySchema,
  UpdateMachineIdentityRequestSchema,
} from "../src/index.js";

describe("inventory contracts", () => {
  it("accepts a minimal provisional machine and bounded search defaults", () => {
    expect(
      CreateMachineRequestSchema.parse({
        machineType: "washer",
        sourceLoadId: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
      }),
    ).toMatchObject({
      machineType: "washer",
      sourceKind: "manual",
      inventoryState: "expected",
    });
    expect(MachineSearchQuerySchema.parse({})).toEqual({
      query: "",
      page: 1,
      pageSize: 25,
    });
  });

  it("rejects unknown controlled values and identity edits without changes", () => {
    expect(
      CreateMachineRequestSchema.safeParse({
        machineType: "washer_dryer",
        sourceLoadId: "3498c172-93d8-4eca-b0f6-0e70fe03516c",
      }).success,
    ).toBe(false);
    expect(
      UpdateMachineIdentityRequestSchema.safeParse({ expectedVersion: 1 })
        .success,
    ).toBe(false);
    expect(
      MachineSchema.safeParse({
        id: "not-a-uuid",
        productionState: "testing",
      }).success,
    ).toBe(false);
  });
});
