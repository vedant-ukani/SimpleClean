ALTER TABLE "machine_identity_evidence" DROP CONSTRAINT "machine_identity_evidence_source_check";
--> statement-breakpoint
ALTER TABLE "machine_identity_evidence" ADD CONSTRAINT "machine_identity_evidence_source_check" CHECK ("source_kind" in ('manual', 'other', 'spreadsheet_import'));
--> statement-breakpoint

ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_action_check";
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_action_check" CHECK ("action" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed'));
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_target_type_check";
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'file', 'outbox_job', 'import_run'));
--> statement-breakpoint

ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_event_type_check";
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_event_type_check" CHECK ("event_type" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed'));
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_target_type_check";
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'file', 'outbox_job', 'import_run'));
--> statement-breakpoint

ALTER TABLE "operations_idempotency_record" DROP CONSTRAINT "operations_idempotency_target_type_check";
--> statement-breakpoint
ALTER TABLE "operations_idempotency_record" ADD CONSTRAINT "operations_idempotency_target_type_check" CHECK ("target_type" is null or "target_type" in ('load', 'location', 'machine', 'import_run'));
--> statement-breakpoint

CREATE TABLE "inventory_import_run" (
  "id" text PRIMARY KEY NOT NULL,
  "source_load_id" text NOT NULL REFERENCES "inventory_load"("id") ON DELETE restrict,
  "storage_key" text NOT NULL,
  "original_filename" text NOT NULL,
  "media_type" text NOT NULL,
  "byte_count" integer NOT NULL,
  "sha256" text NOT NULL,
  "uploader_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "state" text DEFAULT 'staged' NOT NULL,
  "total_rows" integer NOT NULL,
  "ready_rows" integer NOT NULL,
  "warning_rows" integer NOT NULL,
  "error_rows" integer NOT NULL,
  "approved_rows" integer DEFAULT 0 NOT NULL,
  "committed_rows" integer DEFAULT 0 NOT NULL,
  "failure_code" text,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_import_run_state_check" CHECK ("state" in ('staged', 'approved', 'committed', 'commit_failed')),
  CONSTRAINT "inventory_import_run_media_check" CHECK ("media_type" in ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv')),
  CONSTRAINT "inventory_import_run_counts_check" CHECK ("byte_count" > 0 and "total_rows" > 0 and "ready_rows" >= 0 and "warning_rows" >= 0 and "error_rows" >= 0 and "committed_rows" >= 0 and "committed_rows" <= "approved_rows" and "approved_rows" <= "total_rows" and "ready_rows" + "warning_rows" + "error_rows" = "total_rows"),
  CONSTRAINT "inventory_import_run_lifecycle_check" CHECK (("state" = 'staged' and "approved_rows" = 0 and "committed_rows" = 0 and "failure_code" is null) or ("state" = 'approved' and "approved_rows" > 0 and "committed_rows" = 0 and "failure_code" is null) or ("state" = 'committed' and "approved_rows" > 0 and "committed_rows" = "approved_rows" and "failure_code" is null) or ("state" = 'commit_failed' and "approved_rows" > 0 and "committed_rows" = 0 and "failure_code" is not null)),
  CONSTRAINT "inventory_import_run_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "inventory_import_run_failure_code_check" CHECK ("failure_code" is null or "failure_code" in ('duplicate_state_changed', 'commit_failed')),
  CONSTRAINT "inventory_import_run_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_run_storage_key_unique" ON "inventory_import_run" ("storage_key");
--> statement-breakpoint
CREATE INDEX "inventory_import_run_state_index" ON "inventory_import_run" ("state", "created_at");
--> statement-breakpoint
CREATE INDEX "inventory_import_run_load_index" ON "inventory_import_run" ("source_load_id");
--> statement-breakpoint

CREATE TABLE "inventory_import_row" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "inventory_import_run"("id") ON DELETE restrict,
  "sheet_name" text NOT NULL,
  "source_row_number" integer NOT NULL,
  "raw_cells" jsonb NOT NULL,
  "candidate" jsonb NOT NULL,
  "normalized_manufacturer" text,
  "normalized_model" text,
  "normalized_serial" text,
  "match_snapshot" jsonb NOT NULL,
  "match_fingerprint" text NOT NULL,
  "classification" text NOT NULL,
  "findings" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_import_row_classification_check" CHECK ("classification" in ('ready', 'warning', 'error')),
  CONSTRAINT "inventory_import_row_number_check" CHECK ("source_row_number" > 0),
  CONSTRAINT "inventory_import_row_match_snapshot_check" CHECK (jsonb_typeof("match_snapshot") = 'object'),
  CONSTRAINT "inventory_import_row_match_fingerprint_check" CHECK ("match_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_row_source_unique" ON "inventory_import_row" ("run_id", "sheet_name", "source_row_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_row_id_run_unique" ON "inventory_import_row" ("id", "run_id");
--> statement-breakpoint
CREATE INDEX "inventory_import_row_run_classification_index" ON "inventory_import_row" ("run_id", "classification", "source_row_number");
--> statement-breakpoint
CREATE INDEX "inventory_import_row_identity_index" ON "inventory_import_row" ("normalized_manufacturer", "normalized_serial");
--> statement-breakpoint

CREATE TABLE "inventory_import_approval" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "inventory_import_run"("id") ON DELETE restrict,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "request_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_approval_run_unique" ON "inventory_import_approval" ("run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_approval_id_run_unique" ON "inventory_import_approval" ("id", "run_id");
--> statement-breakpoint

CREATE TABLE "inventory_import_approval_row" (
  "approval_id" text NOT NULL REFERENCES "inventory_import_approval"("id") ON DELETE restrict,
  "run_id" text NOT NULL,
  "row_id" text NOT NULL REFERENCES "inventory_import_row"("id") ON DELETE restrict,
  CONSTRAINT "inventory_import_approval_row_approval_run_fk" FOREIGN KEY ("approval_id", "run_id") REFERENCES "inventory_import_approval"("id", "run_id") ON DELETE restrict,
  CONSTRAINT "inventory_import_approval_row_row_run_fk" FOREIGN KEY ("row_id", "run_id") REFERENCES "inventory_import_row"("id", "run_id") ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_approval_row_unique" ON "inventory_import_approval_row" ("approval_id", "row_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_approval_selected_once" ON "inventory_import_approval_row" ("row_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_approval_row_reference_unique" ON "inventory_import_approval_row" ("approval_id", "run_id", "row_id");
--> statement-breakpoint

CREATE TABLE "inventory_import_machine_mapping" (
  "id" text PRIMARY KEY NOT NULL,
  "approval_id" text NOT NULL,
  "run_id" text NOT NULL,
  "row_id" text NOT NULL,
  "machine_id" text NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_import_mapping_approved_row_fk" FOREIGN KEY ("approval_id", "run_id", "row_id") REFERENCES "inventory_import_approval_row"("approval_id", "run_id", "row_id") ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_mapping_row_unique" ON "inventory_import_machine_mapping" ("row_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_mapping_machine_unique" ON "inventory_import_machine_mapping" ("machine_id");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_import_source_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.source_load_id IS DISTINCT FROM OLD.source_load_id
    OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
    OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
    OR NEW.media_type IS DISTINCT FROM OLD.media_type
    OR NEW.byte_count IS DISTINCT FROM OLD.byte_count
    OR NEW.sha256 IS DISTINCT FROM OLD.sha256
    OR NEW.uploader_user_id IS DISTINCT FROM OLD.uploader_user_id
    OR NEW.total_rows IS DISTINCT FROM OLD.total_rows
    OR NEW.ready_rows IS DISTINCT FROM OLD.ready_rows
    OR NEW.warning_rows IS DISTINCT FROM OLD.warning_rows
    OR NEW.error_rows IS DISTINCT FROM OLD.error_rows
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'import source evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_import_run_source_immutable" BEFORE UPDATE ON "inventory_import_run" FOR EACH ROW EXECUTE FUNCTION prevent_import_source_mutation();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_import_run_transition() RETURNS trigger AS $$
DECLARE
  approval_count integer;
  mapping_count integer;
BEGIN
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'import lifecycle version must advance exactly once';
  END IF;

  IF OLD.state = 'staged' AND NEW.state = 'approved' THEN
    SELECT count(*) INTO approval_count
    FROM inventory_import_approval_row WHERE run_id = OLD.id;
    IF approval_count = 0 OR approval_count <> NEW.approved_rows THEN
      RAISE EXCEPTION 'approved row count does not match immutable approval evidence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state = 'approved' AND NEW.state = 'commit_failed' THEN
    IF NEW.approved_rows <> OLD.approved_rows OR NEW.committed_rows <> 0 THEN
      RAISE EXCEPTION 'failed import counts cannot change';
    END IF;
    SELECT count(*) INTO mapping_count
    FROM inventory_import_machine_mapping WHERE run_id = OLD.id;
    IF mapping_count <> 0 THEN
      RAISE EXCEPTION 'failed import cannot retain machine mappings';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state = 'approved' AND NEW.state = 'committed' THEN
    IF NEW.approved_rows <> OLD.approved_rows THEN
      RAISE EXCEPTION 'approved import selection cannot change during commit';
    END IF;
    SELECT count(*) INTO mapping_count
    FROM inventory_import_machine_mapping WHERE run_id = OLD.id;
    IF mapping_count <> NEW.committed_rows OR mapping_count <> NEW.approved_rows THEN
      RAISE EXCEPTION 'committed row count does not match approved mapping evidence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state = 'commit_failed' AND OLD.failure_code = 'commit_failed'
    AND NEW.state = 'committed' THEN
    IF NEW.approved_rows <> OLD.approved_rows THEN
      RAISE EXCEPTION 'approved import selection cannot change during retry';
    END IF;
    SELECT count(*) INTO mapping_count
    FROM inventory_import_machine_mapping WHERE run_id = OLD.id;
    IF mapping_count <> NEW.committed_rows OR mapping_count <> NEW.approved_rows THEN
      RAISE EXCEPTION 'committed row count does not match approved mapping evidence';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state = 'commit_failed' AND OLD.failure_code = 'commit_failed'
    AND NEW.state = 'commit_failed'
    AND NEW.failure_code in ('commit_failed', 'duplicate_state_changed') THEN
    IF NEW.approved_rows <> OLD.approved_rows OR NEW.committed_rows <> 0 THEN
      RAISE EXCEPTION 'failed import counts cannot change';
    END IF;
    SELECT count(*) INTO mapping_count
    FROM inventory_import_machine_mapping WHERE run_id = OLD.id;
    IF mapping_count <> 0 THEN
      RAISE EXCEPTION 'failed import cannot retain machine mappings';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid import lifecycle transition from % to %', OLD.state, NEW.state;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_import_run_transition_guard" BEFORE UPDATE ON "inventory_import_run" FOR EACH ROW EXECUTE FUNCTION enforce_import_run_transition();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_import_approval_insert() RETURNS trigger AS $$
DECLARE
  run_state text;
BEGIN
  SELECT state INTO run_state FROM inventory_import_run WHERE id = NEW.run_id;
  IF run_state IS DISTINCT FROM 'staged' THEN
    RAISE EXCEPTION 'approval evidence can only be created for a staged import';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_import_approval_insert_guard" BEFORE INSERT ON "inventory_import_approval" FOR EACH ROW EXECUTE FUNCTION validate_import_approval_insert();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_import_approval_row_insert() RETURNS trigger AS $$
DECLARE
  run_state text;
  row_classification text;
BEGIN
  SELECT state INTO run_state FROM inventory_import_run WHERE id = NEW.run_id;
  SELECT classification INTO row_classification
  FROM inventory_import_row WHERE id = NEW.row_id AND run_id = NEW.run_id;
  IF run_state IS DISTINCT FROM 'staged' THEN
    RAISE EXCEPTION 'approval rows can only be selected for a staged import';
  END IF;
  IF row_classification IS NULL OR row_classification = 'error' THEN
    RAISE EXCEPTION 'error or unknown import row cannot be approved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_import_approval_row_insert_guard" BEFORE INSERT ON "inventory_import_approval_row" FOR EACH ROW EXECUTE FUNCTION validate_import_approval_row_insert();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_import_row_insert() RETURNS trigger AS $$
DECLARE
  run_state text;
  expected_rows integer;
  current_rows integer;
BEGIN
  SELECT state, total_rows INTO run_state, expected_rows
  FROM inventory_import_run WHERE id = NEW.run_id FOR UPDATE;
  IF run_state IS DISTINCT FROM 'staged' THEN
    RAISE EXCEPTION 'staged row evidence cannot be added after review begins';
  END IF;
  SELECT count(*) INTO current_rows
  FROM inventory_import_row WHERE run_id = NEW.run_id;
  IF current_rows >= expected_rows THEN
    RAISE EXCEPTION 'staged row evidence is already complete';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_import_row_insert_guard" BEFORE INSERT ON "inventory_import_row" FOR EACH ROW EXECUTE FUNCTION validate_import_row_insert();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_import_mapping_insert() RETURNS trigger AS $$
DECLARE
  run_state text;
  run_failure_code text;
BEGIN
  SELECT state, failure_code INTO run_state, run_failure_code
  FROM inventory_import_run WHERE id = NEW.run_id;
  IF run_state = 'approved'
    OR (run_state = 'commit_failed' AND run_failure_code = 'commit_failed') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'machine mapping cannot be created in the current import lifecycle';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_import_mapping_insert_guard" BEFORE INSERT ON "inventory_import_machine_mapping" FOR EACH ROW EXECUTE FUNCTION validate_import_mapping_insert();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_import_evidence_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'import evidence is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_import_row_immutable" BEFORE UPDATE OR DELETE ON "inventory_import_row" FOR EACH ROW EXECUTE FUNCTION prevent_import_evidence_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_import_approval_immutable" BEFORE UPDATE OR DELETE ON "inventory_import_approval" FOR EACH ROW EXECUTE FUNCTION prevent_import_evidence_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_import_approval_row_immutable" BEFORE UPDATE OR DELETE ON "inventory_import_approval_row" FOR EACH ROW EXECUTE FUNCTION prevent_import_evidence_mutation();
--> statement-breakpoint
CREATE TRIGGER "inventory_import_mapping_immutable" BEFORE UPDATE OR DELETE ON "inventory_import_machine_mapping" FOR EACH ROW EXECUTE FUNCTION prevent_import_evidence_mutation();
--> statement-breakpoint
