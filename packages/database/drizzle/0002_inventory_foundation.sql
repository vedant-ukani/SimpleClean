CREATE TABLE "inventory_load" (
  "id" text PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "source_name" text,
  "source_reference" text,
  "expected_arrival_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_load_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE INDEX "inventory_load_display_name_index" ON "inventory_load" ("display_name");
--> statement-breakpoint
CREATE INDEX "inventory_load_source_reference_index" ON "inventory_load" ("source_reference");
--> statement-breakpoint
CREATE TABLE "inventory_location" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_location_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_location_code_unique" ON "inventory_location" ("code");
--> statement-breakpoint
CREATE INDEX "inventory_location_active_index" ON "inventory_location" ("active");
--> statement-breakpoint
CREATE TABLE "inventory_machine" (
  "id" text PRIMARY KEY NOT NULL,
  "machine_type" text NOT NULL,
  "manufacturer" text,
  "normalized_manufacturer" text,
  "model" text,
  "serial" text,
  "normalized_serial" text,
  "voltage" text,
  "phase" text,
  "fuel" text,
  "source_load_id" text NOT NULL REFERENCES "inventory_load"("id") ON DELETE restrict,
  "current_location_id" text REFERENCES "inventory_location"("id") ON DELETE restrict,
  "identity_verification_state" text DEFAULT 'provisional' NOT NULL,
  "conflicting_machine_id" text,
  "inventory_state" text DEFAULT 'expected' NOT NULL,
  "production_state" text DEFAULT 'not_started' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_machine_conflicting_machine_fk" FOREIGN KEY ("conflicting_machine_id") REFERENCES "inventory_machine"("id") ON DELETE restrict,
  CONSTRAINT "inventory_machine_type_check" CHECK ("machine_type" in ('washer', 'dryer', 'other')),
  CONSTRAINT "inventory_machine_phase_check" CHECK ("phase" is null or "phase" in ('single_phase', 'three_phase')),
  CONSTRAINT "inventory_machine_fuel_check" CHECK ("fuel" is null or "fuel" in ('gas', 'electric', 'steam', 'other')),
  CONSTRAINT "inventory_machine_identity_state_check" CHECK ("identity_verification_state" in ('provisional', 'verified', 'conflict')),
  CONSTRAINT "inventory_machine_inventory_state_check" CHECK ("inventory_state" in ('expected', 'on_hand')),
  CONSTRAINT "inventory_machine_production_state_check" CHECK ("production_state" = 'not_started'),
  CONSTRAINT "inventory_machine_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE INDEX "inventory_machine_load_index" ON "inventory_machine" ("source_load_id");
--> statement-breakpoint
CREATE INDEX "inventory_machine_location_index" ON "inventory_machine" ("current_location_id");
--> statement-breakpoint
CREATE INDEX "inventory_machine_serial_index" ON "inventory_machine" ("normalized_serial");
--> statement-breakpoint
CREATE INDEX "inventory_machine_manufacturer_index" ON "inventory_machine" ("normalized_manufacturer");
--> statement-breakpoint
CREATE TABLE "machine_identity_evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "machine_id" text NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "source_kind" text NOT NULL,
  "machine_type" text NOT NULL,
  "manufacturer" text,
  "model" text,
  "serial" text,
  "voltage" text,
  "phase" text,
  "fuel" text,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "request_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "machine_identity_evidence_source_check" CHECK ("source_kind" in ('manual', 'other')),
  CONSTRAINT "machine_identity_evidence_type_check" CHECK ("machine_type" in ('washer', 'dryer', 'other')),
  CONSTRAINT "machine_identity_evidence_phase_check" CHECK ("phase" is null or "phase" in ('single_phase', 'three_phase')),
  CONSTRAINT "machine_identity_evidence_fuel_check" CHECK ("fuel" is null or "fuel" in ('gas', 'electric', 'steam', 'other'))
);
--> statement-breakpoint
CREATE INDEX "machine_identity_evidence_machine_index" ON "machine_identity_evidence" ("machine_id", "created_at");
--> statement-breakpoint
CREATE TABLE "machine_identity_claim" (
  "id" text PRIMARY KEY NOT NULL,
  "machine_id" text NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "normalized_manufacturer" text NOT NULL,
  "normalized_serial" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "machine_identity_claim_identity_unique" ON "machine_identity_claim" ("normalized_manufacturer", "normalized_serial");
--> statement-breakpoint
CREATE UNIQUE INDEX "machine_identity_claim_machine_unique" ON "machine_identity_claim" ("machine_id");
--> statement-breakpoint
CREATE TABLE "machine_location_history" (
  "id" text PRIMARY KEY NOT NULL,
  "machine_id" text NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "from_location_id" text REFERENCES "inventory_location"("id") ON DELETE restrict,
  "to_location_id" text NOT NULL REFERENCES "inventory_location"("id") ON DELETE restrict,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "request_id" text NOT NULL,
  "machine_version" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "machine_location_history_version_check" CHECK ("machine_version" > 0)
);
--> statement-breakpoint
CREATE INDEX "machine_location_history_machine_index" ON "machine_location_history" ("machine_id", "created_at");
--> statement-breakpoint
CREATE FUNCTION prevent_inventory_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Inventory history records are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "machine_identity_evidence_immutable"
BEFORE UPDATE OR DELETE ON "machine_identity_evidence"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "machine_location_history_immutable"
BEFORE UPDATE OR DELETE ON "machine_location_history"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
