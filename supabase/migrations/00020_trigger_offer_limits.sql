-- Limit: max 10 offers per buyer per day
CREATE OR REPLACE FUNCTION check_offer_daily_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  daily_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO daily_count
  FROM offers
  WHERE buyer_id = NEW.buyer_id
    AND created_at >= CURRENT_DATE;

  IF daily_count >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 offres par jour atteint';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_offer_daily_limit
  BEFORE INSERT ON offers
  FOR EACH ROW EXECUTE FUNCTION check_offer_daily_limit();

-- Limit: offer must be >= 70% of display_price
CREATE OR REPLACE FUNCTION check_offer_minimum()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  listing_display_price NUMERIC;
BEGIN
  SELECT display_price INTO listing_display_price
  FROM listings
  WHERE id = NEW.listing_id;

  IF NEW.offer_amount < listing_display_price * 0.70 THEN
    RAISE EXCEPTION 'Le montant de l''offre doit être au moins 70%% du prix affiché';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_offer_minimum
  BEFORE INSERT ON offers
  FOR EACH ROW EXECUTE FUNCTION check_offer_minimum();
