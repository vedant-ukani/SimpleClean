ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_action_check";--> statement-breakpoint
ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_target_type_check";--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_event_type_check";--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_target_type_check";--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_action_check" CHECK ("action" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed', 'inventory.intake.recognition.requested', 'inventory.intake.recognition.completed', 'catalog.snapshot.imported', 'catalog.machine.resolved', 'catalog.discovery.requested', 'catalog.discovery.completed', 'inventory.machine.actual_specs_updated'));--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch', 'intake_recognition_run', 'catalog_snapshot', 'catalog_resolution', 'catalog_discovery_run', 'machine_actual_specs'));--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_event_type_check" CHECK ("event_type" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed', 'inventory.intake.batch.created', 'inventory.intake.batch.reviewed', 'inventory.intake.batch.committed', 'inventory.intake.recognition.requested', 'inventory.intake.recognition.completed', 'catalog.snapshot.imported', 'catalog.machine.resolved', 'catalog.discovery.requested', 'catalog.discovery.completed', 'inventory.machine.actual_specs_updated'));--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run', 'intake_batch', 'intake_recognition_run', 'catalog_snapshot', 'catalog_resolution', 'catalog_discovery_run', 'machine_actual_specs'));--> statement-breakpoint

CREATE TABLE "catalog_discovery_run" (
  "id" text PRIMARY KEY NOT NULL,
  "dedupe_key" text NOT NULL,
  "manufacturer_id" text NOT NULL REFERENCES "catalog_manufacturer"("id") ON DELETE restrict,
  "normalized_manufacturer" text NOT NULL,
  "normalized_model" text NOT NULL,
  "provider" text NOT NULL,
  "provider_model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "schema_version" text NOT NULL,
  "policy_version" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "claim_token" text,
  "lease_expires_at" timestamp with time zone,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "revision_id" text,
  "no_result_reason" text,
  "error_code" text,
  "provider_request_id" text,
  "usage" jsonb,
  "web_search_call_count" integer DEFAULT 0 NOT NULL,
  "pricing" jsonb NOT NULL,
  "estimated_cost_usd" double precision DEFAULT 0 NOT NULL,
  "response_fingerprint" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "catalog_discovery_run_status_check" CHECK ("status" in ('running', 'published', 'no_result', 'retryable_failure')),
  CONSTRAINT "catalog_discovery_run_attempt_check" CHECK ("attempt_count" >= 0 AND "web_search_call_count" >= 0 AND "estimated_cost_usd" >= 0),
  CONSTRAINT "catalog_discovery_run_fingerprint_check" CHECK ("response_fingerprint" IS NULL OR "response_fingerprint" ~ '^[a-f0-9]{64}$')
);--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_discovery_run_dedupe_unique" ON "catalog_discovery_run" ("dedupe_key");--> statement-breakpoint
CREATE INDEX "catalog_discovery_run_identity_index" ON "catalog_discovery_run" ("normalized_manufacturer", "normalized_model", "created_at");--> statement-breakpoint

ALTER TABLE "catalog_source" ADD COLUMN "source_class" text DEFAULT 'official_manufacturer' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_source" ADD COLUMN "discovery_run_id" text REFERENCES "catalog_discovery_run"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "catalog_source" ADD CONSTRAINT "catalog_source_source_class_check" CHECK ("source_class" in ('official_manufacturer', 'third_party', 'distributor', 'reseller', 'marketplace', 'unknown'));--> statement-breakpoint
ALTER TABLE "catalog_spec_revision" ADD COLUMN "publication_mode" text DEFAULT 'reviewed_snapshot' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_spec_revision" ADD COLUMN "discovery_run_id" text REFERENCES "catalog_discovery_run"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "catalog_spec_revision" ADD CONSTRAINT "catalog_spec_revision_publication_mode_check" CHECK ("publication_mode" in ('reviewed_snapshot', 'automatic_official_source_policy'));--> statement-breakpoint
ALTER TABLE "catalog_discovery_run" ADD CONSTRAINT "catalog_discovery_run_revision_fk" FOREIGN KEY ("revision_id") REFERENCES "catalog_spec_revision"("id") ON DELETE restrict;
