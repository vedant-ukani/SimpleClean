DROP INDEX "inventory_intake_recognition_run_input_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_intake_recognition_run_input_unique" ON "inventory_intake_recognition_run" ("batch_id", "input_version", "input_fingerprint") WHERE "state" in ('queued', 'running');
--> statement-breakpoint
ALTER TABLE "operations_idempotency_record" DROP CONSTRAINT "operations_idempotency_target_type_check";
--> statement-breakpoint
ALTER TABLE "operations_idempotency_record" ADD CONSTRAINT "operations_idempotency_target_type_check" CHECK ("target_type" is null or "target_type" in ('load', 'location', 'machine', 'qr_label', 'import_run', 'intake_batch', 'intake_recognition_run'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_intake_recognition_ownership() RETURNS trigger AS $$
DECLARE
  parent_batch_id text;
  child_batch_id text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'inventory_intake_recognition_run' AND OLD.batch_id IS DISTINCT FROM NEW.batch_id THEN
      RAISE EXCEPTION 'recognition run batch parent is immutable';
    ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_group' AND OLD.run_id IS DISTINCT FROM NEW.run_id THEN
      RAISE EXCEPTION 'recognition group parent is immutable';
    ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_group_photo' AND (OLD.group_id IS DISTINCT FROM NEW.group_id OR OLD.photo_id IS DISTINCT FROM NEW.photo_id) THEN
      RAISE EXCEPTION 'recognition group photo parent is immutable';
    ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_field' AND (OLD.group_id IS DISTINCT FROM NEW.group_id OR OLD.photo_id IS DISTINCT FROM NEW.photo_id) THEN
      RAISE EXCEPTION 'recognition field parent is immutable';
    ELSIF TG_TABLE_NAME = 'inventory_intake_recapture' AND (OLD.run_id IS DISTINCT FROM NEW.run_id OR OLD.batch_id IS DISTINCT FROM NEW.batch_id OR OLD.candidate_id IS DISTINCT FROM NEW.candidate_id) THEN
      RAISE EXCEPTION 'recognition recapture parent is immutable';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'inventory_intake_recognition_group' THEN
    SELECT batch_id INTO parent_batch_id
    FROM inventory_intake_recognition_run
    WHERE id = NEW.run_id;
    IF parent_batch_id IS NULL THEN
      RAISE EXCEPTION 'recognition group run does not exist';
    END IF;
  ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_group_photo' THEN
    SELECT r.batch_id INTO parent_batch_id
    FROM inventory_intake_recognition_group g
    INNER JOIN inventory_intake_recognition_run r ON r.id = g.run_id
    WHERE g.id = NEW.group_id;
    SELECT batch_id INTO child_batch_id
    FROM inventory_intake_photo
    WHERE id = NEW.photo_id;
    IF parent_batch_id IS NULL OR child_batch_id IS NULL OR parent_batch_id <> child_batch_id THEN
      RAISE EXCEPTION 'recognition group photo crosses intake batches';
    END IF;
  ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_field' THEN
    SELECT r.batch_id INTO parent_batch_id
    FROM inventory_intake_recognition_group g
    INNER JOIN inventory_intake_recognition_run r ON r.id = g.run_id
    WHERE g.id = NEW.group_id;
    IF parent_batch_id IS NULL THEN
      RAISE EXCEPTION 'recognition field group does not exist';
    END IF;
    IF NEW.photo_id IS NOT NULL THEN
      SELECT batch_id INTO child_batch_id
      FROM inventory_intake_photo
      WHERE id = NEW.photo_id;
      IF child_batch_id IS NULL OR parent_batch_id <> child_batch_id THEN
        RAISE EXCEPTION 'recognition field evidence crosses intake batches';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'inventory_intake_recapture' THEN
    SELECT batch_id INTO parent_batch_id
    FROM inventory_intake_recognition_run
    WHERE id = NEW.run_id;
    IF parent_batch_id IS NULL OR parent_batch_id <> NEW.batch_id THEN
      RAISE EXCEPTION 'recognition recapture crosses intake batches';
    END IF;
    IF NEW.candidate_id IS NOT NULL THEN
      SELECT batch_id INTO child_batch_id
      FROM inventory_intake_candidate
      WHERE id = NEW.candidate_id;
      IF child_batch_id IS NULL OR child_batch_id <> NEW.batch_id THEN
        RAISE EXCEPTION 'recognition recapture candidate crosses intake batches';
      END IF;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(NEW.photo_ids) AS requested(photo_id)
      LEFT JOIN inventory_intake_photo p ON p.id = requested.photo_id
      WHERE p.id IS NULL OR p.batch_id <> NEW.batch_id
    ) THEN
      RAISE EXCEPTION 'recognition recapture evidence crosses intake batches';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_intake_recognition_committed_mutation() RETURNS trigger AS $$
DECLARE
  old_batch_id text;
  new_batch_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF TG_TABLE_NAME = 'inventory_intake_recognition_run' THEN
      old_batch_id := OLD.batch_id;
    ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_group' THEN
      SELECT r.batch_id INTO old_batch_id FROM inventory_intake_recognition_run r WHERE r.id = OLD.run_id;
    ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_group_photo' THEN
      SELECT r.batch_id INTO old_batch_id FROM inventory_intake_recognition_group g INNER JOIN inventory_intake_recognition_run r ON r.id = g.run_id WHERE g.id = OLD.group_id;
    ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_field' THEN
      SELECT r.batch_id INTO old_batch_id FROM inventory_intake_recognition_group g INNER JOIN inventory_intake_recognition_run r ON r.id = g.run_id WHERE g.id = OLD.group_id;
    ELSIF TG_TABLE_NAME = 'inventory_intake_recapture' THEN
      old_batch_id := OLD.batch_id;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME = 'inventory_intake_recognition_run' THEN
      new_batch_id := NEW.batch_id;
    ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_group' THEN
      SELECT r.batch_id INTO new_batch_id FROM inventory_intake_recognition_run r WHERE r.id = NEW.run_id;
    ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_group_photo' THEN
      SELECT r.batch_id INTO new_batch_id FROM inventory_intake_recognition_group g INNER JOIN inventory_intake_recognition_run r ON r.id = g.run_id WHERE g.id = NEW.group_id;
    ELSIF TG_TABLE_NAME = 'inventory_intake_recognition_field' THEN
      SELECT r.batch_id INTO new_batch_id FROM inventory_intake_recognition_group g INNER JOIN inventory_intake_recognition_run r ON r.id = g.run_id WHERE g.id = NEW.group_id;
    ELSIF TG_TABLE_NAME = 'inventory_intake_recapture' THEN
      new_batch_id := NEW.batch_id;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_intake_batch WHERE id = old_batch_id AND state = 'committed')
     OR EXISTS (SELECT 1 FROM inventory_intake_batch WHERE id = new_batch_id AND state = 'committed') THEN
    RAISE EXCEPTION 'committed intake recognition is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_group_ownership" BEFORE INSERT OR UPDATE ON "inventory_intake_recognition_group" FOR EACH ROW EXECUTE FUNCTION validate_intake_recognition_ownership();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_group_photo_ownership" BEFORE INSERT OR UPDATE ON "inventory_intake_recognition_group_photo" FOR EACH ROW EXECUTE FUNCTION validate_intake_recognition_ownership();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_field_ownership" BEFORE INSERT OR UPDATE ON "inventory_intake_recognition_field" FOR EACH ROW EXECUTE FUNCTION validate_intake_recognition_ownership();
--> statement-breakpoint
CREATE TRIGGER "inventory_intake_recognition_recapture_ownership" BEFORE INSERT OR UPDATE ON "inventory_intake_recapture" FOR EACH ROW EXECUTE FUNCTION validate_intake_recognition_ownership();
