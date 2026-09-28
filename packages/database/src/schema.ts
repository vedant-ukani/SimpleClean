import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const authUser = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)],
);

export const authSession = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_index").on(table.userId),
  ],
);

export const authAccount = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("account_user_id_index").on(table.userId)],
);

export const authVerification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("verification_identifier_index").on(table.identifier)],
);

export const identityProfile = pgTable(
  "identity_profile",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => authUser.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "identity_profile_role_check",
      sql`${table.role} in ('owner_admin', 'warehouse', 'technician_cleaner')`,
    ),
    check("identity_profile_version_check", sql`${table.version} > 0`),
    index("identity_profile_active_role_index").on(table.active, table.role),
  ],
);

export const identitySecurityActivity = pgTable(
  "identity_security_activity",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    actorUserId: text("actor_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    subjectUserId: text("subject_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "identity_security_activity_action_check",
      sql`${table.action} in ('signed_in', 'signed_out', 'user_created', 'role_changed', 'user_activated', 'user_deactivated', 'sessions_revoked', 'user_provisioned', 'authorization_denied')`,
    ),
    index("identity_security_activity_actor_index").on(table.actorUserId),
    index("identity_security_activity_subject_index").on(table.subjectUserId),
  ],
);

export const inventoryLoad = pgTable(
  "inventory_load",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    sourceName: text("source_name"),
    sourceReference: text("source_reference"),
    expectedArrivalAt: timestamp("expected_arrival_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("inventory_load_version_check", sql`${table.version} > 0`),
    index("inventory_load_display_name_index").on(table.displayName),
    index("inventory_load_source_reference_index").on(table.sourceReference),
  ],
);

export const inventoryMachine = pgTable(
  "inventory_machine",
  {
    id: text("id").primaryKey(),
    machineType: text("machine_type").notNull(),
    equipmentClass: text("equipment_class"),
    manufacturer: text("manufacturer"),
    normalizedManufacturer: text("normalized_manufacturer"),
    model: text("model"),
    serial: text("serial"),
    normalizedSerial: text("normalized_serial"),
    voltage: text("voltage"),
    phase: text("phase"),
    fuel: text("fuel"),
    capacityLb: integer("capacity_lb"),
    sourceLoadId: text("source_load_id")
      .notNull()
      .references(() => inventoryLoad.id, { onDelete: "restrict" }),
    identityVerificationState: text("identity_verification_state")
      .notNull()
      .default("provisional"),
    conflictingMachineId: text("conflicting_machine_id").references(
      (): AnyPgColumn => inventoryMachine.id,
      { onDelete: "restrict" },
    ),
    inventoryState: text("inventory_state").notNull().default("expected"),
    productionState: text("production_state").notNull().default("not_assessed"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "inventory_machine_type_check",
      sql`${table.machineType} in ('washer', 'dryer', 'other')`,
    ),
    check(
      "inventory_machine_equipment_class_check",
      sql`${table.equipmentClass} is null or ${table.equipmentClass} in ('washer', 'dryer', 'stack_dryer', 'stacked_washer_dryer', 'washer_dryer_combo', 'other')`,
    ),
    check(
      "inventory_machine_phase_check",
      sql`${table.phase} is null or ${table.phase} in ('single_phase', 'three_phase')`,
    ),
    check(
      "inventory_machine_fuel_check",
      sql`${table.fuel} is null or ${table.fuel} in ('gas', 'electric', 'steam', 'other')`,
    ),
    check(
      "inventory_machine_capacity_check",
      sql`${table.capacityLb} is null or (${table.capacityLb} > 0 and ${table.capacityLb} <= 2000)`,
    ),
    check(
      "inventory_machine_identity_state_check",
      sql`${table.identityVerificationState} in ('provisional', 'verified', 'conflict')`,
    ),
    check(
      "inventory_machine_inventory_state_check",
      sql`${table.inventoryState} in ('expected', 'on_hand', 'scrapped')`,
    ),
    check(
      "inventory_machine_production_state_check",
      sql`${table.productionState} in ('not_assessed', 'preliminary_passed', 'awaiting_test', 'testing', 'awaiting_repair', 'awaiting_clean', 'blocked')`,
    ),
    check("inventory_machine_version_check", sql`${table.version} > 0`),
    index("inventory_machine_load_index").on(table.sourceLoadId),
    index("inventory_machine_serial_index").on(table.normalizedSerial),
    index("inventory_machine_manufacturer_index").on(
      table.normalizedManufacturer,
    ),
  ],
);

export const machineIdentityEvidence = pgTable(
  "machine_identity_evidence",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    sourceKind: text("source_kind").notNull(),
    machineType: text("machine_type").notNull(),
    equipmentClass: text("equipment_class"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serial: text("serial"),
    voltage: text("voltage"),
    phase: text("phase"),
    fuel: text("fuel"),
    capacityLb: integer("capacity_lb"),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "machine_identity_evidence_source_check",
      sql`${table.sourceKind} in ('manual', 'other', 'spreadsheet_import', 'photo_intake')`,
    ),
    check(
      "machine_identity_evidence_type_check",
      sql`${table.machineType} in ('washer', 'dryer', 'other')`,
    ),
    check(
      "machine_identity_evidence_equipment_class_check",
      sql`${table.equipmentClass} is null or ${table.equipmentClass} in ('washer', 'dryer', 'stack_dryer', 'stacked_washer_dryer', 'washer_dryer_combo', 'other')`,
    ),
    check(
      "machine_identity_evidence_phase_check",
      sql`${table.phase} is null or ${table.phase} in ('single_phase', 'three_phase')`,
    ),
    check(
      "machine_identity_evidence_fuel_check",
      sql`${table.fuel} is null or ${table.fuel} in ('gas', 'electric', 'steam', 'other')`,
    ),
    check(
      "machine_identity_evidence_capacity_check",
      sql`${table.capacityLb} is null or (${table.capacityLb} > 0 and ${table.capacityLb} <= 2000)`,
    ),
    index("machine_identity_evidence_machine_index").on(
      table.machineId,
      table.createdAt,
    ),
  ],
);

export const machineIdentityClaim = pgTable(
  "machine_identity_claim",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    normalizedManufacturer: text("normalized_manufacturer").notNull(),
    normalizedSerial: text("normalized_serial").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("machine_identity_claim_identity_unique").on(
      table.normalizedManufacturer,
      table.normalizedSerial,
    ),
    uniqueIndex("machine_identity_claim_machine_unique").on(table.machineId),
  ],
);

export const machineIdentityVerificationHistory = pgTable(
  "machine_identity_verification_history",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    conflictingMachineId: text("conflicting_machine_id").references(
      () => inventoryMachine.id,
      { onDelete: "restrict" },
    ),
    machineVersion: integer("machine_version").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "machine_identity_verification_history_from_state_check",
      sql`${table.fromState} in ('provisional', 'verified', 'conflict')`,
    ),
    check(
      "machine_identity_verification_history_to_state_check",
      sql`${table.toState} in ('verified', 'conflict')`,
    ),
    check(
      "machine_identity_verification_history_conflict_check",
      sql`(${table.toState} = 'conflict' and ${table.conflictingMachineId} is not null) or (${table.toState} = 'verified' and ${table.conflictingMachineId} is null)`,
    ),
    check(
      "machine_identity_verification_history_version_check",
      sql`${table.machineVersion} > 0`,
    ),
    index("machine_identity_verification_history_machine_index").on(
      table.machineId,
      table.createdAt,
    ),
  ],
);

