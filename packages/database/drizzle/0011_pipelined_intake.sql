ALTER TABLE "inventory_intake_candidate" DROP CONSTRAINT "inventory_intake_candidate_state_check";
--> statement-breakpoint
ALTER TABLE "inventory_intake_candidate" ADD CONSTRAINT "inventory_intake_candidate_state_check" CHECK ("state" in ('draft', 'confirmed', 'committed'));
--> statement-breakpoint
ALTER TABLE "inventory_intake_candidate" ADD COLUMN "machine_type_selected_by_user_id" text REFERENCES "user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "inventory_intake_candidate" ADD COLUMN "machine_type_selected_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "inventory_intake_recognition_run" ADD COLUMN "photo_id" text REFERENCES "inventory_intake_photo"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "inventory_intake_recognition_run" ADD COLUMN "candidate_id" text REFERENCES "inventory_intake_candidate"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "inventory_intake_recognition_run" ADD COLUMN "candidate_revision" integer;
--> statement-breakpoint
ALTER TABLE "inventory_intake_recognition_run" ADD CONSTRAINT "inventory_intake_recognition_run_target_check" CHECK (("photo_id" is null and "candidate_id" is null and "candidate_revision" is null) or ("photo_id" is not null and "candidate_id" is not null and "candidate_revision" > 0));
--> statement-breakpoint
CREATE INDEX "inventory_intake_recognition_run_photo_index" ON "inventory_intake_recognition_run" ("photo_id", "created_at");
--> statement-breakpoint
CREATE INDEX "inventory_intake_recognition_run_candidate_index" ON "inventory_intake_recognition_run" ("candidate_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_intake_recognition_target_active_unique" ON "inventory_intake_recognition_run" ("photo_id", "candidate_id", "candidate_revision") WHERE "photo_id" is not null and "state" in ('queued', 'running');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_intake_recognition_run_target() RETURNS trigger AS $$
DECLARE
  photo_batch text;
  candidate_batch text;
BEGIN
  IF NEW.photo_id IS NULL AND NEW.candidate_id IS NULL THEN RETURN NEW; END IF;
  SELECT batch_id INTO photo_batch FROM inventory_intake_photo WHERE id = NEW.photo_id;
  SELECT batch_id INTO candidate_batch FROM inventory_intake_candidate WHERE id = NEW.candidate_id;
  IF photo_batch IS NULL OR candidate_batch IS NULL OR photo_batch <> NEW.batch_id OR candidate_batch <> NEW.batch_id THEN
    RAISE EXCEPTION 'recognition run target crosses intake batches';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_run_target_ownership" BEFORE INSERT OR UPDATE ON "inventory_intake_recognition_run" FOR EACH ROW EXECUTE FUNCTION validate_intake_recognition_run_target();
