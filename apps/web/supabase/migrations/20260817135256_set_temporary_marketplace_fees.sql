-- Rebuild the generated buyer-facing price with the temporary €0.01 fee.
-- Dropping the generated column also drops its two dependent price indexes,
-- which are recreated below.
set local lock_timeout = '5s';

alter table public.listings
  drop constraint if exists listings_price_seller_check;

-- NOT VALID preserves any historical listing below €1 while enforcing the
-- minimum on every new or updated listing.
alter table public.listings
  add constraint listings_price_seller_check
  check (price_seller >= 1) not valid;

alter table public.listings
  drop column display_price;

alter table public.listings
  add column display_price numeric(10, 2)
  generated always as (round(price_seller + 0.01, 2)) stored;

create index idx_listings_active_price_asc
  on public.listings (display_price asc, id)
  where status = 'ACTIVE';

create index idx_listings_active_price_desc
  on public.listings (display_price desc, id)
  where status = 'ACTIVE';
