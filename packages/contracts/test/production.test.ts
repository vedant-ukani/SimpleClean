import { describe, expect, it } from "vitest";
import {
  BEARING_ASSESSMENTS,
  CreateMachineRequestSchema,
  CreatePreliminaryInspectionRequestSchema,
  INVENTORY_STATES,
  PRELIMINARY_DISPOSITIONS,
  PRODUCTION_STATES,
  RecordPreliminaryDispositionRequestSchema,
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
