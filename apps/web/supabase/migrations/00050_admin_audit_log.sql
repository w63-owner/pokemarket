-- 00050_admin_audit_log.sql
--
-- Sprint 2 (Stripe best practices) — track every admin action for compliance,
-- security forensics, and accountability.
--
-- Used by:
--   - /api/admin/refund            (refund issued by admin)
--   - /api/admin/dispute-evidence  (Sprint 3)
--   - any future admin mutation route
--
-- The action_type is a free-form string scoped to a snake_case verb so
-- new actions don't require schema changes. Payload is JSONB to capture
-- whatever context the action needs (ids, amounts, reasons, etc.).

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  action_type text NOT NULL,
  resource_type text,
  resource_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin
  ON public.admin_audit_log(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_resource
  ON public.admin_audit_log(resource_type, resource_id)
  WHERE resource_id IS NOT NULL;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read the audit log. Even the actor cannot mutate or delete
-- their own entries (insert is service_role only via the admin client).
CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
