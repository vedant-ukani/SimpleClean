import { z } from "zod";
import { FileAttachmentSchema } from "./files.js";
import { MachineSchema } from "./inventory.js";

export const BEARING_ASSESSMENTS = [
  "no_concern_observed",
  "concern_observed",
  "not_applicable",
  "unable_to_assess",
] as const;
export const PRELIMINARY_DISPOSITIONS = [
  "repairable",
  "hold",
  "parts_only",
  "scrap",
  "owner_review",
] as const;

export const BearingAssessmentSchema = z.enum(BEARING_ASSESSMENTS);
export const PreliminaryDispositionSchema = z.enum(PRELIMINARY_DISPOSITIONS);
const Id = z.uuid();
const Timestamp = z.iso.datetime();
const Observation = z.string().trim().max(2_000);
const Reason = z.string().trim().min(1).max(2_000);

export const PreliminaryInspectionSchema = z.object({
  id: Id,
  machineId: Id,
  condition: Observation.min(1),
  bearingAssessment: BearingAssessmentSchema,
  bearingNotes: Observation,
  missingParts: Observation,
  damage: Observation,
  recommendation: PreliminaryDispositionSchema,
  recommendationReason: Reason,
  inspectedByUserId: z.string().min(1),
  requestId: z.string().min(1).max(200),
  createdAt: Timestamp,
  evidence: z.array(FileAttachmentSchema),
});

export const PreliminaryDispositionDecisionSchema = z.object({
  id: Id,
  machineId: Id,
  inspectionId: Id,
  disposition: PreliminaryDispositionSchema,
  reason: Reason,
  decidedByUserId: z.string().min(1),
  approvedByUserId: z.string().min(1).nullable(),
  requestId: z.string().min(1).max(200),
  machineVersion: z.number().int().positive(),
  createdAt: Timestamp,
});

export const CreatePreliminaryInspectionRequestSchema = z
  .object({
    expectedMachineVersion: z.number().int().positive(),
    condition: Observation.min(1),
    bearingAssessment: BearingAssessmentSchema,
    bearingNotes: Observation,
    missingParts: Observation,
    damage: Observation,
    recommendation: PreliminaryDispositionSchema,
    reason: Reason,
    evidenceFileIds: z.array(Id).max(12).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.evidenceFileIds).size !== value.evidenceFileIds.length) {
      context.addIssue({
        code: "custom",
        path: ["evidenceFileIds"],
        message: "Evidence IDs must be unique",
      });
    }
  });

export const RecordPreliminaryDispositionRequestSchema = z
  .object({
    expectedMachineVersion: z.number().int().positive(),
    disposition: PreliminaryDispositionSchema,
    reason: Reason,
  })
  .strict();

export const PreliminaryInspectionHistoryResponseSchema = z.object({
  machine: MachineSchema,
  inspections: z.array(PreliminaryInspectionSchema),
  decisions: z.array(PreliminaryDispositionDecisionSchema),
  currentDisposition: PreliminaryDispositionDecisionSchema.nullable(),
});

export type PreliminaryInspection = z.infer<typeof PreliminaryInspectionSchema>;
export type PreliminaryDispositionDecision = z.infer<
  typeof PreliminaryDispositionDecisionSchema
>;
export type CreatePreliminaryInspectionRequest = z.infer<
  typeof CreatePreliminaryInspectionRequestSchema
>;
export type RecordPreliminaryDispositionRequest = z.infer<
  typeof RecordPreliminaryDispositionRequestSchema
>;
export type PreliminaryInspectionHistoryResponse = z.infer<
  typeof PreliminaryInspectionHistoryResponseSchema
>;