export const inventoryQrLabel = pgTable(
  "inventory_qr_label",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    fallbackCode: text("fallback_code").notNull(),
    state: text("state").notNull().default("active"),
    version: integer("version").notNull().default(1),
    issuedByUserId: text("issued_by_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    revokedByUserId: text("revoked_by_user_id").references(() => authUser.id, {
      onDelete: "restrict",
    }),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("inventory_qr_label_fallback_unique").on(table.fallbackCode),
    uniqueIndex("inventory_qr_label_id_machine_unique").on(
      table.id,
      table.machineId,
    ),
    uniqueIndex("inventory_qr_label_one_active_machine_unique")
      .on(table.machineId)
      .where(sql`${table.state} = 'active'`),
    check(
      "inventory_qr_label_id_check",
      sql`${table.id} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check(
      "inventory_qr_label_fallback_check",
      sql`${table.fallbackCode} ~ '^[0-9A-HJKMNP-TV-Z]{16}$'`,
    ),
    check(
      "inventory_qr_label_state_check",
      sql`${table.state} in ('active', 'revoked')`,
    ),
    check(
      "inventory_qr_label_lifecycle_check",
      sql`(${table.state} = 'active' and ${table.revokedByUserId} is null and ${table.revokedAt} is null) or (${table.state} = 'revoked' and ${table.revokedByUserId} is not null and ${table.revokedAt} is not null)`,
    ),
    check("inventory_qr_label_version_check", sql`${table.version} > 0`),
    index("inventory_qr_label_machine_history_index").on(
      table.machineId,
      table.issuedAt,
    ),
  ],
);

export const inventoryQrLabelActivity = pgTable(
  "inventory_qr_label_activity",
  {
    id: text("id").primaryKey(),
    labelId: text("label_id").notNull(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.labelId, table.machineId],
      foreignColumns: [inventoryQrLabel.id, inventoryQrLabel.machineId],
      name: "inventory_qr_label_activity_label_machine_fk",
    }).onDelete("restrict"),
    check(
      "inventory_qr_label_activity_action_check",
      sql`${table.action} in ('created', 'printed', 'resolved', 'revoked', 'reissued')`,
    ),
    index("inventory_qr_label_activity_label_index").on(
      table.labelId,
      table.createdAt,
    ),
    index("inventory_qr_label_activity_machine_index").on(
      table.machineId,
      table.createdAt,
    ),
  ],
);

export const inventoryImportRun = pgTable(
  "inventory_import_run",
  {
    id: text("id").primaryKey(),
    sourceLoadId: text("source_load_id")
      .notNull()
      .references(() => inventoryLoad.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mediaType: text("media_type").notNull(),
    byteCount: integer("byte_count").notNull(),
    sha256: text("sha256").notNull(),
    uploaderUserId: text("uploader_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    state: text("state").notNull().default("staged"),
    totalRows: integer("total_rows").notNull(),
    readyRows: integer("ready_rows").notNull(),
    warningRows: integer("warning_rows").notNull(),
    errorRows: integer("error_rows").notNull(),
    approvedRows: integer("approved_rows").notNull().default(0),
    committedRows: integer("committed_rows").notNull().default(0),
    failureCode: text("failure_code"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_import_run_storage_key_unique").on(table.storageKey),
    check(
      "inventory_import_run_state_check",
      sql`${table.state} in ('staged', 'approved', 'committed', 'commit_failed')`,
    ),
    check(
      "inventory_import_run_media_check",
      sql`${table.mediaType} in ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv')`,
    ),
    check(
      "inventory_import_run_counts_check",
      sql`${table.byteCount} > 0 and ${table.totalRows} > 0 and ${table.readyRows} >= 0 and ${table.warningRows} >= 0 and ${table.errorRows} >= 0 and ${table.committedRows} >= 0 and ${table.committedRows} <= ${table.approvedRows} and ${table.approvedRows} <= ${table.totalRows} and ${table.readyRows} + ${table.warningRows} + ${table.errorRows} = ${table.totalRows}`,
    ),
    check(
      "inventory_import_run_lifecycle_check",
      sql`(${table.state} = 'staged' and ${table.approvedRows} = 0 and ${table.committedRows} = 0 and ${table.failureCode} is null) or (${table.state} = 'approved' and ${table.approvedRows} > 0 and ${table.committedRows} = 0 and ${table.failureCode} is null) or (${table.state} = 'committed' and ${table.approvedRows} > 0 and ${table.committedRows} = ${table.approvedRows} and ${table.failureCode} is null) or (${table.state} = 'commit_failed' and ${table.approvedRows} > 0 and ${table.committedRows} = 0 and ${table.failureCode} is not null)`,
    ),
    check(
      "inventory_import_run_sha256_check",
      sql`${table.sha256} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "inventory_import_run_failure_code_check",
      sql`${table.failureCode} is null or ${table.failureCode} in ('duplicate_state_changed', 'commit_failed')`,
    ),
    check("inventory_import_run_version_check", sql`${table.version} > 0`),
    index("inventory_import_run_state_index").on(table.state, table.createdAt),
    index("inventory_import_run_load_index").on(table.sourceLoadId),
  ],
);

export const inventoryImportRow = pgTable(
  "inventory_import_row",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => inventoryImportRun.id, { onDelete: "restrict" }),
    sheetName: text("sheet_name").notNull(),
    sourceRowNumber: integer("source_row_number").notNull(),
    rawCells: jsonb("raw_cells").notNull(),
    candidate: jsonb("candidate").notNull(),
    normalizedManufacturer: text("normalized_manufacturer"),
    normalizedModel: text("normalized_model"),
    normalizedSerial: text("normalized_serial"),
    matchSnapshot: jsonb("match_snapshot").notNull(),
    matchFingerprint: text("match_fingerprint").notNull(),
    classification: text("classification").notNull(),
    findings: jsonb("findings").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_import_row_source_unique").on(
      table.runId,
      table.sheetName,
      table.sourceRowNumber,
    ),
    uniqueIndex("inventory_import_row_id_run_unique").on(table.id, table.runId),
    check(
      "inventory_import_row_classification_check",
      sql`${table.classification} in ('ready', 'warning', 'error')`,
    ),
    check(
      "inventory_import_row_number_check",
      sql`${table.sourceRowNumber} > 0`,
    ),
    check(
      "inventory_import_row_match_snapshot_check",
      sql`jsonb_typeof(${table.matchSnapshot}) = 'object'`,
    ),
    check(
      "inventory_import_row_match_fingerprint_check",
      sql`${table.matchFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    index("inventory_import_row_run_classification_index").on(
      table.runId,
      table.classification,
      table.sourceRowNumber,
    ),
    index("inventory_import_row_identity_index").on(
      table.normalizedManufacturer,
      table.normalizedSerial,
    ),
  ],
);

export const inventoryImportApproval = pgTable(
  "inventory_import_approval",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => inventoryImportRun.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_import_approval_run_unique").on(table.runId),
    uniqueIndex("inventory_import_approval_id_run_unique").on(
      table.id,
      table.runId,
    ),
  ],
);

