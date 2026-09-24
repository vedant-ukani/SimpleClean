ALTER TABLE "inventory_intake_candidate" ADD COLUMN "confirmation_source" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_intake_candidate" ADD CONSTRAINT "inventory_intake_candidate_confirmation_source_check" CHECK ("confirmation_source" in ('manual', 'recognition', 'manual_fallback'));
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_action_check";
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_action_check" CHECK ("action" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed', 'inventory.intake.recognition.requested', 'inventory.intake.recognition.completed'));
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_event_type_check";
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_event_type_check" CHECK ("event_type" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed', 'inventory.intake.recognition.requested', 'inventory.intake.recognition.completed'));
--> statement-breakpoint
ALTER TABLE "operations_idempotency_record" DROP CONSTRAINT "operations_idempotency_target_type_check";
--> statement-breakpoint
ALTER TABLE "operations_idempotency_record" ADD CONSTRAINT "operations_idempotency_target_type_check" CHECK ("target_type" is null or "target_type" in ('load', 'location', 'machine', 'qr_label', 'import_run', 'intake_batch'));
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_target_type_check";
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch', 'intake_recognition_run'));
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_target_type_check";
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch', 'intake_recognition_run'));
--> statement-breakpoint

CREATE TABLE "inventory_intake_recognition_run" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL REFERENCES "inventory_intake_batch"("id") ON DELETE restrict,
  "input_version" integer NOT NULL,
  "input_fingerprint" text NOT NULL,
  "state" text DEFAULT 'queued' NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "verifier" text NOT NULL,
  "verifier_model" text NOT NULL,
  "schema_version" text NOT NULL,
  "policy_version" text NOT NULL,
  "error_code" text,
  "groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_intake_recognition_run_state_check" CHECK ("state" in ('queued', 'running', 'ready', 'needs_recapture', 'failed', 'stale', 'manual')),
  CONSTRAINT "inventory_intake_recognition_run_version_check" CHECK ("input_version" > 0),
  CONSTRAINT "inventory_intake_recognition_run_fingerprint_check" CHECK ("input_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX "inventory_intake_recognition_run_batch_index" ON "inventory_intake_recognition_run" ("batch_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_intake_recognition_run_input_unique" ON "inventory_intake_recognition_run" ("batch_id", "input_version", "input_fingerprint");
--> statement-breakpoint

CREATE TABLE "inventory_intake_recognition_group" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "inventory_intake_recognition_run"("id") ON DELETE restrict,
  "group_key" text NOT NULL,
  "accepted" boolean DEFAULT false NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_intake_recognition_group_key_unique" ON "inventory_intake_recognition_group" ("run_id", "group_key");
--> statement-breakpoint
CREATE INDEX "inventory_intake_recognition_group_run_index" ON "inventory_intake_recognition_group" ("run_id");
--> statement-breakpoint

CREATE TABLE "inventory_intake_recognition_group_photo" (
  "group_id" text NOT NULL REFERENCES "inventory_intake_recognition_group"("id") ON DELETE restrict,
  "photo_id" text NOT NULL REFERENCES "inventory_intake_photo"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_intake_recognition_group_photo_unique" ON "inventory_intake_recognition_group_photo" ("group_id", "photo_id");
--> statement-breakpoint
CREATE INDEX "inventory_intake_recognition_group_photo_photo_index" ON "inventory_intake_recognition_group_photo" ("photo_id");
--> statement-breakpoint

CREATE TABLE "inventory_intake_recognition_field" (
  "id" text PRIMARY KEY NOT NULL,
  "group_id" text NOT NULL REFERENCES "inventory_intake_recognition_group"("id") ON DELETE restrict,
  "field" text NOT NULL,
  "value" text,
  "accepted" boolean DEFAULT false NOT NULL,
  "reason" text NOT NULL,
  "photo_id" text REFERENCES "inventory_intake_photo"("id") ON DELETE restrict,
  "evidence_box" jsonb,
  "verification" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inventory_intake_recognition_field_group_index" ON "inventory_intake_recognition_field" ("group_id", "field");
--> statement-breakpoint

CREATE TABLE "inventory_intake_recapture" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "inventory_intake_recognition_run"("id") ON DELETE restrict,
  "batch_id" text NOT NULL REFERENCES "inventory_intake_batch"("id") ON DELETE restrict,
  "candidate_id" text REFERENCES "inventory_intake_candidate"("id") ON DELETE restrict,
  "photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "field" text,
  "reason" text NOT NULL,
  "instruction" text NOT NULL,
  "state" text DEFAULT 'open' NOT NULL,
  "resolved_by_user_id" text REFERENCES "user"("id") ON DELETE restrict,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_intake_recapture_state_check" CHECK ("state" in ('open', 'evidence_received', 'resolved', 'manual'))
);
--> statement-breakpoint
CREATE INDEX "inventory_intake_recapture_batch_index" ON "inventory_intake_recapture" ("batch_id", "state", "created_at");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_intake_recognition_committed_mutation() RETURNS trigger AS $$
DECLARE
  batch_id_value text;
BEGIN
  batch_id_value := COALESCE(to_jsonb(NEW)->>'batch_id', to_jsonb(OLD)->>'batch_id');
  IF TG_TABLE_NAME = 'inventory_intake_recognition_group' THEN
    SELECT r.batch_id INTO batch_id_value FROM inventory_intake_recognition_run r WHERE r.id = COALESCE(to_jsonb(NEW)->>'run_id', to_jsonb(OLD)->>'run_id');
  ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_group_photo' THEN
    SELECT r.batch_id INTO batch_id_value FROM inventory_intake_recognition_group g INNER JOIN inventory_intake_recognition_run r ON r.id = g.run_id WHERE g.id = COALESCE(to_jsonb(NEW)->>'group_id', to_jsonb(OLD)->>'group_id');
  ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_field' THEN
    SELECT r.batch_id INTO batch_id_value FROM inventory_intake_recognition_group g INNER JOIN inventory_intake_recognition_run r ON r.id = g.run_id WHERE g.id = COALESCE(to_jsonb(NEW)->>'group_id', to_jsonb(OLD)->>'group_id');
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_intake_batch b WHERE b.id = batch_id_value AND b.state = 'committed') THEN
    RAISE EXCEPTION 'committed intake recognition is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_run_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "inventory_intake_recognition_run" FOR EACH ROW EXECUTE FUNCTION prevent_intake_recognition_committed_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_group_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "inventory_intake_recognition_group" FOR EACH ROW EXECUTE FUNCTION prevent_intake_recognition_committed_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_group_photo_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "inventory_intake_recognition_group_photo" FOR EACH ROW EXECUTE FUNCTION prevent_intake_recognition_committed_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_field_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "inventory_intake_recognition_field" FOR EACH ROW EXECUTE FUNCTION prevent_intake_recognition_committed_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_recapture_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "inventory_intake_recapture" FOR EACH ROW EXECUTE FUNCTION prevent_intake_recognition_committed_mutation();
