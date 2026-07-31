-- Trigram indexes keep inbox search bounded as listings and profiles grow.
CREATE INDEX IF NOT EXISTS listings_title_trgm_idx
  ON public.listings USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_username_trgm_idx
  ON public.profiles USING gin (username gin_trgm_ops);
