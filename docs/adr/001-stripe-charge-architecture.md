# ADR 001 — Stripe Connect charge architecture

- **Status**: Accepted
- **Date**: 2026-05-03
- **Decision drivers**: escrow flow, lazy KYC, regulatory exposure
- **Stakeholders**: founders, eng, future compliance

## Context

PokeMarket is a C2C marketplace for Pokémon cards in France/EU. Money flow is non-trivial:

1. Buyer pays via Stripe Checkout.
2. Seller ships the card.
3. Buyer confirms reception (or 7-day timer expires).
4. Funds are released to the seller's wallet, who can later withdraw.

Stripe Connect supports three integration patterns ([docs](https://docs.stripe.com/connect/charges)):

| Pattern                            | Funds land where             | Merchant of record | Platform liability for chargebacks | Requires KYC before sale |
| ---------------------------------- | ---------------------------- | ------------------ | ---------------------------------- | ------------------------ |
| **Direct charges**                 | Connected (seller) account   | Seller             | Seller                             | Yes                      |
| **Destination charges**            | Platform account, then split | Platform           | Platform                           | Yes                      |
| **Separate charges and transfers** | Platform account             | Platform           | Platform                           | **No**                   |

The official Stripe best-practice doc recommends defaulting to direct or destination charges and explicitly warns against mixing patterns. So why are we picking the third option?

## Decision

**PokeMarket uses the "separate charges and transfers" Connect pattern**:

- The buyer pays into the platform's Stripe balance (via `stripe.checkout.sessions.create()` without `payment_intent_data.transfer_data`).
- We track the seller's "earnings" in `wallets.pending_balance` (Supabase) until the buyer confirms reception or the escrow window expires.
- After release, the buyer can request a payout via `POST /api/stripe-connect/payout`, which performs `stripe.transfers.create({ destination: seller_account_id })` and `stripe.payouts.create({ stripeAccount: seller_account_id })`.

## Why not direct/destination charges?

Both alternatives require **KYC completion before the seller can be paid out** — Stripe needs `charges_enabled: true` on the connected account before any payment can target it.

In contrast, "separate charges and transfers" lets us:

- Allow new sellers to **list, sell, and accumulate earnings before completing KYC**. This is critical for our growth funnel — most casual sellers (clearing their childhood collection) want to test the experience before submitting an ID document.
- **Defer the KYC ask to the moment the seller actually wants to withdraw money**. The wallet UI shows their balance and only prompts for KYC when they click "Retirer X €".
- Keep escrow logic in our database rather than relying on Stripe's deferred capture / manual payout schedule, which would force us to hold funds on the connected account (forbidden if KYC isn't complete).

This is the same pattern used by Vinted in its early days (before they obtained their own EMI license via Vinted Pay UAB) and by similar EU C2C marketplaces.

## Trade-offs we accept

1. **Platform balance bears chargeback risk**: a successful chargeback debits _our_ Stripe balance. We mitigate by debiting the seller's `pending_balance` on `charge.dispute.created` and refusing future payouts until the dispute resolves; in the worst case the platform absorbs the loss as cost of doing business.
2. **Complex reconciliation**: we maintain our own ledger (`wallets`, `transactions.refunded_amount`) instead of relying on Stripe's connected-account ledger. The webhook handlers in `src/app/api/webhooks/stripe/handlers.ts` are therefore the single source of truth — every change to `wallets.pending_balance` happens through them.
3. **Possible regulatory exposure**: in France, holding funds on behalf of a third party can be considered "encaissement pour compte de tiers" requiring an EMI/PSP license. Stripe currently shields us as the acquirer (the funds technically sit on Stripe's books, not ours), but this is a grey area that can shift if the ACPR audits the model or if EU directives evolve. Plan B is migration to MangoPay or Lemonway (both ACPR-licensed) — see the migration triggers below.

## When to revisit / migrate

Move from "separate charges and transfers" to **destination charges + manual payout schedule** if any of these triggers fire:

| Trigger                                                         | Why                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| GMV > 100 k€ / month sustained                                  | Chargeback exposure on platform balance becomes material       |
| Average chargeback rate > 0.5 % of transactions                 | Same — risk concentration                                      |
| ACPR enquiry / external compliance request                      | Need to remove the "encaisseur pour compte de tiers" ambiguity |
| Average seller takes > 2 weeks to complete KYC after first sale | Lazy KYC is no longer a UX win — force it upfront              |

If any of these fire, the migration plan is:

1. New checkout sessions add `payment_intent_data: { transfer_data: { destination: seller_acct_id }, application_fee_amount, on_behalf_of: seller_acct_id }`.
2. Connected accounts switch to `payouts.schedule = manual` so the platform still controls the escrow window.
3. Release-escrow cron now calls `stripe.payouts.create({ stripeAccount: seller_acct_id })` instead of `stripe.transfers.create()`.
4. `wallets.pending_balance` becomes a read-only reflection of Stripe-side balances; the local ledger is kept for UX (showing "X € pending") but not as source of truth.

If we hit Vinted-scale (millions of users / GMV per year), the next escalation is to **acquire an agent-of-PSP status with MangoPay or Lemonway**, taking us out of Stripe entirely for the payment layer (Stripe stays for buyer-side card acceptance only).

## References

- [Stripe — Choose your Connect integration](https://docs.stripe.com/connect/integration-recommendations)
- [Stripe — Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [ACPR — Activités d'encaissement pour compte de tiers](https://acpr.banque-france.fr/)
- [docs/STRIPE.md](../STRIPE.md) — operational reference
