-- Enable RLS on ocr_attempts
ALTER TABLE public.ocr_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ocr attempts"
  ON public.ocr_attempts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ocr attempts"
  ON public.ocr_attempts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Enable RLS on stripe_webhooks_processed
-- No policies: anon/authenticated are fully blocked.
-- Only service_role (used by the Stripe webhook API route) can read/write.
ALTER TABLE public.stripe_webhooks_processed ENABLE ROW LEVEL SECURITY;