export const inventoryImportApprovalRow = pgTable(
  "inventory_import_approval_row",
  {
    approvalId: text("approval_id")
      .notNull()
      .references(() => inventoryImportApproval.id, { onDelete: "restrict" }),
    runId: text("run_id").notNull(),
    rowId: text("row_id")
      .notNull()
      .references(() => inventoryImportRow.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("inventory_import_approval_row_unique").on(
      table.approvalId,
      table.rowId,
    ),
    uniqueIndex("inventory_import_approval_selected_once").on(table.rowId),
    uniqueIndex("inventory_import_approval_row_reference_unique").on(
      table.approvalId,
      table.runId,
      table.rowId,
    ),
    foreignKey({
      columns: [table.approvalId, table.runId],
      foreignColumns: [
        inventoryImportApproval.id,
        inventoryImportApproval.runId,
      ],
      name: "inventory_import_approval_row_approval_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rowId, table.runId],
      foreignColumns: [inventoryImportRow.id, inventoryImportRow.runId],
      name: "inventory_import_approval_row_row_run_fk",
    }).onDelete("restrict"),
  ],
);

export const inventoryImportMachineMapping = pgTable(
  "inventory_import_machine_mapping",
  {
    id: text("id").primaryKey(),
    approvalId: text("approval_id").notNull(),
    runId: text("run_id").notNull(),
    rowId: text("row_id").notNull(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_import_mapping_row_unique").on(table.rowId),
    uniqueIndex("inventory_import_mapping_machine_unique").on(table.machineId),
    foreignKey({
      columns: [table.approvalId, table.runId, table.rowId],
      foreignColumns: [
        inventoryImportApprovalRow.approvalId,
        inventoryImportApprovalRow.runId,
        inventoryImportApprovalRow.rowId,
      ],
      name: "inventory_import_mapping_approved_row_fk",
    }).onDelete("restrict"),
  ],
);

export const fileAttachment = pgTable(
  "file_attachment",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id").references(() => inventoryMachine.id, {
      onDelete: "restrict",
    }),
    loadId: text("load_id").references(() => inventoryLoad.id, {
      onDelete: "restrict",
    }),
    purpose: text("purpose").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    declaredMediaType: text("declared_media_type").notNull(),
    detectedMediaType: text("detected_media_type"),
    declaredByteCount: integer("declared_byte_count").notNull(),
    byteCount: integer("byte_count"),
    sha256: text("sha256"),
    uploaderUserId: text("uploader_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    state: text("state").notNull().default("pending_upload"),
    failureCode: text("failure_code"),
    uploadLeaseId: text("upload_lease_id"),
    uploadLeaseExpiresAt: timestamp("upload_lease_expires_at", {
      withTimezone: true,
    }),
    previewStorageKey: text("preview_storage_key"),
    previewByteCount: integer("preview_byte_count"),
    previewSha256: text("preview_sha256"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "file_attachment_one_target_check",
      sql`(${table.machineId} is not null and ${table.loadId} is null) or (${table.machineId} is null and ${table.loadId} is not null)`,
    ),
    check(
      "file_attachment_purpose_check",
      sql`${table.purpose} in ('nameplate', 'arrival_condition', 'document', 'receipt', 'other', 'intake_evidence', 'preliminary_inspection', 'production_test_evidence', 'production_test_video')`,
    ),
    check(
      "file_attachment_nameplate_target_check",
      sql`${table.purpose} <> 'nameplate' or ${table.machineId} is not null`,
    ),
    check(
      "file_attachment_intake_target_check",
      sql`${table.purpose} <> 'intake_evidence' or ${table.loadId} is not null`,
    ),
    check(
      "file_attachment_preliminary_target_check",
      sql`${table.purpose} <> 'preliminary_inspection' or ${table.machineId} is not null`,
    ),
    check(
      "file_attachment_production_test_target_check",
      sql`${table.purpose} <> 'production_test_evidence' or ${table.machineId} is not null`,
    ),
    check(
      "file_attachment_production_video_target_check",
      sql`${table.purpose} <> 'production_test_video' or ${table.machineId} is not null`,
    ),
    check(
      "file_attachment_preview_check",
      sql`(${table.previewStorageKey} is null and ${table.previewByteCount} is null and ${table.previewSha256} is null) or (${table.previewStorageKey} is not null and ${table.previewByteCount} > 0 and ${table.previewSha256} ~ '^[a-f0-9]{64}$')`,
    ),
    check(
      "file_attachment_state_check",
      sql`${table.state} in ('pending_upload', 'ready', 'failed', 'abandoned')`,
    ),
    check(
      "file_attachment_declared_media_type_check",
      sql`${table.declaredMediaType} in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'video/mp4', 'video/quicktime', 'video/webm')`,
    ),
    check(
      "file_attachment_detected_media_type_check",
      sql`${table.detectedMediaType} is null or ${table.detectedMediaType} in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'video/mp4', 'video/quicktime', 'video/webm')`,
    ),
    check(
      "file_attachment_byte_count_check",
      sql`${table.declaredByteCount} >= 0 and (${table.byteCount} is null or ${table.byteCount} >= 0)`,
    ),
    check(
      "file_attachment_upload_lease_check",
      sql`(${table.uploadLeaseId} is null and ${table.uploadLeaseExpiresAt} is null) or (${table.uploadLeaseId} is not null and ${table.uploadLeaseExpiresAt} is not null)`,
    ),
    check("file_attachment_version_check", sql`${table.version} > 0`),
    uniqueIndex("file_attachment_storage_key_unique").on(table.storageKey),
    index("file_attachment_machine_index").on(table.machineId, table.createdAt),
    index("file_attachment_load_index").on(table.loadId, table.createdAt),
    index("file_attachment_incomplete_index").on(table.state, table.createdAt),
  ],
);

export const fileAccessGrant = pgTable(
  "file_access_grant",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => fileAttachment.id, { onDelete: "restrict" }),
    operation: text("operation").notNull(),
    tokenHash: text("token_hash").notNull(),
    issuedToUserId: text("issued_to_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    issuedSessionId: text("issued_session_id")
      .notNull()
      .references(() => authSession.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "file_access_grant_operation_check",
      sql`${table.operation} in ('upload', 'download', 'preview')`,
    ),
    uniqueIndex("file_access_grant_token_hash_unique").on(table.tokenHash),
    index("file_access_grant_file_index").on(table.fileId, table.operation),
    index("file_access_grant_expiry_index").on(table.expiresAt),
  ],
);

export const fileActivity = pgTable(
  "file_activity",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => fileAttachment.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "file_activity_action_check",
      sql`${table.action} in ('upload_grant_created', 'upload_ready', 'upload_failed', 'download_grant_created', 'preview_grant_created', 'downloaded', 'previewed', 'abandoned')`,
    ),
    index("file_activity_file_index").on(table.fileId, table.createdAt),
  ],
);

