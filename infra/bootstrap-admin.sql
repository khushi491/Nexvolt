-- Run with psql against the intended hosted database after registering through real OTP.
-- This grants the FIRST admin only; it never creates a user or bypasses phone verification.
\set ON_ERROR_STOP on
\prompt 'Registered first-admin phone (E.164, e.g. +919876543210): ' admin_phone
BEGIN;
SELECT set_config('nexvolt.bootstrap_phone', :'admin_phone', true);
DO $$
DECLARE
  target users%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('nexvolt.first_admin'));
  IF EXISTS (SELECT 1 FROM users WHERE 'ADMIN' = ANY(roles)) THEN
    RAISE EXCEPTION 'An admin already exists. Use the existing admin workflow.';
  END IF;
  SELECT * INTO target FROM users
    WHERE phone = current_setting('nexvolt.bootstrap_phone') FOR UPDATE;
  IF NOT FOUND OR target.status <> 'ACTIVE' OR target."isSample"
      OR target."lastLoginAt" IS NULL OR target."consentAcceptedAt" IS NULL THEN
    RAISE EXCEPTION 'Register an active, non-sample user through OTP and accept consent first.';
  END IF;
  UPDATE users SET roles = array_append(roles, 'ADMIN'::"Role"), "updatedAt" = now()
    WHERE id = target.id;
  INSERT INTO audit_logs
    (id, "actorId", "actorRole", action, "resourceType", "resourceId", reason, "oldValue", "newValue")
  VALUES
    (gen_random_uuid(), NULL, 'SYSTEM', 'user.bootstrap_admin', 'User', target.id::text,
     'Initial admin provisioned by authenticated database operator',
     jsonb_build_object('roles', target.roles),
     jsonb_build_object('roles', array_append(target.roles, 'ADMIN'::"Role")));
END $$;
COMMIT;
\unset admin_phone
