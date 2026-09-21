import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
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

export const inventoryLocation = pgTable(
  "inventory_location",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
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
    uniqueIndex("inventory_location_code_unique").on(table.code),
    check("inventory_location_version_check", sql`${table.version} > 0`),
    index("inventory_location_active_index").on(table.active),
  ],
);

export const inventoryMachine = pgTable(
  "inventory_machine",
  {
    id: text("id").primaryKey(),
    machineType: text("machine_type").notNull(),
    manufacturer: text("manufacturer"),
    normalizedManufacturer: text("normalized_manufacturer"),
    model: text("model"),
    serial: text("serial"),
    normalizedSerial: text("normalized_serial"),
    voltage: text("voltage"),
    phase: text("phase"),
    fuel: text("fuel"),
    sourceLoadId: text("source_load_id")
      .notNull()
      .references(() => inventoryLoad.id, { onDelete: "restrict" }),
    currentLocationId: text("current_location_id").references(
      () => inventoryLocation.id,
      { onDelete: "restrict" },
    ),
    identityVerificationState: text("identity_verification_state")
      .notNull()
      .default("provisional"),
    conflictingMachineId: text("conflicting_machine_id").references(
      (): AnyPgColumn => inventoryMachine.id,
      { onDelete: "restrict" },
    ),
    inventoryState: text("inventory_state").notNull().default("expected"),
    productionState: text("production_state").notNull().default("not_started"),
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
      "inventory_machine_phase_check",
      sql`${table.phase} is null or ${table.phase} in ('single_phase', 'three_phase')`,
    ),
    check(
      "inventory_machine_fuel_check",
      sql`${table.fuel} is null or ${table.fuel} in ('gas', 'electric', 'steam', 'other')`,
    ),
    check(
      "inventory_machine_identity_state_check",
      sql`${table.identityVerificationState} in ('provisional', 'verified', 'conflict')`,
    ),
    check(
      "inventory_machine_inventory_state_check",
      sql`${table.inventoryState} in ('expected', 'on_hand')`,
    ),
    check(
      "inventory_machine_production_state_check",
      sql`${table.productionState} = 'not_started'`,
    ),
    check("inventory_machine_version_check", sql`${table.version} > 0`),
    index("inventory_machine_load_index").on(table.sourceLoadId),
    index("inventory_machine_location_index").on(table.currentLocationId),
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
    manufacturer: text("manufacturer"),
    model: text("model"),
    serial: text("serial"),
    voltage: text("voltage"),
    phase: text("phase"),
    fuel: text("fuel"),
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
      sql`${table.sourceKind} in ('manual', 'other')`,
    ),
    check(
      "machine_identity_evidence_type_check",
      sql`${table.machineType} in ('washer', 'dryer', 'other')`,
    ),
    check(
      "machine_identity_evidence_phase_check",
      sql`${table.phase} is null or ${table.phase} in ('single_phase', 'three_phase')`,
    ),
    check(
      "machine_identity_evidence_fuel_check",
      sql`${table.fuel} is null or ${table.fuel} in ('gas', 'electric', 'steam', 'other')`,
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

export const machineLocationHistory = pgTable(
  "machine_location_history",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id")
      .notNull()
      .references(() => inventoryMachine.id, { onDelete: "restrict" }),
    fromLocationId: text("from_location_id").references(
      () => inventoryLocation.id,
      { onDelete: "restrict" },
    ),
    toLocationId: text("to_location_id")
      .notNull()
      .references(() => inventoryLocation.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    machineVersion: integer("machine_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "machine_location_history_version_check",
      sql`${table.machineVersion} > 0`,
    ),
    index("machine_location_history_machine_index").on(
      table.machineId,
      table.createdAt,
    ),
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
      sql`${table.purpose} in ('nameplate', 'arrival_condition', 'document', 'receipt', 'other')`,
    ),
    check(
      "file_attachment_nameplate_target_check",
      sql`${table.purpose} <> 'nameplate' or ${table.machineId} is not null`,
    ),
    check(
      "file_attachment_state_check",
      sql`${table.state} in ('pending_upload', 'ready', 'failed', 'abandoned')`,
    ),
    check(
      "file_attachment_declared_media_type_check",
      sql`${table.declaredMediaType} in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')`,
    ),
    check(
      "file_attachment_detected_media_type_check",
      sql`${table.detectedMediaType} is null or ${table.detectedMediaType} in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')`,
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
      sql`${table.operation} in ('upload', 'download')`,
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
      sql`${table.action} in ('upload_grant_created', 'upload_ready', 'upload_failed', 'download_grant_created', 'downloaded', 'abandoned')`,
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
      sql`${table.action} in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued')`,
    ),
    check(
      "operations_audit_target_type_check",
      sql`${table.targetType} in ('user', 'session', 'load', 'location', 'machine', 'file', 'outbox_job')`,
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
      sql`${table.eventType} in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued')`,
    ),
    check(
      "platform_outbox_target_type_check",
      sql`${table.targetType} in ('user', 'session', 'load', 'location', 'machine', 'file', 'outbox_job')`,
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
      sql`${table.targetType} is null or ${table.targetType} in ('load', 'location', 'machine')`,
    ),
    index("operations_idempotency_target_index").on(
      table.targetType,
      table.targetId,
    ),
  ],
);

export const authSchema = {
  user: authUser,
  session: authSession,
  account: authAccount,
  verification: authVerification,
};
