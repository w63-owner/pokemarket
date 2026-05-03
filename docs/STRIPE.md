# Stripe — PokeMarket

Reference for everything Stripe-related in PokeMarket: integration architecture, webhook configuration, anti-fraud rules, and operational runbooks.

> Stripe API version pinned in [src/lib/stripe/server.ts](../src/lib/stripe/server.ts): **`2026-02-25.clover`**.
> Best-practice doc followed: [Stripe Integration Options](https://docs.stripe.com/payments/payment-methods/integration-options).

---

## 1. Integration architecture

PokeMarket uses three Stripe surfaces:

| Surface                    | Purpose                                      | Code path                                                                                     |
| -------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Stripe Checkout**        | Buyer-facing payment page (one-shot, hosted) | [src/app/api/checkout/route.ts](../src/app/api/checkout/route.ts)                             |
| **Stripe Connect Express** | Seller onboarding + KYC + IBAN collection    | [src/app/api/stripe-connect/onboard/route.ts](../src/app/api/stripe-connect/onboard/route.ts) |
| **Stripe SetupIntents**    | Save buyer cards for one-click checkout      | [src/app/api/stripe/payment-methods/route.ts](../src/app/api/stripe/payment-methods/route.ts) |

### Funds flow ("separate charges and transfers")

```text
Buyer ── Checkout ──> Platform Stripe Balance
                              │
                              │  (held as escrow until buyer confirms reception)
                              │
                              ▼
                       wallets.pending_balance
                              │
                              │  release-escrow cron after delivery
                              ▼
                       wallets.available_balance
                              │
                              │  POST /api/stripe-connect/payout
                              ▼
              stripe.transfers.create() ── Stripe Connect account
                                                    │
                                                    │  stripe.payouts.create()
                                                    ▼
                                            Seller IBAN
```

This is **not** the default Stripe Connect pattern — see the architecture decision record at [docs/adr/001-stripe-charge-architecture.md](adr/001-stripe-charge-architecture.md) for why we deliberately chose separate charges and transfers over destination charges.

---

## 2. Webhook configuration

PokeMarket exposes a single webhook endpoint that handles every Stripe event we care about.

**Endpoint:** `POST {APP_URL}/api/webhooks/stripe`

### Required events

In the Stripe Dashboard (`Developers > Webhooks > Add endpoint`), enable:

| Event                                   | Why                                                       | Handler                   |
| --------------------------------------- | --------------------------------------------------------- | ------------------------- |
| `checkout.session.completed`            | Mark transaction PAID, credit seller pending_balance      | `handleCheckoutCompleted` |
| `checkout.session.expired`              | Release listing lock when buyer abandons                  | `handleCheckoutFailed`    |
| `checkout.session.async_payment_failed` | Same as above for async payment methods (SEPA, Klarna…)   | `handleCheckoutFailed`    |
| `account.updated`                       | Push-sync seller KYC status (no client polling needed)    | `handleAccountUpdated`    |
| `charge.refunded`                       | Mirror refunds in DB, debit seller wallet                 | `handleChargeRefunded`    |
| `charge.dispute.created`                | Open a `stripe_disputes` row, lock seller pending balance | `handleDisputeCreated`    |
| `charge.dispute.updated`                | Mirror evidence updates                                   | `handleDisputeUpdated`    |
| `charge.dispute.closed`                 | Restore wallet on win, finalize on lose                   | `handleDisputeClosed`     |
| `payout.failed`                         | Restore `available_balance`, alert seller about IBAN      | `handlePayoutFailed`      |
| `payout.paid`                           | Send "money arrived" push notification                    | `handlePayoutPaid`        |

Connect-specific events (`account.updated`, `payout.*`) require enabling **"Listen to events on Connected accounts"** when creating the endpoint, otherwise they are silently dropped by Stripe.

### Secret rotation

The endpoint signing secret is read from `STRIPE_WEBHOOK_SECRET`. After any Dashboard change (event additions, URL change, secret rotation), update this env in:

- Vercel project envs (per environment: dev / staging / prod)
- Supabase Edge Functions if any are added later
- Local `.env.local` for local Stripe CLI testing

### Idempotency

Every incoming event is recorded in `stripe_webhooks_processed.stripe_event_id` (unique constraint).
Duplicate deliveries return `{ received: true, duplicate: true }` and skip the handler — see [src/app/api/webhooks/stripe/route.ts](../src/app/api/webhooks/stripe/route.ts).

---

## 3. Local testing with the Stripe CLI

```bash
# Install once
brew install stripe/stripe-cli/stripe

# Login (browser flow)
stripe login

# Forward live events to local dev
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe

# In another terminal, fire individual events
stripe trigger checkout.session.completed
stripe trigger charge.refunded
stripe trigger charge.dispute.created
stripe trigger payout.failed
stripe trigger account.updated
```

`stripe listen` prints a temporary webhook secret to your terminal — paste it into `STRIPE_WEBHOOK_SECRET` in `.env.local` before starting `npm run dev`.

---

## 4. Admin runbooks

### Issue a refund

`POST /api/admin/refund` (admin-only, see [src/app/api/admin/refund/route.ts](../src/app/api/admin/refund/route.ts)).

```jsonc
{
  "transaction_id": "uuid-of-the-transaction",
  "amount": 12.5, // optional; omit for a full refund
  "reason": "requested_by_customer", // duplicate | fraudulent | requested_by_customer
  "internal_note": "Buyer reported damaged card via support",
}
```

Behaviour:

- Calls `stripe.refunds.create()` with an idempotency key derived from the transaction + amount + admin id.
- Does **not** touch the local DB; the wallet debit + transaction status flip happen in the matching `charge.refunded` webhook (single source of truth).
- Writes an `admin_audit_log` row with the Stripe refund id and the internal note.

### Submit dispute evidence

`POST /api/admin/dispute-evidence` (admin-only, planned in Sprint 3 — see code link once implemented).
Set `submit: false` to save a draft, `submit: true` to lock the submission.

---

## 5. Anti-fraud (Stripe Radar)

Configure these rules in the Stripe Dashboard (`Radar > Rules`). They are not in code because Radar rules are evaluated by Stripe before the charge ever hits our backend.

> Stripe Radar for Fraud Teams costs ~0,02€ per transaction. Do not enable until volume justifies it (>1 000 transactions per month).

### Recommended rule set

```text
# Block high-value cross-border charges (mostly fraud on collectibles)
:block: if :card_country: != :ip_country: and :amount_in_eur: > 200

# Review disposable / temporary email addresses
:review: if :is_disposable_email:
:review: if :email_domain: in ('tempmail.com', 'guerrillamail.com', '10minutemail.com')

# Big basket on a freshly created customer = high fraud risk
:block: if :amount_in_eur: > 5000 and :customer_age_in_days: < 7

# Force 3DS challenge above 500 EUR
:request_3d_secure: if :amount_in_eur: > 500
```

Adjust thresholds in dashboard once we have ≥3 months of charge history.

### Alternatives if Radar is too expensive

- Force 3DS for every payment via `payment_method_options.card.request_three_d_secure: 'any'` on the Checkout Session (free, but adds friction).
- Filter cards from blocked countries client-side before redirecting to Checkout.

---

## 6. Environment variables

| Variable                             | Purpose                                                  | Required |
| ------------------------------------ | -------------------------------------------------------- | -------- |
| `STRIPE_SECRET_KEY`                  | Server-side API calls                                    | Yes      |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js + Elements bootstrap                           | Yes      |
| `STRIPE_WEBHOOK_SECRET`              | Webhook signature verification                           | Yes      |
| `STRIPE_CONNECT_DEFAULT_COUNTRY`     | Override default country for `accounts.create()` (FR)    | No       |
| `SUPPORT_EMAIL`                      | Surfaced in `business_profile.support_email` for Connect | No       |
| `NEXT_PUBLIC_APP_URL`                | Used to build `account_onboarding` return/refresh URLs   | Yes      |

All Stripe secrets live in Vercel project env vars (per environment) and Cursor Cloud Agent secrets — never hardcode in the repo.

---

## 7. Migration history

| Migration                                                                                                               | Notes                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [00002_profiles_wallets.sql](../supabase/migrations/00002_profiles_wallets.sql)                                         | Initial wallets + `stripe_account_id` / `stripe_customer_id`      |
| [00041_transactions_status_transition_guard.sql](../supabase/migrations/00041_transactions_status_transition_guard.sql) | DB-side guard on PAID→SHIPPED→COMPLETED transitions               |
| [00042_wallets_restrict_update.sql](../supabase/migrations/00042_wallets_restrict_update.sql)                           | Removed RLS UPDATE on wallets (prevents balance forgery)          |
| [00048_transactions_stripe_ids.sql](../supabase/migrations/00048_transactions_stripe_ids.sql)                           | Adds `stripe_payment_intent_id`, `stripe_charge_id`, `refunded_*` |
| [00049_stripe_disputes.sql](../supabase/migrations/00049_stripe_disputes.sql)                                           | Chargebacks tracking table (admin-only RLS)                       |
| [00050_admin_audit_log.sql](../supabase/migrations/00050_admin_audit_log.sql)                                           | Audit trail for admin mutations (refunds, dispute evidence, …)    |
