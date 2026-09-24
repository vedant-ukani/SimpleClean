ALTER TABLE "file_attachment" ADD COLUMN "preview_storage_key" text;
--> statement-breakpoint
ALTER TABLE "file_attachment" ADD COLUMN "preview_byte_count" integer;
--> statement-breakpoint
ALTER TABLE "file_attachment" ADD COLUMN "preview_sha256" text;
--> statement-breakpoint
ALTER TABLE "file_attachment" DROP CONSTRAINT "file_attachment_purpose_check";
--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_purpose_check" CHECK ("purpose" in ('nameplate', 'arrival_condition', 'document', 'receipt', 'other', 'intake_evidence'));
--> statement-breakpoint
ALTER TABLE "file_attachment" DROP CONSTRAINT "file_attachment_declared_media_type_check";
--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_declared_media_type_check" CHECK ("declared_media_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'));
--> statement-breakpoint
ALTER TABLE "file_attachment" DROP CONSTRAINT "file_attachment_detected_media_type_check";
--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_detected_media_type_check" CHECK ("detected_media_type" is null or "detected_media_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'));
--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_preview_check" CHECK (("preview_storage_key" is null and "preview_byte_count" is null and "preview_sha256" is null) or ("preview_storage_key" is not null and "preview_byte_count" > 0 and "preview_sha256" ~ '^[a-f0-9]{64}$'));
--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_intake_target_check" CHECK ("purpose" <> 'intake_evidence' or "load_id" is not null);
--> statement-breakpoint
ALTER TABLE "file_access_grant" DROP CONSTRAINT "file_access_grant_operation_check";
--> statement-breakpoint
ALTER TABLE "file_access_grant" ADD CONSTRAINT "file_access_grant_operation_check" CHECK ("operation" in ('upload', 'download', 'preview'));
--> statement-breakpoint
ALTER TABLE "file_activity" DROP CONSTRAINT "file_activity_action_check";
--> statement-breakpoint
ALTER TABLE "file_activity" ADD CONSTRAINT "file_activity_action_check" CHECK ("action" in ('upload_grant_created', 'upload_ready', 'upload_failed', 'download_grant_created', 'preview_grant_created', 'downloaded', 'previewed', 'abandoned'));
--> statement-breakpoint
ALTER TABLE "machine_identity_evidence" DROP CONSTRAINT "machine_identity_evidence_source_check";
--> statement-breakpoint
ALTER TABLE "machine_identity_evidence" ADD CONSTRAINT "machine_identity_evidence_source_check" CHECK ("source_kind" in ('manual', 'other', 'spreadsheet_import', 'photo_intake'));
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_action_check";
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_action_check" CHECK ("action" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed'));
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_target_type_check";
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch'));
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_event_type_check";
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_event_type_check" CHECK ("event_type" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed'));
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_target_type_check";
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch'));
--> statement-breakpoint
ALTER TABLE "operations_idempotency_record" DROP CONSTRAINT "operations_idempotency_target_type_check";
--> statement-breakpoint
ALTER TABLE "operations_idempotency_record" ADD CONSTRAINT "operations_idempotency_target_type_check" CHECK ("target_type" is null or "target_type" in ('load', 'location', 'machine', 'qr_label', 'import_run', 'intake_batch'));
--> statement-breakpoint

