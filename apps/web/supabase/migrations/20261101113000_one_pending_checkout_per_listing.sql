-- One card can have only one open checkout.
--
-- After Stripe expires a Checkout Session, the transaction row can still be
-- PENDING_PAYMENT until the webhook or release-expired cron runs. Two
-- overlapping retries both treat that expired session as replaceable, skip
-- the listing lock because it is already LOCKED, and insert a second
-- PENDING_PAYMENT row. Each row gets its own Stripe object. Paying both
-- finalizes two orders for the same card.

CREATE UNIQUE INDEX transactions_one_pending_checkout_per_listing
  ON public.transactions (listing_id)
  WHERE status = 'PENDING_PAYMENT';
