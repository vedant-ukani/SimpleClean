ALTER TABLE inventory_machine DROP CONSTRAINT inventory_machine_production_state_check;--> statement-breakpoint
UPDATE inventory_machine SET production_state = 'not_assessed' WHERE production_state = 'not_started';--> statement-breakpoint
ALTER TABLE inventory_machine ALTER COLUMN production_state SET DEFAULT 'not_assessed';--> statement-breakpoint
ALTER TABLE inventory_machine DROP CONSTRAINT inventory_machine_inventory_state_check;--> statement-breakpoint
ALTER TABLE inventory_machine ADD CONSTRAINT inventory_machine_inventory_state_check CHECK (inventory_state IN ('expected', 'on_hand', 'scrapped'));--> statement-breakpoint
ALTER TABLE inventory_machine ADD CONSTRAINT inventory_machine_production_state_check CHECK (production_state IN ('not_assessed', 'preliminary_passed', 'blocked'));--> statement-breakpoint
ALTER TABLE file_attachment DROP CONSTRAINT file_attachment_purpose_check;--> statement-breakpoint
ALTER TABLE file_attachment ADD CONSTRAINT file_attachment_purpose_check CHECK (purpose IN ('nameplate', 'arrival_condition', 'document', 'receipt', 'other', 'intake_evidence', 'preliminary_inspection'));--> statement-breakpoint
ALTER TABLE file_attachment ADD CONSTRAINT file_attachment_preliminary_target_check CHECK (purpose <> 'preliminary_inspection' OR machine_id IS NOT NULL);--> statement-breakpoint

DO $$
DECLARE item record; previous_definition text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('operations_audit_entry', 'operations_audit_action_check', 'action', '''production.preliminary_inspection.recorded'', ''production.disposition.recorded'', ''inventory.machine.lifecycle_updated'''),
    ('platform_outbox_job', 'platform_outbox_event_type_check', 'event_type', '''production.preliminary_inspection.recorded'', ''production.disposition.recorded'', ''inventory.machine.lifecycle_updated'''),
    ('operations_audit_entry', 'operations_audit_target_type_check', 'target_type', '''preliminary_inspection'', ''preliminary_disposition'''),
    ('platform_outbox_job', 'platform_outbox_target_type_check', 'target_type', '''preliminary_inspection'', ''preliminary_disposition'''),
    ('operations_idempotency_record', 'operations_idempotency_target_type_check', 'target_type', '''preliminary_inspection'', ''preliminary_disposition''')
  ) AS constraints(table_name, constraint_name, column_name, extra_values)
  LOOP
    SELECT pg_get_constraintdef(c.oid) INTO previous_definition
      FROM pg_constraint c
      WHERE c.conrelid = item.table_name::regclass AND c.conname = item.constraint_name;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', item.table_name, item.constraint_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s OR %I IN (%s))',
      item.table_name, item.constraint_name,
      left(previous_definition, length(previous_definition) - 1),
      item.column_name, item.extra_values);
  END LOOP;
END $$;--> statement-breakpoint

CREATE TABLE production_preliminary_inspection (
  id text PRIMARY KEY,
  machine_id text NOT NULL REFERENCES inventory_machine(id) ON DELETE RESTRICT,
  condition text NOT NULL,
  bearing_assessment text NOT NULL,
  bearing_notes text NOT NULL,
  missing_parts text NOT NULL,
  damage text NOT NULL,
  recommendation text NOT NULL,
  recommendation_reason text NOT NULL,
  inspected_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_inspection_bearing_check CHECK (bearing_assessment IN ('no_concern_observed', 'concern_observed', 'not_applicable', 'unable_to_assess')),
  CONSTRAINT production_inspection_recommendation_check CHECK (recommendation IN ('repairable', 'hold', 'parts_only', 'scrap', 'owner_review')),
  CONSTRAINT production_inspection_reason_check CHECK (char_length(recommendation_reason) BETWEEN 1 AND 2000)
);--> statement-breakpoint
CREATE INDEX production_inspection_machine_index ON production_preliminary_inspection (machine_id, created_at);--> statement-breakpoint

CREATE TABLE production_preliminary_evidence (
  inspection_id text NOT NULL REFERENCES production_preliminary_inspection(id) ON DELETE RESTRICT,
  file_id text NOT NULL REFERENCES file_attachment(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_preliminary_evidence_pk PRIMARY KEY (inspection_id, file_id)
);--> statement-breakpoint
CREATE INDEX production_preliminary_evidence_file_index ON production_preliminary_evidence (file_id);--> statement-breakpoint

CREATE TABLE production_preliminary_disposition (
  id text PRIMARY KEY,
  machine_id text NOT NULL REFERENCES inventory_machine(id) ON DELETE RESTRICT,
  inspection_id text NOT NULL REFERENCES production_preliminary_inspection(id) ON DELETE RESTRICT,
  disposition text NOT NULL,
  reason text NOT NULL,
  decided_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  approved_by_user_id text REFERENCES "user"(id) ON DELETE RESTRICT,
  request_id text NOT NULL,
  machine_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_disposition_value_check CHECK (disposition IN ('repairable', 'hold', 'parts_only', 'scrap', 'owner_review')),
  CONSTRAINT production_disposition_reason_check CHECK (char_length(reason) BETWEEN 1 AND 2000),
  CONSTRAINT production_disposition_approval_check CHECK (disposition NOT IN ('parts_only', 'scrap') OR approved_by_user_id IS NOT NULL),
  CONSTRAINT production_disposition_version_check CHECK (machine_version > 0)
);--> statement-breakpoint
CREATE INDEX production_disposition_machine_index ON production_preliminary_disposition (machine_id, created_at);--> statement-breakpoint
CREATE INDEX production_disposition_inspection_index ON production_preliminary_disposition (inspection_id, created_at);--> statement-breakpoint

CREATE FUNCTION production_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Preliminary inspection history is immutable';
END $$;--> statement-breakpoint
CREATE TRIGGER production_inspection_immutable BEFORE UPDATE OR DELETE ON production_preliminary_inspection FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();--> statement-breakpoint
CREATE TRIGGER production_evidence_immutable BEFORE UPDATE OR DELETE ON production_preliminary_evidence FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();--> statement-breakpoint
CREATE TRIGGER production_disposition_immutable BEFORE UPDATE OR DELETE ON production_preliminary_disposition FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();--> statement-breakpoint

CREATE FUNCTION production_validate_history_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inspection_machine_id text;
BEGIN
  SELECT machine_id INTO inspection_machine_id FROM production_preliminary_inspection WHERE id = NEW.inspection_id;
  IF TG_TABLE_NAME = 'production_preliminary_evidence' THEN
    IF NOT EXISTS (SELECT 1 FROM file_attachment WHERE id = NEW.file_id AND machine_id = inspection_machine_id AND purpose = 'preliminary_inspection' AND state = 'ready') THEN
      RAISE EXCEPTION 'Invalid preliminary inspection evidence';
    END IF;
  ELSIF NEW.machine_id <> inspection_machine_id THEN
    RAISE EXCEPTION 'Disposition Machine does not match inspection';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER production_evidence_link BEFORE INSERT ON production_preliminary_evidence FOR EACH ROW EXECUTE FUNCTION production_validate_history_link();--> statement-breakpoint
CREATE TRIGGER production_disposition_link BEFORE INSERT ON production_preliminary_disposition FOR EACH ROW EXECUTE FUNCTION production_validate_history_link();