export const operationsAuditEntry = pgTable(
  "operations_audit_entry",
  {
    id: text("id").primaryKey(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: text("actor_user_id").references(() => authUser.id, {
      onDelete: "restrict",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    requestId: text("request_id").notNull(),
    safeSummary: jsonb("safe_summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "operations_audit_actor_check",
      sql`(${table.actorKind} = 'user' and ${table.actorUserId} is not null) or (${table.actorKind} = 'system' and ${table.actorUserId} is null)`,
    ),
    check(
      "operations_audit_action_check",
      sql`${table.action} in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed', 'inventory.intake.recognition.requested', 'inventory.intake.recognition.completed', 'catalog.snapshot.imported', 'catalog.machine.resolved', 'catalog.discovery.requested', 'catalog.discovery.completed', 'inventory.machine.actual_specs_updated', 'production.preliminary_inspection.recorded', 'production.disposition.recorded', 'inventory.machine.lifecycle_updated', 'production.worker_specialty.updated', 'production.test_work_order.created', 'production.test_work_order.claimed', 'production.test_work_order.assignment_changed', 'production.test_step.recorded', 'production.test_work_order.completed', 'production.test_work_order.cancelled', 'production.test_session.created', 'production.test_session.orders_added', 'production.test_session.item_state_changed', 'production.test_session.paused', 'production.test_session.resumed', 'production.test_session.finished', 'production.test_session.item_completed', 'production.test_session.item_removed', 'production.test.bearing_concern_reported')`,
    ),
    check(
      "operations_audit_target_type_check",
      sql`${table.targetType} in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch', 'intake_recognition_run', 'catalog_snapshot', 'catalog_resolution', 'catalog_discovery_run', 'machine_actual_specs', 'preliminary_inspection', 'preliminary_disposition', 'production_worker_specialty', 'production_test_work_order', 'production_test_step_result', 'production_test_session', 'production_test_session_event', 'production_test_bearing_concern')`,
    ),
    index("operations_audit_created_index").on(table.createdAt),
    index("operations_audit_action_index").on(table.action, table.createdAt),
    index("operations_audit_target_index").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    index("operations_audit_actor_index").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("operations_audit_request_index").on(table.requestId),
  ],
);

export const platformOutboxJob = pgTable(
  "platform_outbox_job",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: text("actor_user_id").references(() => authUser.id, {
      onDelete: "restrict",
    }),
    requestId: text("request_id").notNull(),
    safeSummary: jsonb("safe_summary").notNull(),
    state: text("state").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseId: text("lease_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    errorCode: text("error_code"),
    version: integer("version").notNull().default(1),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "platform_outbox_actor_check",
      sql`(${table.actorKind} = 'user' and ${table.actorUserId} is not null) or (${table.actorKind} = 'system' and ${table.actorUserId} is null)`,
    ),
    check(
      "platform_outbox_event_type_check",
      sql`${table.eventType} in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed', 'inventory.intake.recognition.requested', 'inventory.intake.recognition.completed', 'catalog.snapshot.imported', 'catalog.machine.resolved', 'catalog.discovery.requested', 'catalog.discovery.completed', 'inventory.machine.actual_specs_updated', 'production.preliminary_inspection.recorded', 'production.disposition.recorded', 'inventory.machine.lifecycle_updated', 'production.worker_specialty.updated', 'production.test_work_order.created', 'production.test_work_order.claimed', 'production.test_work_order.assignment_changed', 'production.test_step.recorded', 'production.test_work_order.completed', 'production.test_work_order.cancelled', 'production.test_session.created', 'production.test_session.orders_added', 'production.test_session.item_state_changed', 'production.test_session.paused', 'production.test_session.resumed', 'production.test_session.finished', 'production.test_session.item_completed', 'production.test_session.item_removed', 'production.test.bearing_concern_reported')`,
    ),
    check(
      "platform_outbox_target_type_check",
      sql`${table.targetType} in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch', 'intake_recognition_run', 'catalog_snapshot', 'catalog_resolution', 'catalog_discovery_run', 'machine_actual_specs', 'preliminary_inspection', 'preliminary_disposition', 'production_worker_specialty', 'production_test_work_order', 'production_test_step_result', 'production_test_session', 'production_test_session_event', 'production_test_bearing_concern')`,
    ),
    check(
      "platform_outbox_state_check",
      sql`${table.state} in ('queued', 'processing', 'retry_wait', 'delivered', 'dead_letter')`,
    ),
    check("platform_outbox_attempt_check", sql`${table.attemptCount} >= 0`),
    check("platform_outbox_version_check", sql`${table.version} > 0`),
    check(
      "platform_outbox_error_code_check",
      sql`${table.errorCode} is null or ${table.errorCode} in ('handler_failed')`,
    ),
    check(
      "platform_outbox_lease_check",
      sql`(${table.state} = 'processing' and ${table.leaseId} is not null and ${table.leaseExpiresAt} is not null) or (${table.state} <> 'processing' and ${table.leaseId} is null and ${table.leaseExpiresAt} is null)`,
    ),
    index("platform_outbox_claim_index").on(
      table.state,
      table.availableAt,
      table.leaseExpiresAt,
    ),
    index("platform_outbox_target_index").on(table.targetType, table.targetId),
    index("platform_outbox_created_index").on(table.createdAt),
  ],
);

export const operationsIdempotencyRecord = pgTable(
  "operations_idempotency_record",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    keyHash: text("key_hash").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    state: text("state").notNull().default("in_progress"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("operations_idempotency_scope_key_unique").on(
      table.scope,
      table.actorUserId,
      table.keyHash,
    ),
    check(
      "operations_idempotency_state_check",
      sql`${table.state} in ('in_progress', 'completed')`,
    ),
    check(
      "operations_idempotency_completion_check",
      sql`(${table.state} = 'in_progress' and ${table.targetType} is null and ${table.targetId} is null and ${table.completedAt} is null) or (${table.state} = 'completed' and ${table.targetType} is not null and ${table.targetId} is not null and ${table.completedAt} is not null)`,
    ),
    check(
      "operations_idempotency_target_type_check",
      sql`${table.targetType} is null or ${table.targetType} in ('load', 'location', 'machine', 'qr_label', 'import_run', 'intake_batch', 'intake_recognition_run', 'preliminary_inspection', 'preliminary_disposition', 'production_worker_specialty', 'production_test_work_order', 'production_test_step_result', 'production_test_session', 'production_test_session_event', 'production_test_bearing_concern')`,
    ),
    index("operations_idempotency_target_index").on(
      table.targetType,
      table.targetId,
    ),
  ],
);

export const productionPreliminaryInspection = pgTable(
  "production_preliminary_inspection",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    condition: text("condition").notNull(),
    bearingAssessment: text("bearing_assessment").notNull(),
    bearingNotes: text("bearing_notes").notNull(),
    missingParts: text("missing_parts").notNull(),
    damage: text("damage").notNull(),
    recommendation: text("recommendation").notNull(),
    recommendationReason: text("recommendation_reason").notNull(),
    inspectedByUserId: text("inspected_by_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "production_inspection_bearing_check",
      sql`${table.bearingAssessment} in ('no_concern_observed', 'concern_observed', 'not_applicable', 'unable_to_assess')`,
    ),
    check(
      "production_inspection_recommendation_check",
      sql`${table.recommendation} in ('repairable', 'hold', 'parts_only', 'scrap', 'owner_review')`,
    ),
    check(
      "production_inspection_reason_check",
      sql`char_length(${table.recommendationReason}) between 1 and 2000`,
    ),
    index("production_inspection_machine_index").on(
      table.machineId,
      table.createdAt,
    ),
  ],
);

export const productionPreliminaryEvidence = pgTable(
  "production_preliminary_evidence",
  {
    inspectionId: text("inspection_id")
      .notNull()
      .references(() => productionPreliminaryInspection.id, {
        onDelete: "restrict",
      }),
    fileId: text("file_id")
      .notNull()
      .references(() => fileAttachment.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.inspectionId, table.fileId],
      name: "production_preliminary_evidence_pk",
    }),
    index("production_preliminary_evidence_file_index").on(table.fileId),
  ],
);

