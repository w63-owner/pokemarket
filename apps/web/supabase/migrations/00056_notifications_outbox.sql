-- 00056_notifications_outbox.sql
--
-- Reliable outbox for the "soft" notification channels (push + email).
--
-- Context: the in-app system message (table `messages`) is already written
-- inside the payment-finalization flow and is our STRONG delivery guarantee.
-- Push and email, by contrast, used to be fire-and-forget — a transient Resend
-- or Web Push failure silently dropped the notification. This table durably
-- records each push/email to send so a drain cron can retry with backoff until
-- it succeeds or exhausts its attempts.
--
-- Written ONLY by the service_role (the Next.js backend): enqueued from
-- webhook / Server Action handlers and drained by /api/cron/drain-notifications.
-- No client ever reads or writes it, hence no authenticated RLS policy.

CREATE TABLE IF NOT EXISTS public.notifications_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('push', 'email')),
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Self-contained render payload (title/body/link for push; subject + template
  -- discriminant + template data for email). We snapshot the data at enqueue
  -- time so the drain never has to re-fetch and can't drift from the order.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- Drain query selects PENDING rows that are due (next_attempt_at <= now())
-- ordered by next_attempt_at; this partial index keeps that scan cheap as the
-- table grows and SENT/FAILED rows accumulate.
CREATE INDEX IF NOT EXISTS idx_notifications_outbox_due
  ON public.notifications_outbox (next_attempt_at)
  WHERE status = 'PENDING';

CREATE TRIGGER set_notifications_outbox_updated_at
  BEFORE UPDATE ON public.notifications_outbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- service_role only. Enable RLS and revoke all client access so a leaked anon /
-- authenticated key can never read recipients' notification payloads.
ALTER TABLE public.notifications_outbox ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policy is defined: with RLS enabled the anon
-- and authenticated roles are denied by default. The service_role bypasses RLS,
-- so only the backend can enqueue and drain. REVOKE adds defense-in-depth.
REVOKE ALL ON public.notifications_outbox FROM PUBLIC;
