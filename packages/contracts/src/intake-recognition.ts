import { z } from "zod";

export const IntakeRecognitionFieldSchema = z.enum([
  "machineType",
  "manufacturer",
  "model",
  "serial",
  "voltage",
  "phase",
  "fuel",
  "capacityLb",
]);
export const IntakeRecognitionReasonSchema = z.enum([
  "accepted",
  "policy_unconfigured",
  "low_confidence",
  "missing_critical_fact",
  "ocr_disagreement",
  "unsupported_evidence",
  "blur",
  "glare",
  "cutoff",
  "small_text",
  "unreadable",
  "ambiguous_grouping",
  "conflicting_evidence",
  "exact_identity_match",
  "warning_review",
  "provider_unavailable",
  "stale_input",
  "manual_fallback",
  "provider_timeout",
  "malformed_provider_output",
  "output_too_large",
  "checksum_mismatch",
  "missing_analysis_bytes",
  "ambiguous_characters",
  "invalid_identity_value",
  "missing_evidence",
  "invalid_evidence_reference",
]);
export const IntakeRecognitionStateSchema = z.enum([
  "queued",
  "running",
  "ready",
  "needs_recapture",
  "failed",
  "stale",
  "manual",
]);
export const IntakeRecognitionProviderSchema = z.enum([
  "openai",
  "gemini",
  "paddleocr",
  "fake",
  "disabled",
]);
export const IntakeEvidenceBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((b) => b.x + b.width <= 1 && b.y + b.height <= 1);
export const IntakeOcrLineSchema = z.object({
  lineId: z.string().trim().min(1).max(100).optional(),
  photoId: z.uuid(),
  text: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  box: IntakeEvidenceBoxSchema,
});
export const IntakeSemanticSchemaVersionSchema = z.union([
  z.literal("intake-v1"),
  z.literal("intake-nameplate-v2"),
]);
export const IntakeSemanticResultSchema = z.object({
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  schemaVersion: IntakeSemanticSchemaVersionSchema,
  requestId: z.string().max(200).nullable(),
  groups: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        photoIds: z.array(z.uuid()).min(1).max(100),
        confidence: z.number().min(0).max(1),
        fields: z
          .array(
            z.object({
              field: IntakeRecognitionFieldSchema,
              value: z.string().trim().min(1).max(240).nullable(),
              confidence: z.number().min(0).max(1),
              photoId: z.uuid(),
              box: IntakeEvidenceBoxSchema,
              ocrLineIds: z
                .array(z.string().trim().min(1).max(100))
                .max(20)
                .optional(),
            }),
          )
          .max(70),
        quality: z
          .array(
            z.object({
              photoId: z.uuid(),
              reason: z.enum([
                "blur",
                "glare",
                "cutoff",
                "small_text",
                "unreadable",
              ]),
            }),
          )
          .max(100),
      }),
    )
    .max(100),
});
export const IntakeOcrResultSchema = z.object({
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  lines: z.array(IntakeOcrLineSchema).max(3000),
});
export const IntakeFieldVerificationSchema = z.object({
  field: IntakeRecognitionFieldSchema,
  semanticValue: z.string().max(240).nullable(),
  ocrValue: z.string().max(240).nullable(),
  normalizedSemantic: z.string().max(240).nullable(),
  normalizedOcr: z.string().max(240).nullable(),
  agrees: z.boolean(),
  verifier: z.string().max(80),
  verifierModel: z.string().max(120),
  ocrLineIds: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  correction: z
    .object({
      from: z.string().max(240),
      to: z.string().max(240),
      reason: z.string().max(240),
    })
    .optional(),
});
export const IntakeFieldDecisionSchema = z.object({
  field: IntakeRecognitionFieldSchema,
  value: z.string().max(240).nullable(),
  accepted: z.boolean(),
  reason: IntakeRecognitionReasonSchema,
  photoId: z.uuid().nullable(),
  box: IntakeEvidenceBoxSchema.nullable(),
  verifierAgreement: z.boolean(),
  verification: IntakeFieldVerificationSchema.optional(),
  ocrLineIds: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  correction: z
    .object({
      from: z.string().max(240),
      to: z.string().max(240),
      reason: z.string().max(240),
    })
    .optional(),
  ambiguity: z
    .object({
      alternatives: z.array(z.string().max(240)).min(2).max(4),
      reason: z.string().max(240),
    })
    .optional(),
});
export const IntakeGroupDecisionSchema = z.object({
  key: z.string().max(80),
  photoIds: z.array(z.uuid()).max(100),
  accepted: z.boolean(),
  reasons: z.array(IntakeRecognitionReasonSchema),
  fields: z.array(IntakeFieldDecisionSchema),
  quality: z
    .array(
      z.object({ photoId: z.uuid(), reason: IntakeRecognitionReasonSchema }),
    )
    .optional(),
});
export const IntakeRecognitionAttemptMetricSchema = z.strictObject({
  attempt: z.number().int().min(1).max(20),
  preparationMs: z.number().int().min(0).max(600_000),
  ocrMs: z.number().int().min(0).max(600_000),
  semanticMs: z.number().int().min(0).max(600_000),
  totalMs: z.number().int().min(0).max(600_000),
  ocrBytes: z
    .number()
    .int()
    .min(0)
    .max(200 * 1024 * 1024),
  semanticBytes: z
    .number()
    .int()
    .min(0)
    .max(200 * 1024 * 1024),
  outcome: z.enum(["ready", "needs_recapture", "failed", "retry"]),
  errorCode: IntakeRecognitionReasonSchema.nullable(),
});
export const IntakeRecognitionProvenanceSchema = z.object({
  provider: z.string().max(80),
  model: z.string().max(120),
  schemaVersion: z.string().max(120),
  verifier: z.string().max(80),
  verifierModel: z.string().max(120),
  policyVersion: z.string().max(120),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceChecksums: z
    .record(z.string(), z.string().regex(/^[a-f0-9]{64}$/))
    .default({}),
  attempts: z.array(IntakeRecognitionAttemptMetricSchema).max(20).optional(),
});
export const IntakeRecognitionRunSchema = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  photoId: z.uuid().nullable().optional(),
  candidateId: z.uuid().nullable().optional(),
  candidateRevision: z.number().int().positive().nullable().optional(),
  state: IntakeRecognitionStateSchema,
  inputVersion: z.number().int().positive(),
  policyVersion: z.string().max(120),
  provider: z.string().max(80),
  model: z.string().max(120),
  errorCode: IntakeRecognitionReasonSchema.nullable(),
  groups: z.array(IntakeGroupDecisionSchema),
  provenance: IntakeRecognitionProvenanceSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const IntakeRecaptureSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  batchId: z.uuid(),
  candidateId: z.uuid().nullable(),
  photoIds: z.array(z.uuid()),
  field: IntakeRecognitionFieldSchema.nullable(),
  reason: IntakeRecognitionReasonSchema,
  instruction: z.string().max(500),
  state: z.enum(["open", "evidence_received", "resolved", "manual"]),
  resolvedByUserId: z.string().nullable(),
});
export const IntakeRecognitionStatusSchema = z.object({
  enabled: z.boolean(),
  latestRun: IntakeRecognitionRunSchema.nullable(),
  runs: z.array(IntakeRecognitionRunSchema).max(200).optional(),
  recaptures: z.array(IntakeRecaptureSchema),
});
export const RequestIntakeRecognitionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    retry: z.boolean().default(false),
    photoId: z.uuid().optional(),
    candidateId: z.uuid().optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.photoId) !== Boolean(value.candidateId)) {
      context.addIssue({
        code: "custom",
        path: ["photoId"],
        message: "photoId and candidateId must be supplied together",
      });
    }
  });
