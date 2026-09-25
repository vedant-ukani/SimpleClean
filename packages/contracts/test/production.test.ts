import { describe, expect, it } from "vitest";
import {
  BEARING_ASSESSMENTS,
  CreateMachineRequestSchema,
  CreatePreliminaryInspectionRequestSchema,
  INVENTORY_STATES,
  PRELIMINARY_DISPOSITIONS,
  PRODUCTION_STATES,
  RecordPreliminaryDispositionRequestSchema,
  ProductionSpecialtiesSchema,
  RecordTestStepRequestSchema,
  TestAssignRequestSchema,
  TestMutationRequestSchema,
  RecordInitialCheckRequestSchema,
  FinishTestRequestSchema,
  ProductionWorkDestinationSchema,
  SetProductionSpecialtiesRequestSchema,
  CreateTestSessionRequestSchema,
  AddTestSessionOrdersRequestSchema,
  ChangeTestSessionItemRequestSchema,
  ReportBearingConcernRequestSchema,
} from "../src/index.js";

const id = "3498c172-93d8-4eca-b0f6-0e70fe03516c";
const valid = {
  expectedMachineVersion: 1,
  condition: "Drum turns",
  bearingAssessment: "concern_observed",
  bearingNotes: "Audible noise",
  missingParts: "",
  damage: "",
  recommendation: "parts_only",
  reason: "Owner economic review",
  evidenceFileIds: [id],
};

describe("preliminary Production contracts", () => {
  it("keeps observations separate from dispositions and accepts bounded evidence", () => {
    expect(BEARING_ASSESSMENTS).toEqual([
      "no_concern_observed",
      "concern_observed",
      "not_applicable",
      "unable_to_assess",
    ]);
    expect(PRELIMINARY_DISPOSITIONS).toEqual([
      "repairable",
      "hold",
      "parts_only",
      "scrap",
      "owner_review",
    ]);
    expect(CreatePreliminaryInspectionRequestSchema.parse(valid)).toMatchObject(
      valid,
    );
    expect(
      CreatePreliminaryInspectionRequestSchema.safeParse({
        ...valid,
        evidenceFileIds: [id, id],
      }).success,
    ).toBe(false);
    expect(
      CreatePreliminaryInspectionRequestSchema.safeParse({
        ...valid,
        condition: "",
      }).success,
    ).toBe(false);
    expect(
      CreatePreliminaryInspectionRequestSchema.safeParse({
        ...valid,
        bearingAssessment: "scrap",
      }).success,
    ).toBe(false);
  });

  it("limits current states and direct Machine creation", () => {
    expect(INVENTORY_STATES).toContain("scrapped");
    expect(PRODUCTION_STATES).toEqual([
      "not_assessed",
      "preliminary_passed",
      "awaiting_test",
      "testing",
      "awaiting_repair",
      "awaiting_clean",
      "blocked",
    ]);
    expect(PRODUCTION_STATES).not.toContain("qa_released" as never);
    expect(
      CreateMachineRequestSchema.safeParse({
        machineType: "washer",
        sourceLoadId: id,
        inventoryState: "scrapped",
      }).success,
    ).toBe(false);
    expect(
      RecordPreliminaryDispositionRequestSchema.parse({
        expectedMachineVersion: 2,
        disposition: "scrap",
        reason: "Owner decision",
      }),
    ).toMatchObject({ disposition: "scrap" });
  });
});

