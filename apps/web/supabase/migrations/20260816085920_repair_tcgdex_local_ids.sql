-- Older English catalog imports can contain a null local_id even though the
-- collector number is present as the final segment of the canonical card ID
-- (for example, sv01-116).
UPDATE public.tcgdex_cards
SET local_id = substring(id FROM '[^-]+$')
WHERE (local_id IS NULL OR btrim(local_id) = '')
  AND id ~ '.+-.+';