export const productionPreliminaryDisposition = pgTable(
  "production_preliminary_disposition",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    inspectionId: text("inspection_id")
      .notNull()
      .references(() => productionPreliminaryInspection.id, {
        onDelete: "restrict",
      }),
    disposition: text("disposition").notNull(),
    reason: text("reason").notNull(),
    decidedByUserId: text("decided_by_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    approvedByUserId: text("approved_by_user_id").references(
      () => authUser.id,
      { onDelete: "restrict" },
    ),
    requestId: text("request_id").notNull(),
    machineVersion: integer("machine_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "production_disposition_value_check",
      sql`${table.disposition} in ('repairable', 'hold', 'parts_only', 'scrap', 'owner_review')`,
    ),
    check(
      "production_disposition_reason_check",
      sql`char_length(${table.reason}) between 1 and 2000`,
    ),
    check(
      "production_disposition_approval_check",
      sql`${table.disposition} not in ('parts_only', 'scrap') or ${table.approvedByUserId} is not null`,
    ),
    check(
      "production_disposition_version_check",
      sql`${table.machineVersion} > 0`,
    ),
    index("production_disposition_machine_index").on(
      table.machineId,
      table.createdAt,
    ),
    index("production_disposition_inspection_index").on(
      table.inspectionId,
      table.createdAt,
    ),
  ],
);

export const inventoryIntakeBatch = pgTable(
  "inventory_intake_batch",
  {
    id: text("id").primaryKey(),
    loadId: text("load_id")
      .notNull()
      .references(() => inventoryLoad.id, { onDelete: "restrict" }),
    state: text("state").notNull().default("open"),
    version: integer("version").notNull().default(1),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "inventory_intake_batch_state_check",
      sql`${table.state} in ('open', 'committed')`,
    ),
    check("inventory_intake_batch_version_check", sql`${table.version} > 0`),
    index("inventory_intake_batch_load_index").on(
      table.loadId,
      table.createdAt,
    ),
  ],
);

export const inventoryIntakeCandidate = pgTable(
  "inventory_intake_candidate",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => inventoryIntakeBatch.id, { onDelete: "restrict" }),
    state: text("state").notNull().default("draft"),
    machineType: text("machine_type"),
    equipmentClass: text("equipment_class"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serial: text("serial"),
    voltage: text("voltage"),
    phase: text("phase"),
    fuel: text("fuel"),
    capacityLb: integer("capacity_lb"),
    confirmationSource: text("confirmation_source").notNull().default("manual"),
    version: integer("version").notNull().default(1),
    machineTypeSelectedByUserId: text(
      "machine_type_selected_by_user_id",
    ).references(() => authUser.id, { onDelete: "restrict" }),
    machineTypeSelectedAt: timestamp("machine_type_selected_at", {
      withTimezone: true,
    }),
    equipmentClassSelectedByUserId: text(
      "equipment_class_selected_by_user_id",
    ).references(() => authUser.id, { onDelete: "restrict" }),
    equipmentClassSelectedAt: timestamp("equipment_class_selected_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_intake_candidate_id_batch_unique").on(
      table.id,
      table.batchId,
    ),
    index("inventory_intake_candidate_batch_index").on(
      table.batchId,
      table.createdAt,
    ),
    check(
      "inventory_intake_candidate_confirmation_source_check",
      sql`${table.confirmationSource} in ('manual', 'recognition', 'manual_fallback')`,
    ),
    check(
      "inventory_intake_candidate_machine_type_check",
      sql`${table.machineType} is null or ${table.machineType} in ('washer', 'dryer', 'other')`,
    ),
    check(
      "inventory_intake_candidate_equipment_class_check",
      sql`${table.equipmentClass} is null or ${table.equipmentClass} in ('washer', 'dryer', 'stack_dryer', 'stacked_washer_dryer', 'washer_dryer_combo', 'other')`,
    ),
    check(
      "inventory_intake_candidate_capacity_check",
      sql`${table.capacityLb} is null or (${table.capacityLb} > 0 and ${table.capacityLb} <= 2000)`,
    ),
    check(
      "inventory_intake_candidate_state_check",
      sql`${table.state} in ('draft', 'confirmed', 'committed')`,
    ),
    check(
      "inventory_intake_candidate_version_check",
      sql`${table.version} > 0`,
    ),
  ],
);

export const inventoryIntakePhoto = pgTable(
  "inventory_intake_photo",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => inventoryIntakeBatch.id, { onDelete: "restrict" }),
    fileId: text("file_id")
      .notNull()
      .references(() => fileAttachment.id, { onDelete: "restrict" }),
    photoOrder: integer("photo_order").notNull(),
    disposition: text("disposition").notNull().default("unassigned"),
    candidateId: text("candidate_id").references(
      () => inventoryIntakeCandidate.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.candidateId, table.batchId],
      foreignColumns: [
        inventoryIntakeCandidate.id,
        inventoryIntakeCandidate.batchId,
      ],
      name: "inventory_intake_photo_candidate_batch_fk",
    }),
    uniqueIndex("inventory_intake_photo_file_unique").on(table.fileId),
    uniqueIndex("inventory_intake_photo_order_unique").on(
      table.batchId,
      table.photoOrder,
    ),
  ],
);

