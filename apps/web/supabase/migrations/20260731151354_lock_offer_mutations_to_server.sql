-- Offer state transitions emit reserved message types. Keep all mutations
-- behind authenticated server routes using the service-role client so a buyer
-- cannot rewrite listing/conversation/status fields through PostgREST.
DROP POLICY IF EXISTS "offers_insert_buyer" ON public.offers;
DROP POLICY IF EXISTS "offers_update_buyer" ON public.offers;
