-- Replace the temporary €0.01 fee with buyer protection that includes:
--   - DeckDealr commission: 5% of the seller's requested price
--   - simulated Stripe France standard EEA-card pricing: 1.5% + €0.25
--   - Stripe simulation based on the seller price plus maximum shipping (€19.90)
-- The gross-up covers Stripe's 1.5% charge on buyer protection itself.
--
-- Keep these constants aligned with packages/shared/src/constants/index.ts
-- and packages/shared/src/lib/shipping.ts.
begin;

set local lock_timeout = '5s';

alter table public.listings
  drop column display_price;

alter table public.listings
  add column display_price numeric(10, 2)
  generated always as (
    round(
      price_seller
      + (
        ceil(
          (
            (
              price_seller * 0.05
              + 0.25
              + (price_seller + 19.90) * 0.015
            )
            / (1 - 0.015)
          ) * 100
        ) / 100
      ),
      2
    )
  ) stored;

create index idx_listings_active_price_asc
  on public.listings (display_price asc, id)
  where status = 'ACTIVE';

create index idx_listings_active_price_desc
  on public.listings (display_price desc, id)
  where status = 'ACTIVE';

commit;