export const inventoryIntakeMachineMapping = pgTable(
  "inventory_intake_machine_mapping",
  {
    candidateId: text("candidate_id")
      .primaryKey()
      .references(() => inventoryIntakeCandidate.id, { onDelete: "restrict" }),
    batchId: text("batch_id")
      .notNull()
      .references(() => inventoryIntakeBatch.id, { onDelete: "restrict" }),
    machineId: text("machine_id")
      .notNull()
      .unique()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const inventoryIntakeRecognitionRun = pgTable(
  "inventory_intake_recognition_run",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => inventoryIntakeBatch.id, { onDelete: "restrict" }),
    inputVersion: integer("input_version").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    state: text("state").notNull().default("queued"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    verifier: text("verifier").notNull(),
    verifierModel: text("verifier_model").notNull(),
    schemaVersion: text("schema_version").notNull(),
    policyVersion: text("policy_version").notNull(),
    photoId: text("photo_id").references(() => inventoryIntakePhoto.id, {
      onDelete: "restrict",
    }),
    candidateId: text("candidate_id").references(
      () => inventoryIntakeCandidate.id,
      { onDelete: "restrict" },
    ),
    candidateRevision: integer("candidate_revision"),
    errorCode: text("error_code"),
    groups: jsonb("groups").notNull().default([]),
    provenance: jsonb("provenance").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "inventory_intake_recognition_run_state_check",
      sql`${table.state} in ('queued', 'running', 'ready', 'needs_recapture', 'failed', 'stale', 'manual')`,
    ),
    check(
      "inventory_intake_recognition_run_version_check",
      sql`${table.inputVersion} > 0`,
    ),
    check(
      "inventory_intake_recognition_run_fingerprint_check",
      sql`${table.inputFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "inventory_intake_recognition_run_target_check",
      sql`(${table.photoId} is null and ${table.candidateId} is null and ${table.candidateRevision} is null) or (${table.photoId} is not null and ${table.candidateId} is not null and ${table.candidateRevision} > 0)`,
    ),
    index("inventory_intake_recognition_run_batch_index").on(
      table.batchId,
      table.createdAt,
    ),
    index("inventory_intake_recognition_run_photo_index").on(
      table.photoId,
      table.createdAt,
    ),
    index("inventory_intake_recognition_run_candidate_index").on(
      table.candidateId,
      table.createdAt,
    ),
    uniqueIndex("inventory_intake_recognition_run_input_unique")
      .on(table.batchId, table.inputVersion, table.inputFingerprint)
      .where(sql`${table.state} in ('queued', 'running')`),
    uniqueIndex("inventory_intake_recognition_target_active_unique")
      .on(table.photoId, table.candidateId, table.candidateRevision)
      .where(
        sql`${table.photoId} is not null and ${table.state} in ('queued', 'running')`,
      ),
  ],
);

export const inventoryIntakeRecognitionGroup = pgTable(
  "inventory_intake_recognition_group",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => inventoryIntakeRecognitionRun.id, {
        onDelete: "restrict",
      }),
    groupKey: text("group_key").notNull(),
    accepted: boolean("accepted").notNull().default(false),
    reasons: jsonb("reasons").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_intake_recognition_group_key_unique").on(
      table.runId,
      table.groupKey,
    ),
    index("inventory_intake_recognition_group_run_index").on(table.runId),
  ],
);

export const inventoryIntakeRecognitionGroupPhoto = pgTable(
  "inventory_intake_recognition_group_photo",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => inventoryIntakeRecognitionGroup.id, {
        onDelete: "restrict",
      }),
    photoId: text("photo_id")
      .notNull()
      .references(() => inventoryIntakePhoto.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("inventory_intake_recognition_group_photo_unique").on(
      table.groupId,
      table.photoId,
    ),
    index("inventory_intake_recognition_group_photo_photo_index").on(
      table.photoId,
    ),
  ],
);

export const inventoryIntakeRecognitionField = pgTable(
  "inventory_intake_recognition_field",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => inventoryIntakeRecognitionGroup.id, {
        onDelete: "restrict",
      }),
    field: text("field").notNull(),
    value: text("value"),
    accepted: boolean("accepted").notNull().default(false),
    reason: text("reason").notNull(),
    photoId: text("photo_id").references(() => inventoryIntakePhoto.id, {
      onDelete: "restrict",
    }),
    evidenceBox: jsonb("evidence_box"),
    verification: jsonb("verification").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inventory_intake_recognition_field_group_index").on(
      table.groupId,
      table.field,
    ),
  ],
);

export const inventoryIntakeRecapture = pgTable(
  "inventory_intake_recapture",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => inventoryIntakeRecognitionRun.id, {
        onDelete: "restrict",
      }),
    batchId: text("batch_id")
      .notNull()
      .references(() => inventoryIntakeBatch.id, { onDelete: "restrict" }),
    candidateId: text("candidate_id").references(
      () => inventoryIntakeCandidate.id,
      { onDelete: "restrict" },
    ),
    photoIds: jsonb("photo_ids").notNull().default([]),
    field: text("field"),
    reason: text("reason").notNull(),
    instruction: text("instruction").notNull(),
    state: text("state").notNull().default("open"),
    resolvedByUserId: text("resolved_by_user_id").references(
      () => authUser.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "inventory_intake_recapture_state_check",
      sql`${table.state} in ('open', 'evidence_received', 'resolved', 'manual')`,
    ),
    index("inventory_intake_recapture_batch_index").on(
      table.batchId,
      table.state,
      table.createdAt,
    ),
  ],
);

export const catalogSnapshotImport = pgTable("catalog_snapshot_import", {
  datasetId: text("dataset_id").primaryKey(),
  snapshotDate: text("snapshot_date").notNull(),
  checksum: text("checksum").notNull(),
  manufacturerCount: integer("manufacturer_count").notNull(),
  modelCount: integer("model_count").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const catalogManufacturer = pgTable(
  "catalog_manufacturer",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
  },
  (table) => [
    uniqueIndex("catalog_manufacturer_name_unique").on(table.normalizedName),
  ],
);

export const catalogSnapshotManufacturer = pgTable(
  "catalog_snapshot_manufacturer",
  {
    datasetId: text("dataset_id")
      .notNull()
      .references(() => catalogSnapshotImport.datasetId, {
        onDelete: "restrict",
      }),
    manufacturerId: text("manufacturer_id")
      .notNull()
      .references(() => catalogManufacturer.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      columns: [table.datasetId, table.manufacturerId],
      name: "catalog_snapshot_manufacturer_pk",
    }),
  ],
);

export const catalogManufacturerAlias = pgTable(
  "catalog_manufacturer_alias",
  {
    id: text("id").primaryKey(),
    manufacturerId: text("manufacturer_id")
      .notNull()
      .references(() => catalogManufacturer.id, { onDelete: "restrict" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
  },
  (table) => [
    uniqueIndex("catalog_manufacturer_alias_unique").on(
      table.manufacturerId,
      table.normalizedAlias,
    ),
    index("catalog_manufacturer_alias_lookup_index").on(table.normalizedAlias),
  ],
);

export const catalogDiscoveryRun = pgTable(
  "catalog_discovery_run",
  {
    id: text("id").primaryKey(),
    dedupeKey: text("dedupe_key").notNull(),
    manufacturerId: text("manufacturer_id")
      .notNull()
      .references(() => catalogManufacturer.id, { onDelete: "restrict" }),
    normalizedManufacturer: text("normalized_manufacturer").notNull(),
    normalizedModel: text("normalized_model").notNull(),
    provider: text("provider").notNull(),
    providerModel: text("provider_model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    policyVersion: text("policy_version").notNull(),
    status: text("status").notNull().default("running"),
    claimToken: text("claim_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    revisionId: text("revision_id"),
    noResultReason: text("no_result_reason"),
    errorCode: text("error_code"),
    providerRequestId: text("provider_request_id"),
    usage: jsonb("usage"),
    webSearchCallCount: integer("web_search_call_count").notNull().default(0),
    pricing: jsonb("pricing").notNull(),
    estimatedCostUsd: doublePrecision("estimated_cost_usd")
      .notNull()
      .default(0),
    responseFingerprint: text("response_fingerprint"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("catalog_discovery_run_dedupe_unique").on(table.dedupeKey),
    index("catalog_discovery_run_identity_index").on(
      table.normalizedManufacturer,
      table.normalizedModel,
      table.createdAt,
    ),
    check(
      "catalog_discovery_run_status_check",
      sql`${table.status} in ('running', 'published', 'no_result', 'retryable_failure')`,
    ),
    check(
      "catalog_discovery_run_attempt_check",
      sql`${table.attemptCount} >= 0 and ${table.webSearchCallCount} >= 0 and ${table.estimatedCostUsd} >= 0`,
    ),
  ],
);

export const catalogSource = pgTable(
  "catalog_source",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => catalogSnapshotImport.datasetId, {
        onDelete: "restrict",
      }),
    manufacturerId: text("manufacturer_id")
      .notNull()
      .references(() => catalogManufacturer.id, { onDelete: "restrict" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    documentRevision: text("document_revision"),
    checksum: text("checksum"),
    checksumUnavailableReason: text("checksum_unavailable_reason"),
    sourceClass: text("source_class")
      .notNull()
      .default("official_manufacturer"),
    discoveryRunId: text("discovery_run_id").references(
      () => catalogDiscoveryRun.id,
      { onDelete: "restrict" },
    ),
  },
  (table) => [
    index("catalog_source_manufacturer_index").on(table.manufacturerId),
    check(
      "catalog_source_checksum_check",
      sql`(${table.checksum} is not null and ${table.checksum} ~ '^[a-f0-9]{64}$' and ${table.checksumUnavailableReason} is null) or (${table.checksum} is null and ${table.checksumUnavailableReason} is not null and length(${table.checksumUnavailableReason}) > 0)`,
    ),
    check(
      "catalog_source_source_class_check",
      sql`${table.sourceClass} in ('official_manufacturer', 'third_party', 'distributor', 'reseller', 'marketplace', 'unknown')`,
    ),
  ],
);

export const catalogModelFamily = pgTable(
  "catalog_model_family",
  {
    id: text("id").primaryKey(),
    manufacturerId: text("manufacturer_id")
      .notNull()
      .references(() => catalogManufacturer.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
  },
  (table) => [
    index("catalog_model_family_manufacturer_index").on(table.manufacturerId),
  ],
);

export const catalogModelVariant = pgTable(
  "catalog_model_variant",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => catalogModelFamily.id, { onDelete: "restrict" }),
    model: text("model").notNull(),
    normalizedModel: text("normalized_model").notNull(),
    equipmentClass: text("equipment_class").notNull(),
  },
  (table) => [
    check(
      "catalog_model_variant_class_check",
      sql`${table.equipmentClass} in ('washer', 'dryer', 'stack_dryer', 'stacked_washer_dryer', 'washer_dryer_combo', 'other')`,
    ),
    index("catalog_model_variant_lookup_index").on(table.normalizedModel),
    index("catalog_model_variant_family_index").on(table.familyId),
  ],
);

export const catalogModelAlias = pgTable(
  "catalog_model_alias",
  {
    id: text("id").primaryKey(),
    variantId: text("variant_id")
      .notNull()
      .references(() => catalogModelVariant.id, { onDelete: "restrict" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
  },
  (table) => [
    uniqueIndex("catalog_model_alias_unique").on(
      table.variantId,
      table.normalizedAlias,
    ),
    index("catalog_model_alias_lookup_index").on(table.normalizedAlias),
  ],
);

export const catalogSpecRevision = pgTable(
  "catalog_spec_revision",
  {
    id: text("id").primaryKey(),
    variantId: text("variant_id")
      .notNull()
      .references(() => catalogModelVariant.id, { onDelete: "restrict" }),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => catalogSnapshotImport.datasetId, {
        onDelete: "restrict",
      }),
    revision: integer("revision").notNull(),
    status: text("status").notNull().default("approved"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    productionStartYear: integer("production_start_year"),
    productionEndYear: integer("production_end_year"),
    specs: jsonb("specs").notNull(),
    publicationMode: text("publication_mode")
      .notNull()
      .default("reviewed_snapshot"),
    discoveryRunId: text("discovery_run_id").references(
      () => catalogDiscoveryRun.id,
      { onDelete: "restrict" },
    ),
  },
  (table) => [
    uniqueIndex("catalog_spec_revision_variant_revision_unique").on(
      table.variantId,
      table.revision,
    ),
    check(
      "catalog_spec_revision_status_check",
      sql`${table.status} in ('proposed', 'approved', 'rejected', 'superseded')`,
    ),
    check("catalog_spec_revision_number_check", sql`${table.revision} > 0`),
    check(
      "catalog_spec_revision_approval_check",
      sql`${table.status} not in ('approved', 'superseded') or ${table.approvedAt} is not null`,
    ),
    check(
      "catalog_spec_revision_years_check",
      sql`${table.productionStartYear} is null or ${table.productionEndYear} is null or ${table.productionStartYear} <= ${table.productionEndYear}`,
    ),
    check(
      "catalog_spec_revision_publication_mode_check",
      sql`${table.publicationMode} in ('reviewed_snapshot', 'automatic_official_source_policy')`,
    ),
    index("catalog_spec_revision_variant_index").on(table.variantId),
  ],
);

export const catalogFieldEvidence = pgTable(
  "catalog_field_evidence",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => catalogSpecRevision.id, { onDelete: "restrict" }),
    field: text("field").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => catalogSource.id, { onDelete: "restrict" }),
    locator: text("locator").notNull(),
    officialValue: text("official_value"),
    officialUnit: text("official_unit"),
  },
  (table) => [
    index("catalog_field_evidence_revision_index").on(table.revisionId),
    index("catalog_field_evidence_source_index").on(table.sourceId),
  ],
);

export const catalogSerialRule = pgTable(
  "catalog_serial_rule",
  {
    id: text("id").notNull(),
    variantId: text("variant_id")
      .notNull()
      .references(() => catalogModelVariant.id, { onDelete: "restrict" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => catalogSource.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    locator: text("locator").notNull(),
    rule: jsonb("rule").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.revision],
      name: "catalog_serial_rule_revision_unique",
    }),
    index("catalog_serial_rule_variant_index").on(table.variantId),
  ],
);

export const catalogMachineSubject = pgTable("catalog_machine_subject", {
  machineId: text("machine_id")
    .primaryKey()
    .references(() => inventoryMachine.id, { onDelete: "restrict" }),
  identityVersion: integer("identity_version").notNull().default(0),
  identityFingerprint: text("identity_fingerprint"),
});

export const catalogMachineResolution = pgTable(
  "catalog_machine_resolution",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    revisionId: text("revision_id").references(() => catalogSpecRevision.id, {
      onDelete: "restrict",
    }),
    status: text("status").notNull(),
    matchKind: text("match_kind"),
    manufactureDate: jsonb("manufacture_date").notNull(),
    current: boolean("current").notNull().default(true),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "catalog_machine_resolution_status_check",
      sql`${table.status} in ('exact', 'ambiguous', 'unsupported', 'insufficient_input')`,
    ),
    check(
      "catalog_machine_resolution_exact_check",
      sql`(${table.status} = 'exact' and ${table.revisionId} is not null and ${table.matchKind} is not null and ${table.matchKind} in ('canonical', 'alias')) or (${table.status} <> 'exact' and ${table.revisionId} is null and ${table.matchKind} is null)`,
    ),
    uniqueIndex("catalog_machine_resolution_current_unique")
      .on(table.machineId)
      .where(sql`${table.current} = true`),
    index("catalog_machine_resolution_machine_index").on(
      table.machineId,
      table.resolvedAt,
    ),
  ],
);

export const inventoryMachineActualSpecs = pgTable(
  "inventory_machine_actual_specs",
  {
    machineId: text("machine_id")
      .primaryKey()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    widthIn: doublePrecision("width_in"),
    depthIn: doublePrecision("depth_in"),
    heightIn: doublePrecision("height_in"),
    weightLb: doublePrecision("weight_lb"),
    version: integer("version").notNull().default(1),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "inventory_machine_actual_specs_values_check",
      sql`(${table.widthIn} is null or ${table.widthIn} > 0) and (${table.depthIn} is null or ${table.depthIn} > 0) and (${table.heightIn} is null or ${table.heightIn} > 0) and (${table.weightLb} is null or ${table.weightLb} > 0)`,
    ),
    check(
      "inventory_machine_actual_specs_version_check",
      sql`${table.version} > 0`,
    ),
  ],
);

export const productionWorkerSpecialty = pgTable(
  "production_worker_specialty",
  {
    userId: text("user_id")
      .notNull()
      .references(() => identityProfile.userId, { onDelete: "cascade" }),
    machineType: text("machine_type").notNull(),
    assignedByUserId: text("assigned_by_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.machineType],
      name: "production_worker_specialty_pk",
    }),
    check(
      "production_worker_specialty_type_check",
      sql`${table.machineType} in ('washer', 'dryer')`,
    ),
  ],
);

export const productionTestTemplate = pgTable(
  "production_test_template",
  {
    id: text("id").primaryKey(),
    machineType: text("machine_type").notNull(),
    version: integer("version").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("production_test_template_version_unique").on(
      table.machineType,
      table.version,
    ),
    check(
      "production_test_template_type_check",
      sql`${table.machineType} in ('washer', 'dryer')`,
    ),
    check("production_test_template_version_check", sql`${table.version} > 0`),
  ],
);
export const productionTestStep = pgTable(
  "production_test_step",
  {
    templateId: text("template_id")
      .notNull()
      .references(() => productionTestTemplate.id, { onDelete: "restrict" }),
    stepKey: text("step_key").notNull(),
    position: integer("position").notNull(),
    instruction: text("instruction").notNull(),
    allowNa: boolean("allow_na").notNull().default(false),
    stopOnFailure: boolean("stop_on_failure").notNull().default(false),
    photoRequired: boolean("photo_required").notNull().default(false),
  },
  (table) => [
    primaryKey({
      columns: [table.templateId, table.stepKey],
      name: "production_test_step_pk",
    }),
    uniqueIndex("production_test_step_position_unique").on(
      table.templateId,
      table.position,
    ),
  ],
);
export const productionTestWorkOrder = pgTable(
  "production_test_work_order",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    machineType: text("machine_type").notNull(),
    state: text("state").notNull(),
    assignedUserId: text("assigned_user_id").references(() => authUser.id, {
      onDelete: "restrict",
    }),
    activeSessionId: text("active_session_id").references(
      () => productionTestSession.id,
      { onDelete: "restrict" },
    ),
    queuedAt: timestamp("queued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("production_test_one_open_order")
      .on(table.machineId)
      .where(sql`${table.completedAt} is null`),
    index("production_test_queue_order").on(
      table.state,
      table.queuedAt,
      table.id,
    ),
    index("production_test_assignment_order").on(
      table.assignedUserId,
      table.state,
    ),
    index("production_test_work_order_active_session").on(
      table.activeSessionId,
    ),
  ],
);
export const productionTestSession = pgTable(
  "production_test_session",
  {
    id: text("id").primaryKey(),
    workerUserId: text("worker_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    specialty: text("specialty").notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("production_test_one_open_session_per_worker")
      .on(table.workerUserId)
      .where(sql`${table.completedAt} is null`),
    check(
      "production_test_session_specialty_check",
      sql`${table.specialty} in ('washer', 'dryer')`,
    ),
    check(
      "production_test_session_state_check",
      sql`${table.state} in ('active', 'paused', 'completed')`,
    ),
    check("production_test_session_version_check", sql`${table.version} > 0`),
    check(
      "production_test_session_completion_check",
      sql`(${table.state} = 'completed') = (${table.completedAt} is not null)`,
    ),
  ],
);
export const productionTestSessionItem = pgTable(
  "production_test_session_item",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => productionTestSession.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => productionTestWorkOrder.id, { onDelete: "restrict" }),
    state: text("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("production_test_session_item_unique").on(
      table.sessionId,
      table.orderId,
    ),
    uniqueIndex("production_test_one_open_session_per_order")
      .on(table.orderId)
      .where(sql`${table.endedAt} is null`),
    index("production_test_session_item_order").on(
      table.sessionId,
      table.createdAt,
      table.id,
    ),
    check(
      "production_test_session_item_state_check",
      sql`${table.state} in ('working', 'running_cycle', 'waiting', 'completed', 'removed')`,
    ),
    check(
      "production_test_session_item_completion_check",
      sql`(${table.state} in ('completed', 'removed')) = (${table.endedAt} is not null)`,
    ),
  ],
);
export const productionTestSessionEvent = pgTable(
  "production_test_session_event",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => productionTestSession.id, { onDelete: "restrict" }),
    orderId: text("order_id").references(() => productionTestWorkOrder.id, {
      onDelete: "restrict",
    }),
    action: text("action").notNull(),
    itemState: text("item_state"),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("production_test_session_event_order").on(
      table.sessionId,
      table.createdAt,
      table.id,
    ),
    check(
      "production_test_session_event_action_check",
      sql`${table.action} in ('created', 'added', 'item_state_changed', 'paused', 'resumed', 'item_completed', 'item_removed', 'finished')`,
    ),
    check(
      "production_test_session_event_state_check",
      sql`${table.itemState} is null or ${table.itemState} in ('working', 'running_cycle', 'waiting', 'completed', 'removed')`,
    ),
    check(
      "production_test_session_event_shape_check",
      sql`(${table.action} in ('created', 'added', 'item_state_changed', 'item_completed', 'item_removed') and ${table.orderId} is not null and ${table.itemState} is not null) or (${table.action} in ('paused', 'resumed', 'finished') and ${table.orderId} is null and ${table.itemState} is null)`,
    ),
  ],
);
export const productionTestBearingConcern = pgTable(
  "production_test_bearing_concern",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .unique()
      .references(() => productionTestWorkOrder.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
export const productionTestClaimEvent = pgTable(
  "production_test_claim_event",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => productionTestWorkOrder.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    fromUserId: text("from_user_id").references(() => authUser.id, {
      onDelete: "restrict",
    }),
    toUserId: text("to_user_id").references(() => authUser.id, {
      onDelete: "restrict",
    }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("production_test_claim_order").on(table.orderId, table.createdAt),
  ],
);
export const productionTestRun = pgTable("production_test_run", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .unique()
    .references(() => productionTestWorkOrder.id, { onDelete: "restrict" }),
  templateId: text("template_id")
    .notNull()
    .references(() => productionTestTemplate.id, { onDelete: "restrict" }),
  startedByUserId: text("started_by_user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "restrict" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  videoFileId: text("video_file_id")
    .unique()
    .references(() => fileAttachment.id, { onDelete: "restrict" }),
});
export const productionTestRunStep = pgTable(
  "production_test_run_step",
  {
    runId: text("run_id")
      .notNull()
      .references(() => productionTestRun.id, { onDelete: "restrict" }),
    stepKey: text("step_key").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.runId, table.stepKey],
      name: "production_test_run_step_pk",
    }),
  ],
);
export const productionTestStepResult = pgTable(
  "production_test_step_result",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => productionTestRun.id, { onDelete: "restrict" }),
    stepKey: text("step_key").notNull(),
    result: text("result").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    fileId: text("file_id").references(() => fileAttachment.id, {
      onDelete: "restrict",
    }),
    requestId: text("request_id").notNull(),
    orderVersion: integer("order_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("production_test_result_run_order").on(
      table.runId,
      table.orderVersion,
    ),
    uniqueIndex("production_test_step_result_version_unique").on(
      table.runId,
      table.orderVersion,
    ),
    uniqueIndex("production_test_result_file_unique")
      .on(table.fileId)
      .where(sql`${table.fileId} is not null`),
    check(
      "production_test_step_result_order_version_check",
      sql`${table.orderVersion} > 0`,
    ),
    foreignKey({
      columns: [table.runId, table.stepKey],
      foreignColumns: [
        productionTestRunStep.runId,
        productionTestRunStep.stepKey,
      ],
      name: "production_test_step_result_step_fk",
    }),
  ],
);

export const authSchema = {
  user: authUser,
  session: authSession,
  account: authAccount,
  verification: authVerification,
};
