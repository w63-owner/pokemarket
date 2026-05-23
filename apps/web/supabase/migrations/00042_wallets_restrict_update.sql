-- 00042: Harden wallet RLS — remove client-side balance write access
--
-- The original "wallets_update_own" policy allowed any authenticated user to
-- UPDATE their own wallet row via the PostgREST API, which includes the
-- available_balance and pending_balance columns.  Combined with the payout
-- endpoint this created an escalation path:
--   1. PATCH /rest/v1/wallets?user_id=eq.<uid>  { "available_balance": 9999 }
--   2. POST  /api/stripe-connect/payout          → transfers 9999 € to Stripe
--
-- All legitimate balance mutations happen server-side through the service_role
-- (admin) client:
--   • pending_balance  ← Stripe webhook (checkout.session.completed)
--   • available_balance ← escrow-release cron / trigger  (pending → available)
--   • available_balance ← payout route (set to 0 after transfer)
--
-- Regular users never need to write to wallets via the client SDK.

DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;

-- Read-only access is still required so the wallet page can display the balance.
-- "wallets_select_own" from 00011 is kept as-is.
