-- Sellers also used to have a broad UPDATE policy. Server routes now own every
-- offer transition, so no authenticated participant needs direct write access.
DROP POLICY IF EXISTS "offers_update_seller" ON public.offers;
