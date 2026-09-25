import { z } from "zod";
import { CapacityLbSchema } from "./inventory.js";
import {
  CandidateCatalogEnrichmentSchema,
  CatalogTypeSuggestionSchema,
} from "./catalog.js";

export const INTAKE_BATCH_STATES = ["open", "committed"] as const;
export const INTAKE_PHOTO_DISPOSITIONS = [
  "unassigned",
  "excluded",
  "assigned",
] as const;
export const INTAKE_CANDIDATE_STATES = [
  "draft",
  "confirmed",
  "committed",
] as const;
export const INTAKE_WARNING_KINDS = [
  "serial_match",
  "serial_only_match",
  "manufacturer_model_match",
] as const;
export const INTAKE_FINDING_CODES = [
  "batch_not_found",
  "batch_committed",
  "load_mismatch",
  "file_not_ready",
  "file_target_mismatch",
  "file_already_linked",
  "candidate_not_found",
  "candidate_not_confirmed",
  "photo_not_found",
  "photo_not_accounted_for",
  "exact_identity_match",
  "warning_acknowledgement_required",
  "version_conflict",
  "photo_required",
  "machine_type_required",
  "file_invalid",
  "photo_limit",
  "machine_create_failed",
  "idempotency_key_required",
  "idempotency_key_reused",
  "idempotency_in_progress",
  "candidate_committed",
  "candidate_revision_conflict",
  "target_not_found",
  "finish_not_ready",
] as const;

export const IntakeBatchStateSchema = z.enum(INTAKE_BATCH_STATES);
export const IntakePhotoDispositionSchema = z.enum(INTAKE_PHOTO_DISPOSITIONS);
export const IntakeCandidateStateSchema = z.enum(INTAKE_CANDIDATE_STATES);
export const IntakeWarningKindSchema = z.enum(INTAKE_WARNING_KINDS);
export const IntakeFindingCodeSchema = z.enum(INTAKE_FINDING_CODES);

const IdSchema = z.uuid();
const VersionSchema = z.number().int().positive();
const TimestampSchema = z.iso.datetime();
const NullableFactSchema = z.string().max(240).nullable();

export const IntakePhotoSchema = z.object({
  id: IdSchema,
  batchId: IdSchema,
  fileId: IdSchema,
  order: z.number().int().nonnegative(),
  disposition: IntakePhotoDispositionSchema,
  candidateId: IdSchema.nullable(),
  filename: z.string().min(1).max(255),
  mediaType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]),
  state: z.enum(["pending_upload", "ready", "failed", "abandoned"]),
  previewAvailable: z.boolean(),
  createdAt: TimestampSchema,
});