export const IntakeRecaptureEvidenceSchema = z.object({
  fileId: z.uuid(),
  expectedVersion: z.number().int().positive(),
});
export type IntakeSemanticResult = z.infer<typeof IntakeSemanticResultSchema>;
export type IntakeOcrResult = z.infer<typeof IntakeOcrResultSchema>;
export type IntakeOcrLine = z.infer<typeof IntakeOcrLineSchema>;
export type IntakeGroupDecision = z.infer<typeof IntakeGroupDecisionSchema>;
export type IntakeRecognitionRun = z.infer<typeof IntakeRecognitionRunSchema>;
export type IntakeRecognitionAttemptMetric = z.infer<
  typeof IntakeRecognitionAttemptMetricSchema
>;
export type IntakeRecapture = z.infer<typeof IntakeRecaptureSchema>;
export type IntakeRecognitionStatus = z.infer<
  typeof IntakeRecognitionStatusSchema
>;
export type IntakeRecognitionReason = z.infer<
  typeof IntakeRecognitionReasonSchema
>;
export type IntakeRecognitionField = z.infer<
  typeof IntakeRecognitionFieldSchema
>;
export type IntakeRecognitionState = z.infer<
  typeof IntakeRecognitionStateSchema
>;
export type IntakeRecognitionProvider = z.infer<
  typeof IntakeRecognitionProviderSchema
>;
export type IntakeFieldVerification = z.infer<
  typeof IntakeFieldVerificationSchema
>;
export type IntakeFieldDecision = z.infer<typeof IntakeFieldDecisionSchema>;
export type IntakeRecognitionProvenance = z.infer<
  typeof IntakeRecognitionProvenanceSchema
>;
export type RequestIntakeRecognition = z.infer<
  typeof RequestIntakeRecognitionSchema
>;
export type IntakeRecaptureEvidence = z.infer<
  typeof IntakeRecaptureEvidenceSchema
>;
