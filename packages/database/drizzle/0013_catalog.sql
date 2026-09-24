ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_action_check";--> statement-breakpoint
ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_target_type_check";--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_event_type_check";--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_target_type_check";--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_action_check" CHECK ("action" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed', 'inventory.intake.recognition.requested', 'inventory.intake.recognition.completed', 'catalog.snapshot.imported', 'catalog.machine.resolved', 'inventory.machine.actual_specs_updated'));--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch', 'intake_recognition_run', 'catalog_snapshot', 'catalog_resolution', 'machine_actual_specs'));--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_event_type_check" CHECK ("event_type" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed', 'inventory.intake.recognition.requested', 'inventory.intake.recognition.completed', 'catalog.snapshot.imported', 'catalog.machine.resolved', 'inventory.machine.actual_specs_updated'));--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch', 'intake_recognition_run', 'catalog_snapshot', 'catalog_resolution', 'machine_actual_specs'));--> statement-breakpoint

CREATE TABLE "catalog_snapshot_import" (
  "dataset_id" text PRIMARY KEY NOT NULL,
  "snapshot_date" text NOT NULL,
  "checksum" text NOT NULL,
  "manufacturer_count" integer NOT NULL,
  "model_count" integer NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "catalog_snapshot_checksum_check" CHECK ("checksum" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "catalog_snapshot_counts_check" CHECK ("manufacturer_count" > 0 AND "model_count" >= 0)
);--> statement-breakpoint
CREATE TABLE "catalog_manufacturer" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  CONSTRAINT "catalog_manufacturer_name_unique" UNIQUE("normalized_name")
);--> statement-breakpoint
CREATE TABLE "catalog_snapshot_manufacturer" (
  "dataset_id" text NOT NULL REFERENCES "catalog_snapshot_import"("dataset_id") ON DELETE restrict,
  "manufacturer_id" text NOT NULL REFERENCES "catalog_manufacturer"("id") ON DELETE restrict,
  CONSTRAINT "catalog_snapshot_manufacturer_pk" PRIMARY KEY("dataset_id", "manufacturer_id")
);--> statement-breakpoint
CREATE TABLE "catalog_manufacturer_alias" (
  "id" text PRIMARY KEY NOT NULL,
  "manufacturer_id" text NOT NULL REFERENCES "catalog_manufacturer"("id") ON DELETE restrict,
  "alias" text NOT NULL,
  "normalized_alias" text NOT NULL,
  CONSTRAINT "catalog_manufacturer_alias_unique" UNIQUE("manufacturer_id", "normalized_alias")
);--> statement-breakpoint
CREATE INDEX "catalog_manufacturer_alias_lookup_index" ON "catalog_manufacturer_alias" ("normalized_alias");--> statement-breakpoint
CREATE TABLE "catalog_source" (
  "id" text PRIMARY KEY NOT NULL,
  "dataset_id" text NOT NULL REFERENCES "catalog_snapshot_import"("dataset_id") ON DELETE restrict,
  "manufacturer_id" text NOT NULL REFERENCES "catalog_manufacturer"("id") ON DELETE restrict,
  "url" text NOT NULL,
  "title" text NOT NULL,
  "retrieved_at" timestamp with time zone NOT NULL,
  "document_revision" text,
  "checksum" text,
  "checksum_unavailable_reason" text,
  CONSTRAINT "catalog_source_checksum_check" CHECK (("checksum" IS NOT NULL AND "checksum" ~ '^[a-f0-9]{64}$' AND "checksum_unavailable_reason" IS NULL) OR ("checksum" IS NULL AND "checksum_unavailable_reason" IS NOT NULL AND length("checksum_unavailable_reason") > 0))
);--> statement-breakpoint
CREATE INDEX "catalog_source_manufacturer_index" ON "catalog_source" ("manufacturer_id");--> statement-breakpoint
CREATE TABLE "catalog_model_family" (
  "id" text PRIMARY KEY NOT NULL,
  "manufacturer_id" text NOT NULL REFERENCES "catalog_manufacturer"("id") ON DELETE restrict,
  "name" text NOT NULL
);--> statement-breakpoint
CREATE INDEX "catalog_model_family_manufacturer_index" ON "catalog_model_family" ("manufacturer_id");--> statement-breakpoint
CREATE TABLE "catalog_model_variant" (
  "id" text PRIMARY KEY NOT NULL,
  "family_id" text NOT NULL REFERENCES "catalog_model_family"("id") ON DELETE restrict,
  "model" text NOT NULL,
  "normalized_model" text NOT NULL,
  "equipment_class" text NOT NULL,
  CONSTRAINT "catalog_model_variant_class_check" CHECK ("equipment_class" in ('washer', 'dryer', 'stack_dryer', 'stacked_washer_dryer', 'other'))
);--> statement-breakpoint
CREATE INDEX "catalog_model_variant_lookup_index" ON "catalog_model_variant" ("normalized_model");--> statement-breakpoint
CREATE INDEX "catalog_model_variant_family_index" ON "catalog_model_variant" ("family_id");--> statement-breakpoint
CREATE TABLE "catalog_model_alias" (
  "id" text PRIMARY KEY NOT NULL,
  "variant_id" text NOT NULL REFERENCES "catalog_model_variant"("id") ON DELETE restrict,
  "alias" text NOT NULL,
  "normalized_alias" text NOT NULL,
  CONSTRAINT "catalog_model_alias_unique" UNIQUE("variant_id", "normalized_alias")
);--> statement-breakpoint
CREATE INDEX "catalog_model_alias_lookup_index" ON "catalog_model_alias" ("normalized_alias");--> statement-breakpoint
CREATE TABLE "catalog_spec_revision" (
  "id" text PRIMARY KEY NOT NULL,
  "variant_id" text NOT NULL REFERENCES "catalog_model_variant"("id") ON DELETE restrict,
  "dataset_id" text NOT NULL REFERENCES "catalog_snapshot_import"("dataset_id") ON DELETE restrict,
  "revision" integer NOT NULL,
  "status" text DEFAULT 'approved' NOT NULL,
  "approved_at" timestamp with time zone,
  "production_start_year" integer,
  "production_end_year" integer,
  "specs" jsonb NOT NULL,
  CONSTRAINT "catalog_spec_revision_variant_revision_unique" UNIQUE("variant_id", "revision"),
  CONSTRAINT "catalog_spec_revision_status_check" CHECK ("status" in ('proposed', 'approved', 'rejected', 'superseded')),
  CONSTRAINT "catalog_spec_revision_number_check" CHECK ("revision" > 0),
  CONSTRAINT "catalog_spec_revision_approval_check" CHECK ("status" NOT IN ('approved', 'superseded') OR "approved_at" IS NOT NULL),
  CONSTRAINT "catalog_spec_revision_years_check" CHECK ("production_start_year" IS NULL OR "production_end_year" IS NULL OR "production_start_year" <= "production_end_year")
);--> statement-breakpoint
CREATE INDEX "catalog_spec_revision_variant_index" ON "catalog_spec_revision" ("variant_id");--> statement-breakpoint
CREATE TABLE "catalog_field_evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "revision_id" text NOT NULL REFERENCES "catalog_spec_revision"("id") ON DELETE restrict,
  "field" text NOT NULL,
  "source_id" text NOT NULL REFERENCES "catalog_source"("id") ON DELETE restrict,
  "locator" text NOT NULL,
  "official_value" text,
  "official_unit" text
);--> statement-breakpoint
CREATE INDEX "catalog_field_evidence_revision_index" ON "catalog_field_evidence" ("revision_id");--> statement-breakpoint
CREATE INDEX "catalog_field_evidence_source_index" ON "catalog_field_evidence" ("source_id");--> statement-breakpoint
CREATE TABLE "catalog_serial_rule" (
  "id" text NOT NULL,
  "variant_id" text NOT NULL REFERENCES "catalog_model_variant"("id") ON DELETE restrict,
  "source_id" text NOT NULL REFERENCES "catalog_source"("id") ON DELETE restrict,
  "revision" integer NOT NULL,
  "locator" text NOT NULL,
  "rule" jsonb NOT NULL,
  CONSTRAINT "catalog_serial_rule_revision_unique" PRIMARY KEY("id", "revision"),
  CONSTRAINT "catalog_serial_rule_revision_check" CHECK ("revision" > 0)
);--> statement-breakpoint
CREATE INDEX "catalog_serial_rule_variant_index" ON "catalog_serial_rule" ("variant_id");--> statement-breakpoint
CREATE TABLE "catalog_machine_subject" (
  "machine_id" text PRIMARY KEY NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "identity_version" integer NOT NULL DEFAULT 0,
  "identity_fingerprint" text
);--> statement-breakpoint
CREATE TABLE "catalog_machine_resolution" (
  "id" text PRIMARY KEY NOT NULL,
  "machine_id" text NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "revision_id" text REFERENCES "catalog_spec_revision"("id") ON DELETE restrict,
  "status" text NOT NULL,
  "match_kind" text,
  "manufacture_date" jsonb NOT NULL,
  "current" boolean DEFAULT true NOT NULL,
  "resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "catalog_machine_resolution_status_check" CHECK ("status" in ('exact', 'ambiguous', 'unsupported', 'insufficient_input')),
  CONSTRAINT "catalog_machine_resolution_exact_check" CHECK (("status" = 'exact' AND "revision_id" IS NOT NULL AND "match_kind" IS NOT NULL AND "match_kind" in ('canonical', 'alias')) OR ("status" <> 'exact' AND "revision_id" IS NULL AND "match_kind" IS NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_machine_resolution_current_unique" ON "catalog_machine_resolution" ("machine_id") WHERE "current" = true;--> statement-breakpoint
CREATE INDEX "catalog_machine_resolution_machine_index" ON "catalog_machine_resolution" ("machine_id", "resolved_at");--> statement-breakpoint
CREATE TABLE "inventory_machine_actual_specs" (
  "machine_id" text PRIMARY KEY NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "width_in" double precision,
  "depth_in" double precision,
  "height_in" double precision,
  "weight_lb" double precision,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_machine_actual_specs_values_check" CHECK (("width_in" IS NULL OR "width_in" > 0) AND ("depth_in" IS NULL OR "depth_in" > 0) AND ("height_in" IS NULL OR "height_in" > 0) AND ("weight_lb" IS NULL OR "weight_lb" > 0)),
  CONSTRAINT "inventory_machine_actual_specs_version_check" CHECK ("version" > 0)
);
