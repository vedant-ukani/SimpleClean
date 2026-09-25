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

export const InitialCheckChoiceSchema = z.enum([
  "smooth",
  "bearing_concern",
  "unable_to_assess",
]);
export const RecordInitialCheckRequestSchema = z
  .object({
    expectedMachineVersion: z.number().int().positive(),
    choice: InitialCheckChoiceSchema,
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

export const ProductionSpecialtySchema = z.enum(["washer", "dryer"]);
export const ProductionSpecialtiesSchema = z
  .array(ProductionSpecialtySchema)
  .max(2)
  .refine(
    (items) => new Set(items).size === items.length,
    "Specialties must be unique",
  );
export const SetProductionSpecialtiesRequestSchema = z
  .object({
    specialties: ProductionSpecialtiesSchema.max(1),
  })
  .strict();
export const ProductionSpecialtyAssignmentSchema = z.object({
  userId: z.string().min(1),
  specialties: ProductionSpecialtiesSchema,
});
export const ProductionSpecialtyListResponseSchema = z.object({
  assignments: z.array(ProductionSpecialtyAssignmentSchema),
});
export const TestStepSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  instruction: z.string().min(1).max(500),
  position: z.number().int().nonnegative(),
  allowNa: z.boolean(),
  stopOnFailure: z.boolean(),
  photoRequired: z.boolean(),
});
export const TestTemplateSchema = z.object({
  id: Id,
  machineType: ProductionSpecialtySchema,
  version: z.number().int().positive(),
  steps: z.array(TestStepSchema).min(1),
});
export const TestResultValueSchema = z.enum(["pass", "fail", "na"]);
export const TestWorkOrderSchema = z.object({
  id: Id,
  machineId: Id,
  machineType: ProductionSpecialtySchema,
  state: z.enum([
    "queued",
    "testing",
    "awaiting_repair",
    "awaiting_clean",
    "cancelled",
  ]),
  assignedUserId: z.string().min(1).nullable(),
  activeSessionId: Id.nullable().optional(),
  queuedAt: Timestamp,
  startedAt: Timestamp.nullable(),
  completedAt: Timestamp.nullable(),
  version: z.number().int().positive(),
});
export const TestClaimEventSchema = z.object({
  id: Id,
  orderId: Id,
  action: z.enum(["claimed", "released", "reassigned"]),
  fromUserId: z.string().min(1).nullable(),
  toUserId: z.string().min(1).nullable(),
  actorUserId: z.string().min(1),
  createdAt: Timestamp,
});
export const TestStepResultSchema = z.object({
  id: Id,
  runId: Id,
  stepKey: TestStepSchema.shape.key,
  result: TestResultValueSchema,
  actorUserId: z.string().min(1),
  fileId: Id.nullable(),
  createdAt: Timestamp,
});
export const TestRunSchema = z.object({
  id: Id,
  orderId: Id,
  template: TestTemplateSchema,
  startedByUserId: z.string().min(1),
  startedAt: Timestamp,
  completedAt: Timestamp.nullable(),
  videoFileId: Id.nullable(),
  results: z.array(TestStepResultSchema),
});
export const TestWorkDetailSchema = z.object({
  order: TestWorkOrderSchema,
  machine: MachineSchema,
  run: TestRunSchema.nullable(),
  claims: z.array(TestClaimEventSchema),
  initialBearingCheck: z
    .object({
      assessment: BearingAssessmentSchema,
      actorUserId: z.string().min(1),
      createdAt: Timestamp,
    })
    .nullable()
    .optional(),
});
export const TestSessionItemStateSchema = z.enum([
  "working",
  "running_cycle",
  "waiting",
  "completed",
  "removed",
]);
export const TestSessionStateSchema = z.enum(["active", "paused", "completed"]);
export const TestSessionEventActionSchema = z.enum([
  "created",
  "added",
  "item_state_changed",
  "paused",
  "resumed",
  "item_completed",
  "item_removed",
  "finished",
]);
export const TestSessionEventSchema = z.object({
  id: Id,
  sessionId: Id,
  orderId: Id.nullable(),
  action: TestSessionEventActionSchema,
  itemState: TestSessionItemStateSchema.nullable(),
  actorUserId: z.string().min(1),
  createdAt: Timestamp,
});
export const TestSessionItemSchema = z.object({
  order: TestWorkDetailSchema,
  state: TestSessionItemStateSchema,
  allocatedSeconds: z.number().int().nonnegative(),
});
export const TestSessionSchema = z.object({
  id: Id,
  workerUserId: z.string().min(1),
  specialty: ProductionSpecialtySchema,
  state: TestSessionStateSchema,
  version: z.number().int().positive(),
  createdAt: Timestamp,
  completedAt: Timestamp.nullable(),
  asOf: Timestamp,
  elapsedSeconds: z.number().int().nonnegative(),
  unallocatedSeconds: z.number().int().nonnegative(),
  items: z.array(TestSessionItemSchema).min(1).max(20),
  events: z.array(TestSessionEventSchema),
});
export const CreateTestSessionRequestSchema = z
  .object({
    orders: z
      .array(
        z
          .object({ orderId: Id, expectedVersion: z.number().int().positive() })
          .strict(),
      )
      .min(1)
      .max(20)
      .refine(
        (items) =>
          new Set(items.map((item) => item.orderId)).size === items.length,
        "Work Order IDs must be unique",
      ),
  })
  .strict();
