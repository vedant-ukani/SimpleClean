import { z } from "zod";
import { MachineCatalogEnrichmentSchema } from "./catalog.js";
import {
  CatalogEquipmentClassSchema,
  suggestedMachineType,
} from "./catalog.js";

export const MACHINE_TYPES = ["washer", "dryer", "other"] as const;
export const MACHINE_PHASES = ["single_phase", "three_phase"] as const;
export const MACHINE_FUELS = ["gas", "electric", "steam", "other"] as const;
export const IDENTITY_VERIFICATION_STATES = [
  "provisional",
  "verified",
  "conflict",
] as const;
export const INVENTORY_STATES = ["expected", "on_hand", "scrapped"] as const;
export const PRODUCTION_STATES = [
  "not_assessed",
  "preliminary_passed",
  "awaiting_test",
  "testing",
  "awaiting_repair",
  "awaiting_clean",
  "blocked",
] as const;
export const IDENTITY_SOURCE_KINDS = [
  "manual",
  "other",
  "spreadsheet_import",
  "photo_intake",
] as const;
export const QR_LABEL_STATES = ["active", "revoked"] as const;
export const QR_LABEL_ACTIVITY_ACTIONS = [
  "created",
  "printed",
  "resolved",
  "revoked",
  "reissued",
] as const;

export const MachineTypeSchema = z.enum(MACHINE_TYPES);
export const EquipmentClassSchema = CatalogEquipmentClassSchema;
export { suggestedMachineType as machineTypeForEquipmentClass };
export function equipmentClassLabel(
  value: z.infer<typeof EquipmentClassSchema> | null,
): string {
  if (value === null) return "Type not recorded";
  return {
    washer: "Washer",
    dryer: "Dryer",
    stack_dryer: "Stack Dryer",
    stacked_washer_dryer: "Stacked Washer/Dryer",
    washer_dryer_combo: "Washer/Dryer Combo",
    other: "Other",
  }[value];
}
export const MachinePhaseSchema = z.enum(MACHINE_PHASES);
export const MachineFuelSchema = z.enum(MACHINE_FUELS);
export const IdentityVerificationStateSchema = z.enum(
  IDENTITY_VERIFICATION_STATES,
);
export const InventoryStateSchema = z.enum(INVENTORY_STATES);
export const ProductionStateSchema = z.enum(PRODUCTION_STATES);
export const IdentitySourceKindSchema = z.enum(IDENTITY_SOURCE_KINDS);
export const QrLabelStateSchema = z.enum(QR_LABEL_STATES);
export const QrLabelActivityActionSchema = z.enum(QR_LABEL_ACTIVITY_ACTIONS);

export const InventoryIdSchema = z.uuid();
const VersionSchema = z.number().int().positive();
const TimestampSchema = z.iso.datetime();
const NullableFactSchema = z.string().max(240).nullable();
export const CapacityLbSchema = z.number().int().min(1).max(2_000).nullable();
export const QrFallbackCodeSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{16}$/);
export const QrTokenSchema = z
  .string()
  .max(200)
  .regex(
    /^v1\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/,
  );

