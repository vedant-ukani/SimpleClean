CREATE TABLE "operations_audit_entry" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_kind" text NOT NULL,
  "actor_user_id" text REFERENCES "user"("id") ON DELETE restrict,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "request_id" text NOT NULL,
  "safe_summary" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operations_audit_actor_check" CHECK (("actor_kind" = 'user' and "actor_user_id" is not null) or ("actor_kind" = 'system' and "actor_user_id" is null)),
  CONSTRAINT "operations_audit_action_check" CHECK ("action" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued')),
  CONSTRAINT "operations_audit_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'file', 'outbox_job'))
);
--> statement-breakpoint
CREATE INDEX "operations_audit_created_index" ON "operations_audit_entry" ("created_at");
--> statement-breakpoint
CREATE INDEX "operations_audit_action_index" ON "operations_audit_entry" ("action", "created_at");
--> statement-breakpoint
CREATE INDEX "operations_audit_target_index" ON "operations_audit_entry" ("target_type", "target_id", "created_at");
--> statement-breakpoint
CREATE INDEX "operations_audit_actor_index" ON "operations_audit_entry" ("actor_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "operations_audit_request_index" ON "operations_audit_entry" ("request_id");
--> statement-breakpoint
CREATE TRIGGER "operations_audit_immutable"
BEFORE UPDATE OR DELETE ON "operations_audit_entry"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
--> statement-breakpoint
CREATE TABLE "platform_outbox_job" (
  "id" text PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "actor_kind" text NOT NULL,
  "actor_user_id" text REFERENCES "user"("id") ON DELETE restrict,
  "request_id" text NOT NULL,
  "safe_summary" jsonb NOT NULL,
  "state" text DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_id" text,
  "lease_expires_at" timestamp with time zone,
  "error_code" text,
  "version" integer DEFAULT 1 NOT NULL,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_outbox_actor_check" CHECK (("actor_kind" = 'user' and "actor_user_id" is not null) or ("actor_kind" = 'system' and "actor_user_id" is null)),
  CONSTRAINT "platform_outbox_event_type_check" CHECK ("event_type" in ('identity.user.created', 'identity.user.role_changed', 'identity.user.activated', 'identity.user.deactivated', 'identity.user.sessions_revoked', 'identity.user.provisioned', 'inventory.load.created', 'inventory.load.updated', 'inventory.location.created', 'inventory.location.updated', 'inventory.location.deactivated', 'inventory.machine.created', 'inventory.machine.identity_updated', 'inventory.machine.verified', 'inventory.machine.identity_conflict', 'inventory.machine.relocated', 'files.attachment.requested', 'files.attachment.ready', 'files.attachment.failed', 'files.attachment.abandoned', 'operations.job.requeued')),
  CONSTRAINT "platform_outbox_target_type_check" CHECK ("target_type" in ('user', 'session', 'load', 'location', 'machine', 'file', 'outbox_job')),
  CONSTRAINT "platform_outbox_state_check" CHECK ("state" in ('queued', 'processing', 'retry_wait', 'delivered', 'dead_letter')),
  CONSTRAINT "platform_outbox_attempt_check" CHECK ("attempt_count" >= 0),
  CONSTRAINT "platform_outbox_version_check" CHECK ("version" > 0),
  CONSTRAINT "platform_outbox_error_code_check" CHECK ("error_code" is null or "error_code" in ('handler_failed')),
  CONSTRAINT "platform_outbox_lease_check" CHECK (("state" = 'processing' and "lease_id" is not null and "lease_expires_at" is not null) or ("state" <> 'processing' and "lease_id" is null and "lease_expires_at" is null))
);
--> statement-breakpoint
CREATE INDEX "platform_outbox_claim_index" ON "platform_outbox_job" ("state", "available_at", "lease_expires_at");
--> statement-breakpoint
CREATE INDEX "platform_outbox_target_index" ON "platform_outbox_job" ("target_type", "target_id");
--> statement-breakpoint
CREATE INDEX "platform_outbox_created_index" ON "platform_outbox_job" ("created_at");
--> statement-breakpoint
CREATE TABLE "operations_idempotency_record" (
  "id" text PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "key_hash" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "state" text DEFAULT 'in_progress' NOT NULL,
  "target_type" text,
  "target_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "operations_idempotency_state_check" CHECK ("state" in ('in_progress', 'completed')),
  CONSTRAINT "operations_idempotency_completion_check" CHECK (("state" = 'in_progress' and "target_type" is null and "target_id" is null and "completed_at" is null) or ("state" = 'completed' and "target_type" is not null and "target_id" is not null and "completed_at" is not null)),
  CONSTRAINT "operations_idempotency_target_type_check" CHECK ("target_type" is null or "target_type" in ('load', 'location', 'machine'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_idempotency_scope_key_unique" ON "operations_idempotency_record" ("scope", "actor_user_id", "key_hash");
--> statement-breakpoint
CREATE INDEX "operations_idempotency_target_index" ON "operations_idempotency_record" ("target_type", "target_id");
