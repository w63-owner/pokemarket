-- Reports table: listing flagging system (counterfeits, scams, abuse)
CREATE TABLE public.reports (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    listing_id  uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    reason      text NOT NULL CHECK (reason IN ('counterfeit', 'scam', 'inappropriate', 'other')),
    description text,
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- One report per user per listing
CREATE UNIQUE INDEX reports_reporter_listing_uniq ON public.reports (reporter_id, listing_id);

CREATE INDEX reports_listing_id_idx ON public.reports (listing_id);
CREATE INDEX reports_status_idx ON public.reports (status);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own reports
CREATE POLICY "Users can insert own reports"
    ON public.reports
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = reporter_id);

-- Authenticated users can view their own reports
CREATE POLICY "Users can view own reports"
    ON public.reports
    FOR SELECT
    TO authenticated
    USING (auth.uid() = reporter_id);
