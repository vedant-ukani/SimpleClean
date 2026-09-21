ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_action_check";
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_action_check" CHECK ("action" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed'));
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" DROP CONSTRAINT "operations_audit_target_type_check";
--> statement-breakpoint
ALTER TABLE "operations_audit_entry" ADD CONSTRAINT "operations_audit_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run'));
--> statement-breakpoint

ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_event_type_check";
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_event_type_check" CHECK ("event_type" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'inventory.qr_label.created', 'inventory.qr_label.revoked', 'inventory.qr_label.reissued', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued', 'imports.run.staged', 'imports.run.approved', 'imports.run.committed', 'imports.run.commit_failed'));
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" DROP CONSTRAINT "platform_outbox_target_type_check";
--> statement-breakpoint
ALTER TABLE "platform_outbox_job" ADD CONSTRAINT "platform_outbox_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'qr_label', 'file', 'outbox_job', 'import_run'));
--> statement-breakpoint

ALTER TABLE "operations_idempotency_record" DROP CONSTRAINT "operations_idempotency_target_type_check";
--> statement-breakpoint
ALTER TABLE "operations_idempotency_record" ADD CONSTRAINT "operations_idempotency_target_type_check" CHECK ("target_type" is null or "target_type" in ('load', 'location', 'machine', 'qr_label', 'import_run'));
--> statement-breakpoint

CREATE TABLE "inventory_qr_label" (
  "id" text PRIMARY KEY NOT NULL,
  "machine_id" text NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "fallback_code" text NOT NULL,
  "state" text DEFAULT 'active' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "issued_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "revoked_by_user_id" text REFERENCES "user"("id") ON DELETE restrict,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "inventory_qr_label_id_check" CHECK ("id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "inventory_qr_label_fallback_check" CHECK ("fallback_code" ~ '^[0-9A-HJKMNP-TV-Z]{16}$'),
  CONSTRAINT "inventory_qr_label_state_check" CHECK ("state" in ('active', 'revoked')),
  CONSTRAINT "inventory_qr_label_lifecycle_check" CHECK (("state" = 'active' and "revoked_by_user_id" is null and "revoked_at" is null) or ("state" = 'revoked' and "revoked_by_user_id" is not null and "revoked_at" is not null)),
  CONSTRAINT "inventory_qr_label_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_qr_label_fallback_unique" ON "inventory_qr_label" ("fallback_code");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_qr_label_id_machine_unique" ON "inventory_qr_label" ("id", "machine_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_qr_label_one_active_machine_unique" ON "inventory_qr_label" ("machine_id") WHERE "state" = 'active';
--> statement-breakpoint
CREATE INDEX "inventory_qr_label_machine_history_index" ON "inventory_qr_label" ("machine_id", "issued_at");
--> statement-breakpoint

CREATE TABLE "inventory_qr_label_activity" (
  "id" text PRIMARY KEY NOT NULL,
  "label_id" text NOT NULL,
  "machine_id" text NOT NULL REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "action" text NOT NULL,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "request_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_qr_label_activity_label_machine_fk" FOREIGN KEY ("label_id", "machine_id") REFERENCES "inventory_qr_label"("id", "machine_id") ON DELETE restrict,
  CONSTRAINT "inventory_qr_label_activity_action_check" CHECK ("action" in ('created', 'printed', 'resolved', 'revoked', 'reissued'))
);
--> statement-breakpoint
CREATE INDEX "inventory_qr_label_activity_label_index" ON "inventory_qr_label_activity" ("label_id", "created_at");
--> statement-breakpoint
CREATE INDEX "inventory_qr_label_activity_machine_index" ON "inventory_qr_label_activity" ("machine_id", "created_at");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_qr_label_lifecycle() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'QR label history is immutable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.machine_id IS DISTINCT FROM OLD.machine_id
    OR NEW.fallback_code IS DISTINCT FROM OLD.fallback_code
    OR NEW.issued_by_user_id IS DISTINCT FROM OLD.issued_by_user_id
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
    RAISE EXCEPTION 'QR label identity is immutable';
  END IF;
  IF OLD.state <> 'active' OR NEW.state <> 'revoked'
    OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'invalid QR label lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_qr_label_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "inventory_qr_label"
FOR EACH ROW EXECUTE FUNCTION enforce_qr_label_lifecycle();
--> statement-breakpoint
CREATE TRIGGER "inventory_qr_label_activity_immutable"
BEFORE UPDATE OR DELETE ON "inventory_qr_label_activity"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
