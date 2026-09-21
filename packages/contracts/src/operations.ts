import { z } from "zod";

export const OPERATIONS_ACTIONS = [
  "identity.user.created",
  "identity.user.role_changed",
  "identity.user.activated",
  "identity.user.deactivated",
  "identity.user.sessions_revoked",
  "identity.user.provisioned",
  "inventory.load.created",
  "inventory.load.updated",
  "inventory.location.created",
  "inventory.location.updated",
  "inventory.location.deactivated",
  "inventory.machine.created",
  "inventory.machine.identity_updated",
  "inventory.machine.verified",
  "inventory.machine.identity_conflict",
  "inventory.machine.relocated",
  "files.attachment.requested",
  "files.attachment.ready",
  "files.attachment.failed",
  "files.attachment.abandoned",
  "operations.job.requeued",
] as const;

export const OPERATIONS_TARGET_TYPES = [
  "user",
  "session",
  "load",
  "location",
  "machine",
  "file",
  "outbox_job",
] as const;

export const AuditActorKindSchema = z.enum(["user", "system"]);
export const OperationsActionSchema = z.enum(OPERATIONS_ACTIONS);
export const OperationsTargetTypeSchema = z.enum(OPERATIONS_TARGET_TYPES);
export const OutboxJobStateSchema = z.enum([
  "queued",
  "processing",
  "retry_wait",
  "delivered",
  "dead_letter",
]);

const SafeFieldNameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/);

export const SafeMutationSummarySchema = z
  .object({
    changedFields: z.array(SafeFieldNameSchema).max(40).default([]),
    outcome: SafeFieldNameSchema.optional(),
  })
  .strict();

export const AuditEntrySchema = z.object({
  id: z.uuid(),
  actorKind: AuditActorKindSchema,
  actorUserId: z.string().min(1).nullable(),
  action: OperationsActionSchema,
  targetType: OperationsTargetTypeSchema,
  targetId: z.string().min(1).max(200),
  requestId: z.string().min(1).max(200),
  summary: SafeMutationSummarySchema,
  createdAt: z.iso.datetime(),
});

export const OutboxJobSchema = z.object({
  id: z.uuid(),
  eventType: OperationsActionSchema,
  targetType: OperationsTargetTypeSchema,
  targetId: z.string().min(1).max(200),
  state: OutboxJobStateSchema,
  attemptCount: z.number().int().nonnegative(),
  availableAt: z.iso.datetime(),
  leaseExpiresAt: z.iso.datetime().nullable(),
  errorCode: z.string().min(1).max(80).nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const AuditListQuerySchema = z
  .object({
    action: OperationsActionSchema.optional(),
    targetType: OperationsTargetTypeSchema.optional(),
    targetId: z.string().min(1).max(200).optional(),
    actorUserId: z.string().min(1).max(200).optional(),
    requestId: z.string().min(1).max(200).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .superRefine((query, context) => {
    if (query.targetId && !query.targetType) {
      context.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "is required when targetId is provided",
      });
    }
  });

export const JobListQuerySchema = z.object({
  state: OutboxJobStateSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const RetryOutboxJobRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const AuditListResponseSchema = z.object({
  entries: z.array(AuditEntrySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const JobListResponseSchema = z.object({
  jobs: z.array(OutboxJobSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const OutboxJobResponseSchema = z.object({ job: OutboxJobSchema });

export const IdempotencyKeySchema = z.string().min(16).max(200);

export type AuditActorKind = z.infer<typeof AuditActorKindSchema>;
export type OperationsAction = z.infer<typeof OperationsActionSchema>;
export type OperationsTargetType = z.infer<typeof OperationsTargetTypeSchema>;
export type OutboxJobState = z.infer<typeof OutboxJobStateSchema>;
export type SafeMutationSummary = z.infer<typeof SafeMutationSummarySchema>;
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type OutboxJob = z.infer<typeof OutboxJobSchema>;
export type AuditListQuery = z.infer<typeof AuditListQuerySchema>;
export type JobListQuery = z.infer<typeof JobListQuerySchema>;
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;
export type JobListResponse = z.infer<typeof JobListResponseSchema>;
