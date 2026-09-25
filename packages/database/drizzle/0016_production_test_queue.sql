ALTER TABLE inventory_machine DROP CONSTRAINT inventory_machine_production_state_check;--> statement-breakpoint
ALTER TABLE inventory_machine ADD CONSTRAINT inventory_machine_production_state_check CHECK (production_state IN ('not_assessed', 'preliminary_passed', 'awaiting_test', 'testing', 'awaiting_repair', 'awaiting_clean', 'blocked'));--> statement-breakpoint
ALTER TABLE file_attachment DROP CONSTRAINT file_attachment_purpose_check;--> statement-breakpoint
ALTER TABLE file_attachment ADD CONSTRAINT file_attachment_purpose_check CHECK (purpose IN ('nameplate', 'arrival_condition', 'document', 'receipt', 'other', 'intake_evidence', 'preliminary_inspection', 'production_test_evidence'));--> statement-breakpoint
ALTER TABLE file_attachment ADD CONSTRAINT file_attachment_production_test_target_check CHECK (purpose <> 'production_test_evidence' OR machine_id IS NOT NULL);--> statement-breakpoint

DO $$
DECLARE item record; previous_definition text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('operations_audit_entry', 'operations_audit_action_check', 'action', '''production.worker_specialty.updated'', ''production.test_work_order.created'', ''production.test_work_order.claimed'', ''production.test_work_order.assignment_changed'', ''production.test_step.recorded'', ''production.test_work_order.completed'', ''production.test_work_order.cancelled'''),
    ('platform_outbox_job', 'platform_outbox_event_type_check', 'event_type', '''production.worker_specialty.updated'', ''production.test_work_order.created'', ''production.test_work_order.claimed'', ''production.test_work_order.assignment_changed'', ''production.test_step.recorded'', ''production.test_work_order.completed'', ''production.test_work_order.cancelled'''),
    ('operations_audit_entry', 'operations_audit_target_type_check', 'target_type', '''production_worker_specialty'', ''production_test_work_order'', ''production_test_step_result'''),
    ('platform_outbox_job', 'platform_outbox_target_type_check', 'target_type', '''production_worker_specialty'', ''production_test_work_order'', ''production_test_step_result'''),
    ('operations_idempotency_record', 'operations_idempotency_target_type_check', 'target_type', '''production_worker_specialty'', ''production_test_work_order'', ''production_test_step_result''')
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

CREATE TABLE production_worker_specialty (
  user_id text NOT NULL REFERENCES identity_profile(user_id) ON DELETE CASCADE,
  machine_type text NOT NULL CHECK (machine_type IN ('washer', 'dryer')),
  assigned_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_worker_specialty_pk PRIMARY KEY (user_id, machine_type)
);--> statement-breakpoint

CREATE TABLE production_test_template (
  id text PRIMARY KEY,
  machine_type text NOT NULL CHECK (machine_type IN ('washer', 'dryer')),
  version integer NOT NULL CHECK (version > 0),
  approved_at timestamptz,
  CONSTRAINT production_test_template_version_unique UNIQUE (machine_type, version)
);--> statement-breakpoint
CREATE TABLE production_test_step (
  template_id text NOT NULL REFERENCES production_test_template(id) ON DELETE RESTRICT,
  step_key text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  instruction text NOT NULL CHECK (char_length(instruction) BETWEEN 1 AND 500),
  allow_na boolean NOT NULL DEFAULT false,
  stop_on_failure boolean NOT NULL DEFAULT false,
  photo_required boolean NOT NULL DEFAULT false,
  CONSTRAINT production_test_step_pk PRIMARY KEY (template_id, step_key),
  CONSTRAINT production_test_step_position_unique UNIQUE (template_id, position)
);--> statement-breakpoint

