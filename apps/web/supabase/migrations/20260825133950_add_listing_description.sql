ALTER TABLE public.listings
ADD COLUMN description text;

ALTER TABLE public.listings
ADD CONSTRAINT listings_description_length
CHECK (description IS NULL OR char_length(description) <= 1000);

COMMENT ON COLUMN public.listings.description IS
  'Optional seller-provided details about condition, flaws, and centering.';
