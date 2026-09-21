import { describe, expect, it } from "vitest";

import {
  ImportApprovalRequestSchema,
  ImportCandidateSchema,
  ImportFindingCodeSchema,
  ImportRowListQuerySchema,
  OperationsActionSchema,
  OperationsTargetTypeSchema,
} from "../src/index.js";

describe("inventory import contracts", () => {
  it("accepts bounded review input and explicit import operations", () => {
    expect(ImportRowListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 50,
    });
    expect(
      ImportApprovalRequestSchema.safeParse({
        expectedVersion: 1,
        rowIds: ["3498c172-93d8-4eca-b0f6-0e70fe03516c"],
      }).success,
    ).toBe(true);
    expect(OperationsActionSchema.parse("imports.run.committed")).toBe(
      "imports.run.committed",
    );
    expect(OperationsTargetTypeSchema.parse("import_run")).toBe("import_run");
  });

  it("keeps unknown facts nullable and rejects invented codes or unbounded review", () => {
    expect(
      ImportCandidateSchema.parse({
        machineType: "other",
        manufacturer: null,
        model: null,
        serial: null,
        inventoryState: "expected",
      }),
    ).toMatchObject({ manufacturer: null, serial: null });
    expect(ImportFindingCodeSchema.safeParse("guessed_voltage").success).toBe(
      false,
    );
    expect(
      ImportApprovalRequestSchema.safeParse({
        expectedVersion: 1,
        rowIds: ["bad"],
      }).success,
    ).toBe(false);
  });
});