CREATE TABLE production_test_work_order (
  id text PRIMARY KEY,
  machine_id text NOT NULL REFERENCES inventory_machine(id) ON DELETE RESTRICT,
  machine_type text NOT NULL CHECK (machine_type IN ('washer', 'dryer')),
  state text NOT NULL CHECK (state IN ('queued', 'testing', 'awaiting_repair', 'awaiting_clean', 'cancelled')),
  assigned_user_id text REFERENCES "user"(id) ON DELETE RESTRICT,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT production_test_work_order_completion_check CHECK ((state IN ('queued', 'testing') AND completed_at IS NULL) OR (state IN ('awaiting_repair', 'awaiting_clean', 'cancelled') AND completed_at IS NOT NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX production_test_one_open_order ON production_test_work_order(machine_id) WHERE completed_at IS NULL;--> statement-breakpoint
CREATE INDEX production_test_queue_order ON production_test_work_order(state, queued_at, id);--> statement-breakpoint
CREATE INDEX production_test_assignment_order ON production_test_work_order(assigned_user_id, state);--> statement-breakpoint

CREATE TABLE production_test_claim_event (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES production_test_work_order(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('claimed', 'released', 'reassigned')),
  from_user_id text REFERENCES "user"(id) ON DELETE RESTRICT,
  to_user_id text REFERENCES "user"(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX production_test_claim_order ON production_test_claim_event(order_id, created_at);--> statement-breakpoint
CREATE TABLE production_test_run (
  id text PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES production_test_work_order(id) ON DELETE RESTRICT,
  template_id text NOT NULL REFERENCES production_test_template(id) ON DELETE RESTRICT,
  started_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);--> statement-breakpoint
CREATE TABLE production_test_run_step (
  run_id text NOT NULL REFERENCES production_test_run(id) ON DELETE RESTRICT,
  step_key text NOT NULL,
  CONSTRAINT production_test_run_step_pk PRIMARY KEY (run_id, step_key)
);--> statement-breakpoint
CREATE TABLE production_test_step_result (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES production_test_run(id) ON DELETE RESTRICT,
  step_key text NOT NULL,
  result text NOT NULL CHECK (result IN ('pass', 'fail', 'na')),
  actor_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  file_id text REFERENCES file_attachment(id) ON DELETE RESTRICT,
  request_id text NOT NULL,
  order_version integer NOT NULL CONSTRAINT production_test_step_result_order_version_check CHECK (order_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_test_step_result_step_fk FOREIGN KEY (run_id, step_key) REFERENCES production_test_run_step(run_id, step_key) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT production_test_step_result_version_unique UNIQUE (run_id, order_version)
);--> statement-breakpoint
CREATE INDEX production_test_result_run_order ON production_test_step_result(run_id, order_version);--> statement-breakpoint
CREATE UNIQUE INDEX production_test_result_file_unique ON production_test_step_result(file_id) WHERE file_id IS NOT NULL;--> statement-breakpoint
CREATE FUNCTION production_reject_test_history_change() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Production test history is immutable'; END; $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION production_guard_test_template_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Production test templates must be approved after steps are recorded'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Approved Production test templates are immutable'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Approved Production test templates are immutable'; END IF;
  IF NEW.approved_at IS NULL OR NEW.id IS DISTINCT FROM OLD.id OR NEW.machine_type IS DISTINCT FROM OLD.machine_type OR NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION 'Only a one-time Production test template approval is permitted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM production_test_step WHERE template_id = OLD.id) THEN
    RAISE EXCEPTION 'Production test template requires steps before approval';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER production_test_template_immutable BEFORE INSERT OR UPDATE OR DELETE ON production_test_template FOR EACH ROW EXECUTE FUNCTION production_guard_test_template_change();--> statement-breakpoint
CREATE FUNCTION production_guard_test_step_change() RETURNS trigger AS $$
DECLARE parent_approved_at timestamptz;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT approved_at INTO parent_approved_at FROM production_test_template WHERE id = OLD.template_id FOR UPDATE;
    IF parent_approved_at IS NOT NULL THEN RAISE EXCEPTION 'Approved Production test steps are immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT approved_at INTO parent_approved_at FROM production_test_template WHERE id = NEW.template_id FOR UPDATE;
    IF parent_approved_at IS NOT NULL THEN RAISE EXCEPTION 'Approved Production test steps are immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER production_test_step_immutable BEFORE INSERT OR UPDATE OR DELETE ON production_test_step FOR EACH ROW EXECUTE FUNCTION production_guard_test_step_change();--> statement-breakpoint
CREATE FUNCTION production_require_approved_test_template() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Production test run template is pinned'; END IF;
  IF NOT EXISTS (SELECT 1 FROM production_test_template WHERE id = NEW.template_id AND approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Production test run requires an approved template';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER production_test_run_approved_template BEFORE INSERT OR UPDATE OF template_id ON production_test_run FOR EACH ROW EXECUTE FUNCTION production_require_approved_test_template();--> statement-breakpoint
CREATE TRIGGER production_test_claim_immutable BEFORE UPDATE OR DELETE ON production_test_claim_event FOR EACH ROW EXECUTE FUNCTION production_reject_test_history_change();--> statement-breakpoint
CREATE TRIGGER production_test_run_step_immutable BEFORE UPDATE OR DELETE ON production_test_run_step FOR EACH ROW EXECUTE FUNCTION production_reject_test_history_change();--> statement-breakpoint
CREATE TRIGGER production_test_result_immutable BEFORE UPDATE OR DELETE ON production_test_step_result FOR EACH ROW EXECUTE FUNCTION production_reject_test_history_change();--> statement-breakpoint

INSERT INTO production_test_template(id, machine_type, version) VALUES
('00000000-0000-4000-8000-000000000161', 'washer', 1),
('00000000-0000-4000-8000-000000000162', 'dryer', 1);--> statement-breakpoint
INSERT INTO production_test_step(template_id, step_key, position, instruction, allow_na, stop_on_failure, photo_required) VALUES
('00000000-0000-4000-8000-000000000161', 'washer_01', 0, 'Inspect Bearing to Ensure No Noise or movement in the drum', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_02', 1, 'Set machine up in testing area so that the drain will drain into the small tub', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_03', 2, 'Connect water lines to the water valve connections on the back of the machine', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_04', 3, 'Turn on water and ensure that there are no leaks', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_05', 4, 'Check power requirements for the machine (120v, 220v 1-phase, 220v 3-phase) ASK IF UNSURE', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_06', 5, 'Connect the appropriate whip to the machine and then connect to power', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_07', 6, 'Ensure that the computer is reading on the front of the machine', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_08', 7, 'Close and lock the door', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_09', 8, 'Begin video showing the manufacturer placard on the back of the machine', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_10', 9, 'Move to the front and video payment', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_11', 10, 'Select each cycle button to show that they all function', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_12', 11, 'Select cold and press start', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_13', 12, 'Be sure that cold water is flowing correctly then switch to hot to do the same', false, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_14', 13, 'If possible, advance cycle to high spin to show/If not, end video here', true, false, false),
('00000000-0000-4000-8000-000000000161', 'washer_15', 14, 'Unplug machine and allow it to drain into the tub', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_01', 0, 'Inspect Bearing to Ensure No Noise or movement in the drum', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_02', 1, 'Unlock computer board and pull out slightly', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_03', 2, 'Ensure both pockets have good fuses', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_04', 3, 'Connect whip to hot, neutral, and ground to top pocket terminal', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_05', 4, 'Connect whip to power and check to see that the computer is reading on the front', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_06', 5, 'Begin video using the tablet showing the manufacturer placard on the back of the machine', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_07', 6, 'Move to the front and video payment', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_08', 7, 'Show payment successful on computer (flashing green light)', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_09', 8, 'Select all three temps on top pocket to show that they are working', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_10', 9, 'Repeat payment and temp selection for bottom pocket', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_11', 10, 'Close top pocket door and press start', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_12', 11, 'Move to the back of the machine and video close to the ignitor so that the spark can be heard', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_13', 12, 'Once spark is heard move back to the front of the machine and open the door to show that the door switch is functional', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_14', 13, 'Repeat the last three steps for the bottom pocket', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_15', 14, 'Move to the front of the machine, open the doors, and press the programming button on the computer', false, false, false),
('00000000-0000-4000-8000-000000000162', 'dryer_16', 15, 'Once the machine shows that it can successfully go into programming mode the video can be stopped', false, false, false);--> statement-breakpoint
UPDATE production_test_template SET approved_at = now() WHERE id IN ('00000000-0000-4000-8000-000000000161', '00000000-0000-4000-8000-000000000162');--> statement-breakpoint

INSERT INTO production_test_work_order(id, machine_id, machine_type, state, queued_at)
SELECT gen_random_uuid()::text, id, machine_type, 'queued', updated_at
FROM inventory_machine WHERE inventory_state = 'on_hand' AND production_state = 'preliminary_passed' AND machine_type IN ('washer', 'dryer')
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE TEMP TABLE production_test_backfilled_order AS SELECT id, machine_id FROM production_test_work_order;--> statement-breakpoint
CREATE TEMP TABLE production_test_backfilled_machine (id text PRIMARY KEY);--> statement-breakpoint
WITH changed AS (
  UPDATE inventory_machine SET production_state = 'awaiting_test', version = version + 1, updated_at = now()
  WHERE inventory_state = 'on_hand' AND production_state = 'preliminary_passed'
    AND id IN (SELECT machine_id FROM production_test_backfilled_order)
  RETURNING id
)
INSERT INTO production_test_backfilled_machine(id) SELECT id FROM changed;--> statement-breakpoint
INSERT INTO operations_audit_entry(id, actor_kind, actor_user_id, action, target_type, target_id, request_id, safe_summary)
SELECT gen_random_uuid()::text, 'system', null, 'production.test_work_order.created', 'production_test_work_order', id,
  'migration:0016:production-test-queue', jsonb_build_object('changedFields', ARRAY['state'], 'outcome', 'queued')
FROM production_test_backfilled_order;--> statement-breakpoint
INSERT INTO platform_outbox_job(id, actor_kind, actor_user_id, event_type, target_type, target_id, request_id, safe_summary)
SELECT gen_random_uuid()::text, 'system', null, 'production.test_work_order.created', 'production_test_work_order', id,
  'migration:0016:production-test-queue', jsonb_build_object('changedFields', ARRAY['state'], 'outcome', 'queued')
FROM production_test_backfilled_order;--> statement-breakpoint
INSERT INTO operations_audit_entry(id, actor_kind, actor_user_id, action, target_type, target_id, request_id, safe_summary)
SELECT gen_random_uuid()::text, 'system', null, 'inventory.machine.lifecycle_updated', 'machine', id,
  'migration:0016:production-test-queue', jsonb_build_object('changedFields', ARRAY['production_state'], 'outcome', 'awaiting_test')
FROM production_test_backfilled_machine;--> statement-breakpoint
INSERT INTO platform_outbox_job(id, actor_kind, actor_user_id, event_type, target_type, target_id, request_id, safe_summary)
SELECT gen_random_uuid()::text, 'system', null, 'inventory.machine.lifecycle_updated', 'machine', id,
  'migration:0016:production-test-queue', jsonb_build_object('changedFields', ARRAY['production_state'], 'outcome', 'awaiting_test')
FROM production_test_backfilled_machine;--> statement-breakpoint
DROP TABLE production_test_backfilled_machine;--> statement-breakpoint
DROP TABLE production_test_backfilled_order;