describe("Test Work Order contracts", () => {
  it("accepts one current Production assignment and bounded group commands", () => {
    expect(
      SetProductionSpecialtiesRequestSchema.parse({ specialties: [] }),
    ).toEqual({ specialties: [] });
    expect(
      SetProductionSpecialtiesRequestSchema.parse({ specialties: ["washer"] }),
    ).toEqual({ specialties: ["washer"] });
    expect(
      SetProductionSpecialtiesRequestSchema.safeParse({
        specialties: ["washer", "dryer"],
      }).success,
    ).toBe(false);
    const order = { orderId: id, expectedVersion: 1 };
    expect(
      CreateTestSessionRequestSchema.parse({ orders: [order] }).orders,
    ).toHaveLength(1);
    expect(
      CreateTestSessionRequestSchema.safeParse({ orders: [order, order] })
        .success,
    ).toBe(false);
    expect(
      CreateTestSessionRequestSchema.safeParse({
        orders: Array.from({ length: 21 }, (_, index) => ({
          orderId:
            index === 0
              ? id
              : `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
          expectedVersion: 1,
        })),
      }).success,
    ).toBe(false);
    expect(
      AddTestSessionOrdersRequestSchema.safeParse({
        expectedVersion: 1,
        orders: [order],
      }).success,
    ).toBe(true);
    expect(
      ChangeTestSessionItemRequestSchema.safeParse({
        expectedVersion: 1,
        state: "waiting",
      }).success,
    ).toBe(true);
    expect(
      ChangeTestSessionItemRequestSchema.safeParse({
        expectedVersion: 1,
        state: "completed",
      }).success,
    ).toBe(false);
    expect(
      ReportBearingConcernRequestSchema.safeParse({
        expectedVersion: 1,
        notes: "typed",
      }).success,
    ).toBe(false);
    expect(
      ProductionWorkDestinationSchema.parse({
        kind: "session",
        sessionId: id,
        orderId: id,
      }),
    ).toMatchObject({ kind: "session" });
  });
  it("keeps specialties separate from roles and accepts only bounded tap results", () => {
    expect(ProductionSpecialtiesSchema.parse(["washer", "dryer"])).toEqual([
      "washer",
      "dryer",
    ]);
    expect(
      ProductionSpecialtiesSchema.safeParse(["washer", "washer"]).success,
    ).toBe(false);
    expect(ProductionSpecialtiesSchema.safeParse(["other"]).success).toBe(
      false,
    );
    expect(
      RecordTestStepRequestSchema.parse({
        expectedVersion: 2,
        stepKey: "washer_14",
        result: "na",
      }),
    ).toMatchObject({ fileId: null, result: "na" });
    expect(
      RecordTestStepRequestSchema.safeParse({
        expectedVersion: 2,
        stepKey: "washer_01",
        result: "pass",
        notes: "typed",
      }).success,
    ).toBe(false);
    expect(
      RecordTestStepRequestSchema.safeParse({
        expectedVersion: 2,
        stepKey: "washer_01",
        result: "skipped",
      }).success,
    ).toBe(false);
    expect(
      TestAssignRequestSchema.safeParse({
        expectedVersion: 1,
        userId: null,
        reason: "extra",
      }).success,
    ).toBe(false);
    expect(
      TestMutationRequestSchema.safeParse({ expectedVersion: 0 }).success,
    ).toBe(false);
  });
  it("keeps initial-check choices closed and requires an explicit success-video reference", () => {
    expect(
      RecordInitialCheckRequestSchema.parse({
        expectedMachineVersion: 1,
        choice: "smooth",
      }).choice,
    ).toBe("smooth");
    expect(
      RecordInitialCheckRequestSchema.safeParse({
        expectedMachineVersion: 1,
        choice: "scrap",
      }).success,
    ).toBe(false);
    expect(
      RecordInitialCheckRequestSchema.safeParse({
        expectedMachineVersion: 1,
        choice: "smooth",
        notes: "typed",
      }).success,
    ).toBe(false);
    expect(
      FinishTestRequestSchema.safeParse({ expectedVersion: 2 }).success,
    ).toBe(false);
    expect(
      FinishTestRequestSchema.parse({
        expectedVersion: 2,
        expectedSessionVersion: 3,
        videoFileId: null,
      }).videoFileId,
    ).toBeNull();
    expect(
      ProductionWorkDestinationSchema.parse({
        kind: "initial_check",
        machineId: id,
      }),
    ).toEqual({ kind: "initial_check", machineId: id });
  });
});
