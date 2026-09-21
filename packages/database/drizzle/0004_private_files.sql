CREATE TABLE "file_attachment" (
  "id" text PRIMARY KEY NOT NULL,
  "machine_id" text REFERENCES "inventory_machine"("id") ON DELETE restrict,
  "load_id" text REFERENCES "inventory_load"("id") ON DELETE restrict,
  "purpose" text NOT NULL,
  "storage_key" text NOT NULL,
  "original_filename" text NOT NULL,
  "declared_media_type" text NOT NULL,
  "detected_media_type" text,
  "declared_byte_count" integer NOT NULL,
  "byte_count" integer,
  "sha256" text,
  "uploader_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "state" text DEFAULT 'pending_upload' NOT NULL,
  "failure_code" text,
  "upload_lease_id" text,
  "upload_lease_expires_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "file_attachment_one_target_check" CHECK (("machine_id" is not null and "load_id" is null) or ("machine_id" is null and "load_id" is not null)),
  CONSTRAINT "file_attachment_purpose_check" CHECK ("purpose" in ('nameplate', 'arrival_condition', 'document', 'receipt', 'other')),
  CONSTRAINT "file_attachment_nameplate_target_check" CHECK ("purpose" <> 'nameplate' or "machine_id" is not null),
  CONSTRAINT "file_attachment_state_check" CHECK ("state" in ('pending_upload', 'ready', 'failed', 'abandoned')),
  CONSTRAINT "file_attachment_declared_media_type_check" CHECK ("declared_media_type" in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  CONSTRAINT "file_attachment_detected_media_type_check" CHECK ("detected_media_type" is null or "detected_media_type" in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  CONSTRAINT "file_attachment_byte_count_check" CHECK ("declared_byte_count" >= 0 and ("byte_count" is null or "byte_count" >= 0)),
  CONSTRAINT "file_attachment_upload_lease_check" CHECK (("upload_lease_id" is null and "upload_lease_expires_at" is null) or ("upload_lease_id" is not null and "upload_lease_expires_at" is not null)),
  CONSTRAINT "file_attachment_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "file_attachment_storage_key_unique" ON "file_attachment" ("storage_key");
--> statement-breakpoint
CREATE INDEX "file_attachment_machine_index" ON "file_attachment" ("machine_id", "created_at");
--> statement-breakpoint
CREATE INDEX "file_attachment_load_index" ON "file_attachment" ("load_id", "created_at");
--> statement-breakpoint
CREATE INDEX "file_attachment_incomplete_index" ON "file_attachment" ("state", "created_at");
--> statement-breakpoint
CREATE TABLE "file_access_grant" (
  "id" text PRIMARY KEY NOT NULL,
  "file_id" text NOT NULL REFERENCES "file_attachment"("id") ON DELETE restrict,
  "operation" text NOT NULL,
  "token_hash" text NOT NULL,
  "issued_to_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "issued_session_id" text NOT NULL REFERENCES "session"("id") ON DELETE cascade,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "file_access_grant_operation_check" CHECK ("operation" in ('upload', 'download'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "file_access_grant_token_hash_unique" ON "file_access_grant" ("token_hash");
--> statement-breakpoint
CREATE INDEX "file_access_grant_file_index" ON "file_access_grant" ("file_id", "operation");
--> statement-breakpoint
CREATE INDEX "file_access_grant_expiry_index" ON "file_access_grant" ("expires_at");
--> statement-breakpoint
CREATE TABLE "file_activity" (
  "id" text PRIMARY KEY NOT NULL,
  "file_id" text NOT NULL REFERENCES "file_attachment"("id") ON DELETE restrict,
  "action" text NOT NULL,
  "actor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "request_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "file_activity_action_check" CHECK ("action" in ('upload_grant_created', 'upload_ready', 'upload_failed', 'download_grant_created', 'downloaded', 'abandoned'))
);
--> statement-breakpoint
CREATE INDEX "file_activity_file_index" ON "file_activity" ("file_id", "created_at");
--> statement-breakpoint
CREATE TRIGGER "file_activity_immutable"
BEFORE UPDATE OR DELETE ON "file_activity"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