export const IntakeCandidateSchema = z.object({
  id: IdSchema,
  batchId: IdSchema,
  state: IntakeCandidateStateSchema,
  machineType: z.enum(["washer", "dryer", "other"]).nullable(),
  manufacturer: NullableFactSchema,
  model: NullableFactSchema,
  serial: NullableFactSchema,
  voltage: NullableFactSchema,
  phase: z.enum(["single_phase", "three_phase"]).nullable(),
  fuel: z.enum(["gas", "electric", "steam", "other"]).nullable(),
  capacityLb: CapacityLbSchema.optional(),
  confirmationSource: z
    .enum(["manual", "recognition", "manual_fallback"])
    .optional(),
  revision: z.number().int().positive().optional(),
  machineTypeSelectedByUserId: z.string().nullable().optional(),
  machineTypeSelectedAt: TimestampSchema.nullable().optional(),
  catalogTypeSuggestion: CatalogTypeSuggestionSchema.nullable().optional(),
  catalogEnrichment: CandidateCatalogEnrichmentSchema.nullable().optional(),
  warnings: z.array(
    z.object({
      kind: IntakeWarningKindSchema,
      machineIds: z.array(IdSchema),
      acknowledged: z.boolean(),
    }),
  ),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const IntakeBatchSchema = z.object({
  id: IdSchema,
  loadId: IdSchema,
  state: IntakeBatchStateSchema,
  version: VersionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const IntakeBatchDetailSchema = z.object({
  batch: IntakeBatchSchema,
  photos: z.array(IntakePhotoSchema),
  candidates: z.array(IntakeCandidateSchema),
  machineMappings: z.array(
    z.object({ candidateId: IdSchema, machineId: IdSchema }),
  ),
  items: z
    .array(
      z.object({
        candidateId: IdSchema,
        photoId: IdSchema,
        fileId: IdSchema,
        machineType: z.enum(["washer", "dryer", "other"]).nullable(),
        candidateState: IntakeCandidateStateSchema,
        candidateRevision: z.number().int().positive(),
        latestRunId: IdSchema.nullable(),
        latestRunState: z
          .enum([
            "queued",
            "running",
            "ready",
            "needs_recapture",
            "failed",
            "stale",
            "manual",
          ])
          .nullable(),
        machineId: IdSchema.nullable(),
      }),
    )
    .optional(),
});

export const CreateIntakeBatchRequestSchema = z.object({
  loadId: IdSchema,
});

export const LinkIntakePhotoRequestSchema = z.object({
  fileId: IdSchema,
  order: z.number().int().min(0).max(99).optional(),
  expectedVersion: VersionSchema,
});

export const CreateIntakeCandidateRequestSchema = z.object({
  expectedVersion: VersionSchema,
});

export const UpdateIntakeCandidateRequestSchema = z.object({
  machineType: z.enum(["washer", "dryer", "other"]).nullable().optional(),
  manufacturer: z.string().trim().max(240).nullable().optional(),
  model: z.string().trim().max(240).nullable().optional(),
  serial: z.string().trim().max(240).nullable().optional(),
  voltage: z.string().trim().max(240).nullable().optional(),
  phase: z.enum(["single_phase", "three_phase"]).nullable().optional(),
  fuel: z.enum(["gas", "electric", "steam", "other"]).nullable().optional(),
  capacityLb: CapacityLbSchema.optional(),
  expectedVersion: VersionSchema,
});

export const AssignIntakePhotoRequestSchema = z.object({
  photoId: IdSchema,
  candidateId: IdSchema.nullable(),
  expectedVersion: VersionSchema,
});

export const ExcludeIntakePhotoRequestSchema = z.object({
  photoId: IdSchema,
  excluded: z.boolean(),
  expectedVersion: VersionSchema,
});
export const RemoveIntakePhotoRequestSchema = z.object({
  photoId: IdSchema,
  expectedVersion: VersionSchema,
});

export const ConfirmIntakeCandidateRequestSchema = z.object({
  expectedVersion: VersionSchema,
  acknowledgedWarningKinds: z.array(IntakeWarningKindSchema).default([]),
});

export const CommitIntakeBatchRequestSchema = z.object({
  expectedVersion: VersionSchema,
  finishOnly: z.boolean().default(false),
});
export const PrepareIntakeItemRequestSchema = z.object({
  fileId: IdSchema,
  expectedVersion: VersionSchema,
});
export const ChangeIntakeCandidateTypeRequestSchema = z.object({
  machineType: z.enum(["washer", "dryer", "other"]),
  expectedVersion: VersionSchema,
});
export const ChangeIntakeCandidateCapacityRequestSchema = z.object({
  capacityLb: CapacityLbSchema,
  expectedVersion: VersionSchema,
});
export const CommitIntakeCandidateRequestSchema = z.object({
  expectedVersion: VersionSchema,
  acknowledgedWarningKinds: z.array(IntakeWarningKindSchema).default([]),
});

export const IntakeBatchResponseSchema = z.object({ batch: IntakeBatchSchema });
export const IntakeBatchDetailResponseSchema = IntakeBatchDetailSchema;
export const IntakeCommitResponseSchema = z.object({
  batch: IntakeBatchSchema,
  machines: z.array(IdSchema),
  mappings: z.array(z.object({ candidateId: IdSchema, machineId: IdSchema })),
});
export const IntakeCandidateCommitResponseSchema = z.object({
  batch: IntakeBatchSchema,
  candidateId: IdSchema,
  machineId: IdSchema,
});

export type IntakeBatchState = z.infer<typeof IntakeBatchStateSchema>;
export type IntakePhotoDisposition = z.infer<
  typeof IntakePhotoDispositionSchema
>;
export type IntakeCandidateState = z.infer<typeof IntakeCandidateStateSchema>;
export type IntakeWarningKind = z.infer<typeof IntakeWarningKindSchema>;
export type IntakeFindingCode = z.infer<typeof IntakeFindingCodeSchema>;
export type IntakePhoto = z.infer<typeof IntakePhotoSchema>;
export type IntakeCandidate = z.infer<typeof IntakeCandidateSchema>;
export type IntakeBatch = z.infer<typeof IntakeBatchSchema>;
export type IntakeBatchDetail = z.infer<typeof IntakeBatchDetailSchema>;
export type CreateIntakeBatchRequest = z.infer<
  typeof CreateIntakeBatchRequestSchema
>;
export type LinkIntakePhotoRequest = z.infer<
  typeof LinkIntakePhotoRequestSchema
>;
export type CreateIntakeCandidateRequest = z.infer<
  typeof CreateIntakeCandidateRequestSchema
>;
export type UpdateIntakeCandidateRequest = z.infer<
  typeof UpdateIntakeCandidateRequestSchema
>;
export type AssignIntakePhotoRequest = z.infer<
  typeof AssignIntakePhotoRequestSchema
>;
export type ExcludeIntakePhotoRequest = z.infer<
  typeof ExcludeIntakePhotoRequestSchema
>;
export type RemoveIntakePhotoRequest = z.infer<
  typeof RemoveIntakePhotoRequestSchema
>;
export type ConfirmIntakeCandidateRequest = z.infer<
  typeof ConfirmIntakeCandidateRequestSchema
>;
export type CommitIntakeBatchRequest = z.infer<
  typeof CommitIntakeBatchRequestSchema
>;
export type PrepareIntakeItemRequest = z.infer<
  typeof PrepareIntakeItemRequestSchema
>;
export type ChangeIntakeCandidateTypeRequest = z.infer<
  typeof ChangeIntakeCandidateTypeRequestSchema
>;
export type ChangeIntakeCandidateCapacityRequest = z.infer<
  typeof ChangeIntakeCandidateCapacityRequestSchema
>;
export type CommitIntakeCandidateRequest = z.infer<
  typeof CommitIntakeCandidateRequestSchema
>;
export type IntakeCommitResponse = z.infer<typeof IntakeCommitResponseSchema>;
export type IntakeCandidateCommitResponse = z.infer<
  typeof IntakeCandidateCommitResponseSchema
>;