export const AcquisitionLoadSchema = z.object({
  id: InventoryIdSchema,
  displayName: z.string().min(1).max(160),
  sourceName: z.string().max(160).nullable(),
  sourceReference: z.string().max(160).nullable(),
  expectedArrivalAt: TimestampSchema.nullable(),
  receivedAt: TimestampSchema.nullable(),
  version: VersionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const MachineSchema = z.object({
  id: InventoryIdSchema,
  machineType: MachineTypeSchema,
  equipmentClass: EquipmentClassSchema.nullable().optional(),
  manufacturer: NullableFactSchema,
  model: NullableFactSchema,
  serial: NullableFactSchema,
  voltage: NullableFactSchema,
  phase: MachinePhaseSchema.nullable(),
  fuel: MachineFuelSchema.nullable(),
  capacityLb: CapacityLbSchema.optional(),
  sourceLoadId: InventoryIdSchema,
  sourceLoadDisplayName: z.string().min(1).max(160),
  identityVerificationState: IdentityVerificationStateSchema,
  conflictingMachineId: InventoryIdSchema.nullable(),
  inventoryState: InventoryStateSchema,
  productionState: ProductionStateSchema,
  version: VersionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const MachineIdentityEvidenceSchema = z.object({
  id: InventoryIdSchema,
  machineId: InventoryIdSchema,
  sourceKind: IdentitySourceKindSchema,
  machineType: MachineTypeSchema,
  equipmentClass: EquipmentClassSchema.nullable().optional(),
  manufacturer: NullableFactSchema,
  model: NullableFactSchema,
  serial: NullableFactSchema,
  voltage: NullableFactSchema,
  phase: MachinePhaseSchema.nullable(),
  fuel: MachineFuelSchema.nullable(),
  capacityLb: CapacityLbSchema.optional(),
  actorUserId: z.string().min(1),
  requestId: z.string().min(1),
  createdAt: TimestampSchema,
});

export const MachineIdentityVerificationHistorySchema = z.object({
  id: InventoryIdSchema,
  machineId: InventoryIdSchema,
  fromState: IdentityVerificationStateSchema,
  toState: IdentityVerificationStateSchema,
  conflictingMachineId: InventoryIdSchema.nullable(),
  machineVersion: VersionSchema,
  actorUserId: z.string().min(1),
  requestId: z.string().min(1),
  createdAt: TimestampSchema,
});

export const MachineDetailSchema = z.object({
  machine: MachineSchema,
  identityEvidence: z.array(MachineIdentityEvidenceSchema),
  verificationHistory: z.array(MachineIdentityVerificationHistorySchema),
  catalog: MachineCatalogEnrichmentSchema.optional(),
});

export const QrLabelSchema = z
  .object({
    id: InventoryIdSchema,
    machineId: InventoryIdSchema,
    fallbackCode: QrFallbackCodeSchema,
    state: QrLabelStateSchema,
    version: VersionSchema,
    issuedByUserId: z.string().min(1),
    revokedByUserId: z.string().min(1).nullable(),
    issuedAt: TimestampSchema,
    revokedAt: TimestampSchema.nullable(),
  })
  .superRefine((label, context) => {
    const isConsistentlyActive =
      label.state === "active" &&
      label.revokedByUserId === null &&
      label.revokedAt === null;
    const isConsistentlyRevoked =
      label.state === "revoked" &&
      label.revokedByUserId !== null &&
      label.revokedAt !== null;
    if (!isConsistentlyActive && !isConsistentlyRevoked) {
      context.addIssue({
        code: "custom",
        message: "Label state and revocation fields are inconsistent",
      });
    }
  });

export const QrLabelActivitySchema = z.object({
  id: InventoryIdSchema,
  labelId: InventoryIdSchema,
  machineId: InventoryIdSchema,
  action: QrLabelActivityActionSchema,
  actorUserId: z.string().min(1),
  requestId: z.string().min(1).max(200),
  createdAt: TimestampSchema,
});

const OptionalNullableTextSchema = z.string().max(240).nullable().optional();
const OptionalNullableTimestampSchema = TimestampSchema.nullable().optional();

export const CreateAcquisitionLoadRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  sourceName: z.string().trim().max(160).nullable().optional(),
  sourceReference: z.string().trim().max(160).nullable().optional(),
  expectedArrivalAt: OptionalNullableTimestampSchema,
  receivedAt: OptionalNullableTimestampSchema,
});

export const UpdateAcquisitionLoadRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160).optional(),
    sourceName: z.string().trim().max(160).nullable().optional(),
    sourceReference: z.string().trim().max(160).nullable().optional(),
    expectedArrivalAt: OptionalNullableTimestampSchema,
    receivedAt: OptionalNullableTimestampSchema,
    expectedVersion: VersionSchema,
  })
  .refine(
    ({ expectedVersion: _expectedVersion, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: "At least one change is required" },
  );

export const VersionedRequestSchema = z.object({
  expectedVersion: VersionSchema,
});

export const MachineIdentityInputSchema = z.object({
  machineType: MachineTypeSchema,
  equipmentClass: EquipmentClassSchema.nullable().optional(),
  manufacturer: OptionalNullableTextSchema,
  model: OptionalNullableTextSchema,
  serial: OptionalNullableTextSchema,
  voltage: OptionalNullableTextSchema,
  phase: MachinePhaseSchema.nullable().optional(),
  fuel: MachineFuelSchema.nullable().optional(),
  capacityLb: CapacityLbSchema.optional(),
  sourceKind: IdentitySourceKindSchema.default("manual"),
});

export const CreateMachineRequestSchema = MachineIdentityInputSchema.extend({
  sourceLoadId: InventoryIdSchema,
  inventoryState: z.enum(["expected", "on_hand"]).default("expected"),
});

export const UpdateMachineIdentityRequestSchema = z
  .object({
    machineType: MachineTypeSchema.optional(),
    equipmentClass: EquipmentClassSchema.nullable().optional(),
    manufacturer: OptionalNullableTextSchema,
    model: OptionalNullableTextSchema,
    serial: OptionalNullableTextSchema,
    voltage: OptionalNullableTextSchema,
    phase: MachinePhaseSchema.nullable().optional(),
    fuel: MachineFuelSchema.nullable().optional(),
    capacityLb: CapacityLbSchema.optional(),
    sourceKind: IdentitySourceKindSchema.default("manual"),
    expectedVersion: VersionSchema,
  })
  .refine(
    ({ expectedVersion: _version, sourceKind: _source, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: "At least one identity change is required" },
  );

export const VerifyMachineIdentityRequestSchema = VersionedRequestSchema;

export const CreateQrLabelRequestSchema = z.object({}).strict();
export const ReissueQrLabelRequestSchema = z.object({
  expectedLabelId: InventoryIdSchema,
  expectedVersion: VersionSchema,
});
export const RevokeQrLabelRequestSchema = VersionedRequestSchema;
export const ResolveQrLabelRequestSchema = z.union([
  z.object({ token: QrTokenSchema }).strict(),
  z.object({ fallbackCode: QrFallbackCodeSchema }).strict(),
]);

export const MachineSearchQuerySchema = z.object({
  query: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const AcquisitionLoadResponseSchema = z.object({
  load: AcquisitionLoadSchema,
});
export const AcquisitionLoadListResponseSchema = z.object({
  loads: z.array(AcquisitionLoadSchema),
});
export const MachineResponseSchema = z.object({ machine: MachineSchema });
export const MachineDetailResponseSchema = MachineDetailSchema;
export const MachineSearchResponseSchema = z.object({
  machines: z.array(MachineSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export const QrLabelResponseSchema = z.object({ label: QrLabelSchema });
export const QrLabelListResponseSchema = z.object({
  labels: z.array(QrLabelSchema),
});
export const ResolveQrLabelResponseSchema = MachineDetailSchema;
export const IdentityConflictResponseSchema = z.object({
  statusCode: z.literal(409),
  code: z.literal("identity_conflict"),
  message: z.string(),
  conflictingMachineId: InventoryIdSchema,
  machine: MachineSchema,
});

export type AcquisitionLoad = z.infer<typeof AcquisitionLoadSchema>;
export type Machine = z.infer<typeof MachineSchema>;
export type EquipmentClass = z.infer<typeof EquipmentClassSchema>;
export type CapacityLb = z.infer<typeof CapacityLbSchema>;
export type MachineIdentityEvidence = z.infer<
  typeof MachineIdentityEvidenceSchema
>;
export type MachineIdentityVerificationHistory = z.infer<
  typeof MachineIdentityVerificationHistorySchema
>;
export type MachineDetail = z.infer<typeof MachineDetailSchema>;
export type QrLabelState = z.infer<typeof QrLabelStateSchema>;
export type QrLabelActivityAction = z.infer<typeof QrLabelActivityActionSchema>;
export type QrLabel = z.infer<typeof QrLabelSchema>;
export type QrLabelActivity = z.infer<typeof QrLabelActivitySchema>;
export type CreateAcquisitionLoadRequest = z.infer<
  typeof CreateAcquisitionLoadRequestSchema
>;
export type UpdateAcquisitionLoadRequest = z.infer<
  typeof UpdateAcquisitionLoadRequestSchema
>;
export type CreateMachineRequest = z.infer<typeof CreateMachineRequestSchema>;
export type UpdateMachineIdentityRequest = z.infer<
  typeof UpdateMachineIdentityRequestSchema
>;
export type CreateQrLabelRequest = z.infer<typeof CreateQrLabelRequestSchema>;
export type ReissueQrLabelRequest = z.infer<typeof ReissueQrLabelRequestSchema>;
export type RevokeQrLabelRequest = z.infer<typeof RevokeQrLabelRequestSchema>;
export type ResolveQrLabelRequest = z.infer<typeof ResolveQrLabelRequestSchema>;
export type MachineSearchQuery = z.infer<typeof MachineSearchQuerySchema>;
export type MachineSearchResponse = z.infer<typeof MachineSearchResponseSchema>;
