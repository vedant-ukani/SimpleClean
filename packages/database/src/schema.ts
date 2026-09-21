import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
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

export const authSchema = {
  user: authUser,
  session: authSession,
  account: authAccount,
  verification: authVerification,
};
