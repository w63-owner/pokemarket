-- Feed: active listings sorted by date
CREATE INDEX idx_listings_active_created
  ON listings (created_at DESC, id)
  WHERE status = 'ACTIVE';

-- Feed: active listings sorted by price asc
CREATE INDEX idx_listings_active_price_asc
  ON listings (display_price ASC, id)
  WHERE status = 'ACTIVE';

-- Feed: active listings sorted by price desc
CREATE INDEX idx_listings_active_price_desc
  ON listings (display_price DESC, id)
  WHERE status = 'ACTIVE';

-- Seller's listings
CREATE INDEX idx_listings_seller_status
  ON listings (seller_id, status);

-- Text search (trigram for ILIKE)
CREATE INDEX idx_listings_title_trgm
  ON listings USING gin (title gin_trgm_ops);

-- Reserved for (partial)
CREATE INDEX idx_listings_reserved_for
  ON listings (reserved_for)
  WHERE reserved_for IS NOT NULL;