CREATE TABLE "inventory_intake_batch" (
  "id" text PRIMARY KEY NOT NULL,
  "load_id" text NOT NULL REFERENCES "inventory_load"("id") ON DELETE restrict,
  "state" text DEFAULT 'open' NOT NULL,
  "destination_location_id" text REFERENCES "inventory_location"("id") ON DELETE restrict,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_intake_batch_state_check" CHECK ("state" in ('open', 'committed')),
  CONSTRAINT "inventory_intake_batch_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE INDEX "inventory_intake_batch_load_index" ON "inventory_intake_batch" ("load_id", "created_at");
--> statement-breakpoint

CREATE TABLE "inventory_intake_photo" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL REFERENCES "inventory_intake_batch"("id") ON DELETE restrict,
  "file_id" text NOT NULL REFERENCES "file_attachment"("id") ON DELETE restrict,
  "photo_order" integer NOT NULL,
  "disposition" text DEFAULT 'unassigned' NOT NULL,
  "candidate_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_intake_photo_disposition_check" CHECK ("disposition" in ('unassigned', 'excluded', 'assigned')),
  CONSTRAINT "inventory_intake_photo_order_check" CHECK ("photo_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_intake_photo_file_unique" ON "inventory_intake_photo" ("file_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_intake_photo_order_unique" ON "inventory_intake_photo" ("batch_id", "photo_order");
--> statement-breakpoint
CREATE INDEX "inventory_intake_photo_batch_index" ON "inventory_intake_photo" ("batch_id", "photo_order");
--> statement-breakpoint

CREATE TABLE "inventory_intake_candidate" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL REFERENCES "inventory_intake_batch"("id") ON DELETE restrict,
  "state" text DEFAULT 'draft' NOT NULL,
  "machine_type" text,
  "manufacturer" text,
  "model" text,
  "serial" text,
  "voltage" text,
  "phase" text,
  "fuel" text,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_intake_candidate_state_check" CHECK ("state" in ('draft', 'confirmed')),
  CONSTRAINT "inventory_intake_candidate_version_check" CHECK ("version" > 0),
  CONSTRAINT "inventory_intake_candidate_id_batch_unique" UNIQUE ("id", "batch_id")
);
--> statement-breakpoint
CREATE INDEX "inventory_intake_candidate_batch_index" ON "inventory_intake_candidate" ("batch_id", "created_at");
--> statement-breakpoint
ALTER TABLE "inventory_intake_photo" ADD CONSTRAINT "inventory_intake_photo_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "inventory_intake_candidate"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "inventory_intake_photo" ADD CONSTRAINT "inventory_intake_photo_candidate_batch_fk" FOREIGN KEY ("candidate_id", "batch_id") REFERENCES "inventory_intake_candidate"("id", "batch_id") ON DELETE restrict;
--> statement-breakpoint

CREATE TABLE "inventory_intake_warning_ack" (
  "candidate_id" text NOT NULL REFERENCES "inventory_intake_candidate"("id") ON DELETE restrict,
  "warning_kind" text NOT NULL,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_intake_warning_kind_check" CHECK ("warning_kind" in ('serial_match', 'serial_only_match', 'manufacturer_model_match')),
  PRIMARY KEY ("candidate_id", "warning_kind")
);
--> statement-breakpoint

CREATE TABLE "inventory_intake_machine_mapping" (
  "candidate_id" text PRIMARY KEY REFERENCES "inventory_intake_candidate"("id") ON DELETE restrict,
  "batch_id" text NOT NULL REFERENCES "inventory_intake_batch"("id") ON DELETE restrict,
  "machine_id" text NOT NULL UNIQUE REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_intake_mapping_candidate_batch_fk" FOREIGN KEY ("candidate_id", "batch_id") REFERENCES "inventory_intake_candidate"("id", "batch_id") ON DELETE restrict
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_intake_committed_mutation() RETURNS trigger AS $$
DECLARE
  batch_id_value text;
BEGIN
  IF TG_TABLE_NAME = 'inventory_intake_warning_ack' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT c.batch_id INTO batch_id_value FROM inventory_intake_candidate c WHERE c.id = OLD.candidate_id;
    ELSE
      SELECT c.batch_id INTO batch_id_value FROM inventory_intake_candidate c WHERE c.id = COALESCE(OLD.candidate_id, NEW.candidate_id);
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      batch_id_value := OLD.batch_id;
    ELSE
      batch_id_value := COALESCE(OLD.batch_id, NEW.batch_id);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_intake_batch b WHERE b.id = batch_id_value AND b.state = 'committed') THEN
    RAISE EXCEPTION 'committed intake evidence is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_intake_batch_lifecycle() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'intake batch history is immutable';
  END IF;
  IF OLD.state = 'committed' THEN
    RAISE EXCEPTION 'committed intake batch is immutable';
  ELSIF NEW.state <> OLD.state AND NOT (OLD.state = 'open' AND NEW.state = 'committed') THEN
    RAISE EXCEPTION 'invalid intake batch lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_batch_lifecycle_guard" BEFORE UPDATE OR DELETE ON "inventory_intake_batch" FOR EACH ROW EXECUTE FUNCTION enforce_intake_batch_lifecycle();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_photo_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "inventory_intake_photo" FOR EACH ROW EXECUTE FUNCTION prevent_intake_committed_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_candidate_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "inventory_intake_candidate" FOR EACH ROW EXECUTE FUNCTION prevent_intake_committed_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_warning_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "inventory_intake_warning_ack" FOR EACH ROW EXECUTE FUNCTION prevent_intake_committed_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_mapping_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "inventory_intake_machine_mapping" FOR EACH ROW EXECUTE FUNCTION prevent_intake_committed_mutation();
