import { describe, expect, it } from "vitest";
import {
  IntakeRecognitionAttemptMetricSchema,
  IntakeRecognitionProvenanceSchema,
} from "../src/intake-recognition.js";

const provenance = {
  provider: "fake",
  model: "deterministic-v1",
  schemaVersion: "intake-nameplate-v2",
  verifier: "fake",
  verifierModel: "deterministic-v1",
  policyVersion: "intake-nameplate-policy-v2",
  inputFingerprint: "a".repeat(64),
  sourceChecksums: {},
};
const attempt = {
  attempt: 1,
  preparationMs: 1,
  ocrMs: 2,
  semanticMs: 3,
  totalMs: 7,
  ocrBytes: 1_000,
  semanticBytes: 500,
  outcome: "ready" as const,
  errorCode: null,
};

describe("recognition attempt provenance", () => {
  it("keeps older provenance valid and accepts bounded safe metrics", () => {
    expect(
      IntakeRecognitionProvenanceSchema.parse(provenance).attempts,
    ).toBeUndefined();
    expect(
      IntakeRecognitionProvenanceSchema.parse({
        ...provenance,
        attempts: [attempt],
      }).attempts,
    ).toEqual([attempt]);
  });

  it("bounds durations, bytes, and the number of attempts", () => {
    expect(
      IntakeRecognitionAttemptMetricSchema.safeParse({
        ...attempt,
        preparationMs: -1,
      }).success,
    ).toBe(false);
    expect(
      IntakeRecognitionAttemptMetricSchema.safeParse({
        ...attempt,
        totalMs: 600_001,
      }).success,
    ).toBe(false);
    expect(
      IntakeRecognitionAttemptMetricSchema.safeParse({
        ...attempt,
        semanticBytes: 200 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
    expect(
      IntakeRecognitionProvenanceSchema.safeParse({
        ...provenance,
        attempts: Array(21).fill(attempt),
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe outcomes, error codes, and extra evidence fields", () => {
    expect(
      IntakeRecognitionAttemptMetricSchema.safeParse({
        ...attempt,
        outcome: "raw-provider-error",
      }).success,
    ).toBe(false);
    expect(
      IntakeRecognitionAttemptMetricSchema.safeParse({
        ...attempt,
        errorCode: "serial-value",
      }).success,
    ).toBe(false);
    expect(
      IntakeRecognitionAttemptMetricSchema.safeParse({
        ...attempt,
        ocrText: "private evidence",
      }).success,
    ).toBe(false);
  });
});
