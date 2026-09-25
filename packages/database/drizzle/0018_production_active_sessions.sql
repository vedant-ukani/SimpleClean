CREATE TABLE production_test_session (
  id text PRIMARY KEY,
  worker_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  specialty text NOT NULL CHECK (specialty IN ('washer', 'dryer')),
  state text NOT NULL CHECK (state IN ('active', 'paused', 'completed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT production_test_session_completion_check CHECK ((state = 'completed') = (completed_at IS NOT NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX production_test_one_open_session_per_worker ON production_test_session(worker_user_id) WHERE completed_at IS NULL;--> statement-breakpoint
CREATE TABLE production_test_session_item (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES production_test_session(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES production_test_work_order(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('working', 'running_cycle', 'waiting', 'completed', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT production_test_session_item_unique UNIQUE (session_id, order_id),
  CONSTRAINT production_test_session_item_completion_check CHECK ((state IN ('completed', 'removed')) = (ended_at IS NOT NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX production_test_one_open_session_per_order ON production_test_session_item(order_id) WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX production_test_session_item_order ON production_test_session_item(session_id, created_at, id);--> statement-breakpoint
ALTER TABLE production_test_work_order ADD COLUMN active_session_id text REFERENCES production_test_session(id) ON DELETE RESTRICT;--> statement-breakpoint
CREATE INDEX production_test_work_order_active_session ON production_test_work_order(active_session_id) WHERE active_session_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE production_test_session_event (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES production_test_session(id) ON DELETE RESTRICT,
  order_id text REFERENCES production_test_work_order(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created', 'added', 'item_state_changed', 'paused', 'resumed', 'item_completed', 'item_removed', 'finished')),
  item_state text CHECK (item_state IS NULL OR item_state IN ('working', 'running_cycle', 'waiting', 'completed', 'removed')),
  actor_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_test_session_event_shape_check CHECK (
    (action IN ('created', 'added', 'item_state_changed', 'item_completed', 'item_removed') AND order_id IS NOT NULL AND item_state IS NOT NULL)
    OR (action IN ('paused', 'resumed', 'finished') AND order_id IS NULL AND item_state IS NULL)
  )
);--> statement-breakpoint
CREATE INDEX production_test_session_event_order ON production_test_session_event(session_id, created_at, id);--> statement-breakpoint
CREATE TRIGGER production_test_session_event_immutable BEFORE UPDATE OR DELETE ON production_test_session_event FOR EACH ROW EXECUTE FUNCTION production_reject_test_history_change();--> statement-breakpoint

DO $$
DECLARE item record; previous_definition text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('operations_audit_entry', 'operations_audit_action_check', 'action', '''production.test_session.created'', ''production.test_session.orders_added'', ''production.test_session.item_state_changed'', ''production.test_session.paused'', ''production.test_session.resumed'', ''production.test_session.finished'', ''production.test_session.item_completed'', ''production.test_session.item_removed'', ''production.test.bearing_concern_reported'''),
    ('platform_outbox_job', 'platform_outbox_event_type_check', 'event_type', '''production.test_session.created'', ''production.test_session.orders_added'', ''production.test_session.item_state_changed'', ''production.test_session.paused'', ''production.test_session.resumed'', ''production.test_session.finished'', ''production.test_session.item_completed'', ''production.test_session.item_removed'', ''production.test.bearing_concern_reported'''),
    ('operations_audit_entry', 'operations_audit_target_type_check', 'target_type', '''production_test_session'', ''production_test_session_event'', ''production_test_bearing_concern'''),
    ('platform_outbox_job', 'platform_outbox_target_type_check', 'target_type', '''production_test_session'', ''production_test_session_event'', ''production_test_bearing_concern'''),
    ('operations_idempotency_record', 'operations_idempotency_target_type_check', 'target_type', '''production_test_session'', ''production_test_session_event'', ''production_test_bearing_concern''')
  ) AS constraints(table_name, constraint_name, column_name, extra_values)
  LOOP
    SELECT pg_get_constraintdef(c.oid) INTO previous_definition FROM pg_constraint c
      WHERE c.conrelid = item.table_name::regclass AND c.conname = item.constraint_name;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', item.table_name, item.constraint_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s OR %I IN (%s))',
      item.table_name, item.constraint_name,
      left(previous_definition, length(previous_definition) - 1), item.column_name, item.extra_values);
  END LOOP;
END $$;--> statement-breakpoint

CREATE TABLE production_test_bearing_concern (
  id text PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES production_test_work_order(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TRIGGER production_test_bearing_concern_immutable BEFORE UPDATE OR DELETE ON production_test_bearing_concern FOR EACH ROW EXECUTE FUNCTION production_reject_test_history_change();--> statement-breakpoint

INSERT INTO production_test_template(id, machine_type, version) VALUES
('00000000-0000-4000-8000-000000000181', 'washer', 2),
('00000000-0000-4000-8000-000000000182', 'dryer', 2);--> statement-breakpoint
INSERT INTO production_test_step(template_id, step_key, position, instruction, allow_na, stop_on_failure, photo_required)
SELECT CASE machine_type WHEN 'washer' THEN '00000000-0000-4000-8000-000000000181' ELSE '00000000-0000-4000-8000-000000000182' END,
       step_key, position - 1, instruction, allow_na, stop_on_failure, photo_required
FROM production_test_step JOIN production_test_template ON production_test_template.id = production_test_step.template_id
WHERE production_test_template.version = 1 AND production_test_step.position > 0;--> statement-breakpoint
UPDATE production_test_template SET approved_at = now() WHERE version = 2 AND id IN ('00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000182');
