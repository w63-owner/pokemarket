# Stripe — Operations Runbook

PokeMarket uses **Stripe Connect** (Express, controller properties) with the
**separate-charges-and-transfers** pattern for an escrow-style marketplace
flow. Card payments come in via **Stripe Checkout** (hosted), funds land on
the platform balance, and a manual transfer + payout pushes them to the
seller's connected account once the buyer confirms reception.

> Note: PokeMarket plans to migrate to MangoPay (see `docs/MANGOPAY.md` and
> the migration plan in `.cursor/plans/migration-stripe-mangopay_*.plan.md`).
> This document covers the Stripe stack as it exists today — applicable
> until the migration is shipped.

## 1. Environment variables

| Variable | Use |
|---|---|
| `STRIPE_SECRET_KEY` | Server-only API key (`sk_test_...` / `sk_live_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser key for Stripe.js (`pk_test_...` / `pk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | HMAC secret for `/api/webhooks/stripe` signature verification |
| `STRIPE_CONNECT_DEFAULT_COUNTRY` | ISO 3166-1 alpha-2, defaults to `FR` |
| `SUPPORT_EMAIL` | Used as Connect `business_profile.support_email` |

Get the test-mode values from https://dashboard.stripe.com/test/apikeys.
For webhook secret, see the next section.

## 2. Webhook endpoints to configure

PokeMarket has a single webhook endpoint at `POST /api/webhooks/stripe`
that handles every event type. Configure it in the Stripe dashboard at
**Developers > Webhooks > Add endpoint** with the following events:

### Required (Sprint 1)

- `checkout.session.completed` — payment succeeded, finalize the transaction
- `checkout.session.expired` — buyer abandoned the checkout (release the lock)
- `checkout.session.async_payment_failed` — async payment method failed (e.g. SEPA)

### Required (Sprint 2 — added)

- `account.updated` — auto-sync seller `kyc_status` (replaces polling)
- `charge.refunded` — finalize refunds and reverse seller wallet credit
- `charge.dispute.created` — chargeback opened, lock funds + alert admin
- `charge.dispute.updated` — keep our local dispute row in sync
- `charge.dispute.closed` — final outcome (won / lost / charge_refunded)
- `payout.failed` — restore seller's `available_balance`, notify
- `payout.paid` — confirmation push notification

### Optional / informational

- `payment_intent.payment_failed` — for richer failure analytics

> The endpoint URL in production is
> `https://pokemarket.fr/api/webhooks/stripe`. After creating the endpoint,
> copy the **Signing secret** (starts with `whsec_`) into
> `STRIPE_WEBHOOK_SECRET`.

## 3. Local webhook testing with the Stripe CLI

The Stripe CLI is the easiest way to forward webhooks to your local dev
server.

### Installation

```bash
brew install stripe/stripe-cli/stripe
stripe login
```

### Forwarding

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The CLI prints a temporary `whsec_...` you can put in `.env.local` to make
signature verification work locally.

### Triggering test events

```bash
# Refund flow
stripe trigger charge.refunded

# Dispute flow (full lifecycle)
stripe trigger charge.dispute.created
stripe trigger charge.dispute.updated
stripe trigger charge.dispute.closed

# Payout flow
stripe trigger payout.paid
stripe trigger payout.failed

# Connect account KYC sync
stripe trigger account.updated
```

Each `stripe trigger` builds a synthetic event Stripe-side, sends it to
your endpoint, and prints the response. Use this to validate the handler
runs end-to-end without needing a real card / dispute.

## 4. Connect account setup

PokeMarket creates Connect accounts with these properties (see
[`src/app/api/stripe-connect/onboard/route.ts`](src/app/api/stripe-connect/onboard/route.ts)):

```typescript
controller: {
  stripe_dashboard: { type: "express" },     // Express dashboard
  fees: { payer: "application" },             // PokeMarket pays Stripe fees
  losses: { payments: "application" },        // PokeMarket bears chargeback risk
  requirement_collection: "stripe",           // Stripe hosts onboarding
}
capabilities: {
  transfers: { requested: true },             // Only transfers — no direct charges
}
business_type: "individual"                   // 95% of sellers are private
business_profile: {
  mcc: "5945",                                // Hobby/Toy/Game Shops
  product_description: "...",
  url: "https://pokemarket.fr/profile/{id}",
  support_email: "support@pokemarket.fr",
}
```

### Why no `card_payments` capability?

PokeMarket uses **separate charges and transfers**: the platform creates
the Checkout Session on its OWN account, funds land on the platform
balance, and we manually transfer to the seller after escrow release.
The seller's connected account never directly accepts a card charge —
hence `card_payments` is not requested. Removing it lowers Stripe's KYC
demands on the seller (they don't need to be onboarded as a card acquirer).

### Why hard-code `business_type: "individual"`?

A vast majority of PokeMarket sellers are private collectors selling their
personal cards. Letting Stripe ask "Type d'entreprise" up-front used to
produce an unwanted "Entrepreneur individuel / Micro-entrepreneur" default
that scared casual sellers off. When we add a "compte vendeur professionnel"
toggle, this becomes
`profile.seller_type === "pro" ? "company" : "individual"`.

## 5. Refund flow

### Admin-initiated (recommended)

```bash
# As an admin user, POST to /api/admin/refund:
curl -X POST https://pokemarket.fr/api/admin/refund \
  -H "Cookie: <admin session>" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "11111111-2222-3333-4444-555555555555",
    "amount": 12.50,
    "reason": "requested_by_customer",
    "internal_note": "Buyer reported card damaged in shipping; full refund."
  }'
```

The route:

1. Verifies admin role
2. Validates the amount against `total_amount - refunded_amount`
3. Calls `stripe.refunds.create({ payment_intent, amount, reason, metadata })`
4. Records an entry in `admin_audit_log`
5. Returns immediately — DB mutations happen via the `charge.refunded`
   webhook (single source of truth)

### Dashboard-initiated

You can also refund from the Stripe dashboard. The `charge.refunded`
webhook will fire and our handler will reverse the seller's wallet credit
the same way.

## 6. Dispute flow

When a buyer's bank initiates a chargeback, Stripe fires
`charge.dispute.created`. PokeMarket then:

1. Inserts a row in `stripe_disputes` (see migration
   [`00049_stripe_disputes.sql`](supabase/migrations/00049_stripe_disputes.sql))
2. Decrements the seller's `pending_balance` by the locked amount
3. Marks the transaction `status = 'DISPUTED'`
4. Sends Sentry alert (configure rule on `tag: kind:stripe_dispute`)
5. Notifies the seller (push)

Admin must then submit evidence via the Stripe dashboard before
`evidence_due_by`. A future `/api/admin/dispute-evidence` route will
let admins upload evidence directly from the PokeMarket admin UI.

When the dispute closes (`charge.dispute.closed`), the handler:

- **won / warning_closed** → restores `pending_balance`, transaction reverts to `PAID`
- **lost / charge_refunded** → notifies seller; the parallel `charge.refunded`
  webhook handles the actual debit

## 7. Audit log

Every admin payment action is logged in `admin_audit_log` (see
[`00050_admin_audit_log.sql`](supabase/migrations/00050_admin_audit_log.sql)).
Schema:

```sql
admin_id     -- who did it
action_type  -- snake_case verb (e.g. "stripe_refund_create")
resource_type, resource_id  -- e.g. ("transaction", "uuid")
payload      -- JSONB context (amount, reason, stripe ids, ...)
ip_address, user_agent      -- forensics
created_at
```

Read access is admin-only via RLS policy.

## 8. Common debug scenarios

### Webhook signature verification fails

- Check `STRIPE_WEBHOOK_SECRET` matches the dashboard endpoint signing secret
- Verify you're using `req.text()` (raw body) and not `req.json()` before
  `stripe.webhooks.constructEvent`
- If forwarding via Stripe CLI, the secret printed by `stripe listen` is
  different from the dashboard secret — use the CLI one in dev.

### Refund webhook says "transaction not found"

- The transaction was created before Sprint 2.1 (no `stripe_charge_id`).
  Backfill via:
  ```bash
  stripe charges list --limit 100 --created.gt={ts}
  ```
  then update transactions manually. New transactions are populated
  automatically by `finalizePaidTransaction`.

### Dispute lost but seller's wallet wasn't debited

- The `charge.refunded` webhook handles the debit. Check the webhook log
  in Stripe dashboard for delivery status. If it returned 5xx, manually
  re-deliver from the dashboard.

## 9. Production checklist before going live

- [ ] Switch `STRIPE_SECRET_KEY` to live mode (`sk_live_...`)
- [ ] Switch `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to live mode
- [ ] Create new live-mode webhook endpoint with all events from §2
- [ ] Copy new live `whsec_...` to `STRIPE_WEBHOOK_SECRET`
- [ ] Verify `SUPPORT_EMAIL` is a monitored inbox (Stripe sends merchant emails there)
- [ ] Enable Stripe Radar Rules (see Sprint 3 plan):
  - `Block if :card_country: != :ip_country: AND :amount_in_eur: > 200`
  - `Review if :is_disposable_email: = true`
  - `3DS forced if :amount_in_eur: > 500`
- [ ] Configure Sentry alert rules on `tag: kind:stripe_dispute` (warning level)
- [ ] Configure Sentry alert rule on `tag: kind:stripe_payout, action:failed`
      (more than 3 in 1 hour)
- [ ] Test end-to-end with a real card on a soft launch
- [ ] Document on-call rotation for chargeback evidence submission
      (deadline can be as short as 7 days)
