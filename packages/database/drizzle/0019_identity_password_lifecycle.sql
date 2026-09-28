ALTER TABLE identity_profile ADD COLUMN password_change_required boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE identity_security_activity DROP CONSTRAINT identity_security_activity_action_check;--> statement-breakpoint
ALTER TABLE identity_security_activity ADD CONSTRAINT identity_security_activity_action_check CHECK (action IN ('signed_in', 'signed_out', 'user_created', 'role_changed', 'user_activated', 'user_deactivated', 'sessions_revoked', 'user_provisioned', 'authorization_denied', 'password_changed', 'password_reset'));--> statement-breakpoint
DO $$
DECLARE item record; previous_definition text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('operations_audit_entry', 'operations_audit_action_check', 'action'),
    ('platform_outbox_job', 'platform_outbox_event_type_check', 'event_type')
  ) AS constraints(table_name, constraint_name, column_name)
  LOOP
    SELECT pg_get_constraintdef(c.oid) INTO previous_definition FROM pg_constraint c
      WHERE c.conrelid = item.table_name::regclass AND c.conname = item.constraint_name;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', item.table_name, item.constraint_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s OR %I IN (''identity.user.password_changed'', ''identity.user.password_reset''))',
      item.table_name, item.constraint_name,
      left(previous_definition, length(previous_definition) - 1), item.column_name);
  END LOOP;
END $$;
