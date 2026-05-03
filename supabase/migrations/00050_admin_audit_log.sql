-- 00050: Admin audit log
--
-- Captures every privileged action performed by an admin (refunds, dispute
-- evidence submissions, role changes, …) for SOC2-style traceability.
--
-- Insertions happen via the service_role client from admin route handlers
-- (RLS is bypassed). Reads are restricted to admins.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin
  ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action
  ON public.admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON public.admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_log_admin_read" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_admin_read" ON public.admin_audit_log
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
