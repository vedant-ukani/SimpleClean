CREATE TABLE "machine_identity_verification_history" (
  "id" text PRIMARY KEY NOT NULL,
  "machine_id" text NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "from_state" text NOT NULL,
  "to_state" text NOT NULL,
  "conflicting_machine_id" text REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "machine_version" integer NOT NULL,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "request_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "machine_identity_verification_history_from_state_check" CHECK ("from_state" in ('provisional', 'verified', 'conflict')),
  CONSTRAINT "machine_identity_verification_history_to_state_check" CHECK ("to_state" in ('verified', 'conflict')),
  CONSTRAINT "machine_identity_verification_history_conflict_check" CHECK (("to_state" = 'conflict' and "conflicting_machine_id" is not null) or ("to_state" = 'verified' and "conflicting_machine_id" is null)),
  CONSTRAINT "machine_identity_verification_history_version_check" CHECK ("machine_version" > 0)
);
--> statement-breakpoint
CREATE INDEX "machine_identity_verification_history_machine_index" ON "machine_identity_verification_history" ("machine_id", "created_at");
--> statement-breakpoint
CREATE TRIGGER "machine_identity_verification_history_immutable"
BEFORE UPDATE OR DELETE ON "machine_identity_verification_history"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
