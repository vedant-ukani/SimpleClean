import { z } from "zod";

import {
  InventoryIdSchema,
  InventoryStateSchema,
  MachineTypeSchema,
} from "./inventory.js";

export const IMPORT_RUN_STATES = [
  "staged",
  "approved",
  "committed",
  "commit_failed",
] as const;
export const IMPORT_CLASSIFICATIONS = ["ready", "warning", "error"] as const;
export const IMPORT_FINDING_CODES = [
  "machine_type_unknown",
  "manufacturer_alias_applied",
  "manufacturer_missing",
  "model_missing",
  "serial_missing",
  "legacy_sold_shipped_unsupported",
  "duplicate_in_import",
  "existing_identity_match",
  "existing_serial_match",
  "existing_model_match",
  "status_unrecognized",
] as const;
export const IMPORT_MEDIA_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
] as const;
export const IMPORT_COMMIT_FAILURE_CODES = [
  "duplicate_state_changed",
  "commit_failed",
] as const;

export const ImportRunStateSchema = z.enum(IMPORT_RUN_STATES);
export const ImportClassificationSchema = z.enum(IMPORT_CLASSIFICATIONS);
export const ImportFindingCodeSchema = z.enum(IMPORT_FINDING_CODES);
export const ImportMediaTypeSchema = z.enum(IMPORT_MEDIA_TYPES);
export const ImportCommitFailureCodeSchema = z.enum(
  IMPORT_COMMIT_FAILURE_CODES,
);
export const ImportIdSchema = z.uuid();

export const ImportRawValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("empty") }),
  z.object({ kind: z.literal("string"), value: z.string() }),
  z.object({ kind: z.literal("number"), value: z.string() }),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }),
  z.object({ kind: z.literal("date"), value: z.iso.datetime() }),
  z.object({
    kind: z.literal("formula"),
    formula: z.string(),
    cached: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  }),
]);

export const ImportRawCellSchema = z.object({
  column: z.number().int().positive(),
  header: z.string(),
  value: ImportRawValueSchema,
});

export const ImportCandidateSchema = z.object({
  machineType: MachineTypeSchema,
  manufacturer: z.string().max(240).nullable(),
  model: z.string().max(240).nullable(),
  serial: z.string().max(240).nullable(),
  inventoryState: InventoryStateSchema,
});

export const ImportRunSchema = z.object({
  id: ImportIdSchema,
  sourceLoadId: InventoryIdSchema,
  sourceLoadDisplayName: z.string().min(1).max(160),
  state: ImportRunStateSchema,
  version: z.number().int().positive(),
  originalFilename: z.string().min(1).max(255),
  mediaType: ImportMediaTypeSchema,
  byteCount: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  totalRows: z.number().int().nonnegative(),
  readyRows: z.number().int().nonnegative(),
  warningRows: z.number().int().nonnegative(),
  errorRows: z.number().int().nonnegative(),
  approvedRows: z.number().int().nonnegative(),
  committedRows: z.number().int().nonnegative(),
  failureCode: ImportCommitFailureCodeSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ImportRowSchema = z.object({
  id: ImportIdSchema,
  runId: ImportIdSchema,
  sheetName: z.string().min(1).max(160),
  sourceRowNumber: z.number().int().positive(),
  rawCells: z.array(ImportRawCellSchema),
  candidate: ImportCandidateSchema,
  classification: ImportClassificationSchema,
  findings: z.array(ImportFindingCodeSchema),
  approved: z.boolean(),
  machineId: InventoryIdSchema.nullable(),
});

export const ImportRowListQuerySchema = z.object({
  classification: ImportClassificationSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const ImportApprovalRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  rowIds: z.array(ImportIdSchema).min(1).max(10_000),
});
export const ImportCommitRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});
export const ImportRunResponseSchema = z.object({ run: ImportRunSchema });
export const ImportRunListResponseSchema = z.object({
  runs: z.array(ImportRunSchema),
});
export const ImportRowListResponseSchema = z.object({
  rows: z.array(ImportRowSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export const ImportCommitResponseSchema = z.object({
  run: ImportRunSchema,
  machineIds: z.array(InventoryIdSchema),
});

export type ImportRunState = z.infer<typeof ImportRunStateSchema>;
export type ImportClassification = z.infer<typeof ImportClassificationSchema>;
export type ImportFindingCode = z.infer<typeof ImportFindingCodeSchema>;
export type ImportMediaType = z.infer<typeof ImportMediaTypeSchema>;
export type ImportCommitFailureCode = z.infer<
  typeof ImportCommitFailureCodeSchema
>;
export type ImportRawValue = z.infer<typeof ImportRawValueSchema>;
export type ImportRawCell = z.infer<typeof ImportRawCellSchema>;
export type ImportCandidate = z.infer<typeof ImportCandidateSchema>;
export type ImportRun = z.infer<typeof ImportRunSchema>;
export type ImportRow = z.infer<typeof ImportRowSchema>;
export type ImportRowListQuery = z.infer<typeof ImportRowListQuerySchema>;
export type ImportApprovalRequest = z.infer<typeof ImportApprovalRequestSchema>;
export type ImportCommitRequest = z.infer<typeof ImportCommitRequestSchema>;
export type ImportRowListResponse = z.infer<typeof ImportRowListResponseSchema>;
export type ImportCommitResponse = z.infer<typeof ImportCommitResponseSchema>;