export const AddTestSessionOrdersRequestSchema =
  CreateTestSessionRequestSchema.extend({
    expectedVersion: z.number().int().positive(),
  }).strict();
export const TestSessionMutationRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const ChangeTestSessionItemRequestSchema =
  TestSessionMutationRequestSchema.extend({
    state: z.enum(["working", "running_cycle", "waiting"]),
  }).strict();
export const TestQueueResponseSchema = z.object({
  specialties: ProductionSpecialtiesSchema,
  initialChecks: z.array(MachineSchema),
  orders: z.array(TestWorkDetailSchema),
  myActiveMachines: z.array(TestWorkDetailSchema).default([]),
  availableTests: z.array(TestWorkDetailSchema).default([]),
  activeSession: TestSessionSchema.nullable().default(null),
  otherMachineCount: z.number().int().nonnegative(),
});
export const ActiveTestWorkResponseSchema = z.object({
  orderId: Id.nullable(),
});
export const ProductionWorkDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("session"), sessionId: Id, orderId: Id }),
  z.object({ kind: z.literal("test"), orderId: Id }),
  z.object({ kind: z.literal("initial_check"), machineId: Id }),
  z.object({ kind: z.literal("none") }),
]);
export type ProductionWorkDestination = z.infer<
  typeof ProductionWorkDestinationSchema
>;
export const TestMutationRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const ReportBearingConcernRequestSchema =
  TestMutationRequestSchema.extend({
    expectedSessionVersion: z.number().int().positive(),
  }).strict();
export const TestAssignRequestSchema = TestMutationRequestSchema.extend({
  userId: z.string().min(1).nullable(),
}).strict();
export const RecordTestStepRequestSchema = TestMutationRequestSchema.extend({
  stepKey: TestStepSchema.shape.key,
  result: TestResultValueSchema,
  fileId: Id.nullable().default(null),
}).strict();
export const FinishTestRequestSchema = TestMutationRequestSchema.extend({
  videoFileId: Id.nullable(),
  expectedSessionVersion: z.number().int().positive(),
}).strict();

export type ProductionSpecialty = z.infer<typeof ProductionSpecialtySchema>;
export type TestWorkDetail = z.infer<typeof TestWorkDetailSchema>;
export type TestQueueResponse = z.infer<typeof TestQueueResponseSchema>;
export type TestStepResult = z.infer<typeof TestStepResultSchema>;
export type RecordInitialCheckRequest = z.infer<
  typeof RecordInitialCheckRequestSchema
>;
export type TestSession = z.infer<typeof TestSessionSchema>;
export type TestSessionEvent = z.infer<typeof TestSessionEventSchema>;
export type TestSessionItemState = z.infer<typeof TestSessionItemStateSchema>;
