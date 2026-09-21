import { z } from "zod";

export const MACHINE_TYPES = ["washer", "dryer", "other"] as const;
export const MACHINE_PHASES = ["single_phase", "three_phase"] as const;
export const MACHINE_FUELS = ["gas", "electric", "steam", "other"] as const;
export const IDENTITY_VERIFICATION_STATES = [
  "provisional",
  "verified",
  "conflict",
] as const;
export const INVENTORY_STATES = ["expected", "on_hand"] as const;
export const PRODUCTION_STATES = ["not_started"] as const;
export const IDENTITY_SOURCE_KINDS = ["manual", "other"] as const;

export const MachineTypeSchema = z.enum(MACHINE_TYPES);
export const MachinePhaseSchema = z.enum(MACHINE_PHASES);
export const MachineFuelSchema = z.enum(MACHINE_FUELS);
export const IdentityVerificationStateSchema = z.enum(
  IDENTITY_VERIFICATION_STATES,
);
export const InventoryStateSchema = z.enum(INVENTORY_STATES);
export const ProductionStateSchema = z.enum(PRODUCTION_STATES);
export const IdentitySourceKindSchema = z.enum(IDENTITY_SOURCE_KINDS);

export const InventoryIdSchema = z.uuid();
const VersionSchema = z.number().int().positive();
const TimestampSchema = z.iso.datetime();
const NullableFactSchema = z.string().max(240).nullable();

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

export const InventoryLocationSchema = z.object({
  id: InventoryIdSchema,
  code: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  active: z.boolean(),
  version: VersionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const MachineSchema = z.object({
  id: InventoryIdSchema,
  machineType: MachineTypeSchema,
  manufacturer: NullableFactSchema,
  model: NullableFactSchema,
  serial: NullableFactSchema,
  voltage: NullableFactSchema,
  phase: MachinePhaseSchema.nullable(),
  fuel: MachineFuelSchema.nullable(),
  sourceLoadId: InventoryIdSchema,
  sourceLoadDisplayName: z.string().min(1).max(160),
  currentLocationId: InventoryIdSchema.nullable(),
  currentLocationCode: z.string().min(1).max(80).nullable(),
  currentLocationName: z.string().min(1).max(160).nullable(),
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
  manufacturer: NullableFactSchema,
  model: NullableFactSchema,
  serial: NullableFactSchema,
  voltage: NullableFactSchema,
  phase: MachinePhaseSchema.nullable(),
  fuel: MachineFuelSchema.nullable(),
  actorUserId: z.string().min(1),
  requestId: z.string().min(1),
  createdAt: TimestampSchema,
});

export const MachineLocationHistorySchema = z.object({
  id: InventoryIdSchema,
  machineId: InventoryIdSchema,
  fromLocationId: InventoryIdSchema.nullable(),
  toLocationId: InventoryIdSchema,
  actorUserId: z.string().min(1),
  requestId: z.string().min(1),
  machineVersion: VersionSchema,
  createdAt: TimestampSchema,
});

export const MachineDetailSchema = z.object({
  machine: MachineSchema,
  identityEvidence: z.array(MachineIdentityEvidenceSchema),
  locationHistory: z.array(MachineLocationHistorySchema),
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

export const CreateInventoryLocationRequestSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
});

export const UpdateInventoryLocationRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    expectedVersion: VersionSchema,
  })
  .refine(({ code, name }) => code !== undefined || name !== undefined, {
    message: "At least one change is required",
  });

export const VersionedRequestSchema = z.object({
  expectedVersion: VersionSchema,
});

export const MachineIdentityInputSchema = z.object({
  machineType: MachineTypeSchema,
  manufacturer: OptionalNullableTextSchema,
  model: OptionalNullableTextSchema,
  serial: OptionalNullableTextSchema,
  voltage: OptionalNullableTextSchema,
  phase: MachinePhaseSchema.nullable().optional(),
  fuel: MachineFuelSchema.nullable().optional(),
  sourceKind: IdentitySourceKindSchema.default("manual"),
});

export const CreateMachineRequestSchema = MachineIdentityInputSchema.extend({
  sourceLoadId: InventoryIdSchema,
  currentLocationId: InventoryIdSchema.nullable().optional(),
  inventoryState: InventoryStateSchema.default("expected"),
});

export const UpdateMachineIdentityRequestSchema = z
  .object({
    machineType: MachineTypeSchema.optional(),
    manufacturer: OptionalNullableTextSchema,
    model: OptionalNullableTextSchema,
    serial: OptionalNullableTextSchema,
    voltage: OptionalNullableTextSchema,
    phase: MachinePhaseSchema.nullable().optional(),
    fuel: MachineFuelSchema.nullable().optional(),
    sourceKind: IdentitySourceKindSchema.default("manual"),
    expectedVersion: VersionSchema,
  })
  .refine(
    ({ expectedVersion: _version, sourceKind: _source, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: "At least one identity change is required" },
  );

export const VerifyMachineIdentityRequestSchema = VersionedRequestSchema;

export const RelocateMachineRequestSchema = z.object({
  toLocationId: InventoryIdSchema,
  expectedVersion: VersionSchema,
});

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
export const InventoryLocationResponseSchema = z.object({
  location: InventoryLocationSchema,
});
export const InventoryLocationListResponseSchema = z.object({
  locations: z.array(InventoryLocationSchema),
});
export const MachineResponseSchema = z.object({ machine: MachineSchema });
export const MachineDetailResponseSchema = MachineDetailSchema;
export const MachineSearchResponseSchema = z.object({
  machines: z.array(MachineSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export const IdentityConflictResponseSchema = z.object({
  statusCode: z.literal(409),
  code: z.literal("identity_conflict"),
  message: z.string(),
  conflictingMachineId: InventoryIdSchema,
  machine: MachineSchema,
});

export type AcquisitionLoad = z.infer<typeof AcquisitionLoadSchema>;
export type InventoryLocation = z.infer<typeof InventoryLocationSchema>;
export type Machine = z.infer<typeof MachineSchema>;
export type MachineIdentityEvidence = z.infer<
  typeof MachineIdentityEvidenceSchema
>;
export type MachineLocationHistory = z.infer<
  typeof MachineLocationHistorySchema
>;
export type MachineDetail = z.infer<typeof MachineDetailSchema>;
export type CreateAcquisitionLoadRequest = z.infer<
  typeof CreateAcquisitionLoadRequestSchema
>;
export type UpdateAcquisitionLoadRequest = z.infer<
  typeof UpdateAcquisitionLoadRequestSchema
>;
export type CreateInventoryLocationRequest = z.infer<
  typeof CreateInventoryLocationRequestSchema
>;
export type UpdateInventoryLocationRequest = z.infer<
  typeof UpdateInventoryLocationRequestSchema
>;
export type CreateMachineRequest = z.infer<typeof CreateMachineRequestSchema>;
export type UpdateMachineIdentityRequest = z.infer<
  typeof UpdateMachineIdentityRequestSchema
>;
export type RelocateMachineRequest = z.infer<
  typeof RelocateMachineRequestSchema
>;
export type MachineSearchQuery = z.infer<typeof MachineSearchQuerySchema>;
export type MachineSearchResponse = z.infer<typeof MachineSearchResponseSchema>;
