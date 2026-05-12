-- 00038: Add admin role to profiles
-- Sprint 4.1 — Admin dashboard & moderation

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'::text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin'));

-- Prevent non-service-role clients from escalating their own role
CREATE POLICY "Users cannot change their own role"
  ON public.profiles
  FOR UPDATE
  USING (true)
  WITH CHECK (
    (role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
