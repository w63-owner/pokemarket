import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { getStripe } from "@/lib/stripe/server";
import { payoutRateLimit, applyRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const rateLimitResponse = await applyRateLimit(payoutRateLimit, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const admin = createAdminClient();
    const stripe = getStripe();

    // Explicit ownership assertion: every downstream query is scoped to user.id,
    // so a caller can only ever touch their own wallet and their own Stripe account.
    // Any attempt to pass a different user's data would require a forged JWT,
    // which Supabase Auth already rejects at the getUser() step above.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profil introuvable" },
        { status: 404 },
      );
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json(
        {
          error:
            "Aucun compte Stripe Connect associé. Complétez le KYC d'abord.",
        },
        { status: 400 },
      );
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    if (!account.charges_enabled || !account.payouts_enabled) {
      return NextResponse.json(
        {
          error:
            "Votre compte Stripe n'est pas encore activé. Complétez la vérification d'identité.",
        },
        { status: 400 },
      );
    }

    const { data: wallet, error: walletError } = await admin
      .from("wallets")
      .select("available_balance, currency")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: "Portefeuille introuvable" },
        { status: 404 },
      );
    }

    const availableBalance = wallet.available_balance ?? 0;

    if (availableBalance <= 0) {
      return NextResponse.json(
        { error: "Solde insuffisant pour effectuer un virement" },
        { status: 400 },
      );
    }

    const amountInCents = Math.round(availableBalance * 100);
    const currency = wallet.currency ?? "eur";

    // Idempotency keys MUST be unique per payout attempt — NOT scoped to
    // amount+day. A seller legitimately withdrawing the same amount twice in
    // one day (e.g. two sales of identical-priced cards) would otherwise hit
    // the same Stripe idempotency window: the second `transfers.create` would
    // return the FIRST transfer (no money moved) while the wallet was zeroed a
    // second time — silently losing the seller's funds.
    //
    // True network-level double-submits are already blocked by the optimistic
    // lock below (a retry finds available_balance = 0 and 409s before reaching
    // Stripe), so a fresh per-attempt token is the correct dedup scope.
    const payoutToken = crypto.randomUUID();
    const transferIdempotencyKey = `payout-transfer-${user.id}-${payoutToken}`;
    const payoutIdempotencyKey = `payout-explicit-${user.id}-${payoutToken}`;

    // Atomically deduct the wallet BEFORE calling Stripe.
    // The extra .eq("available_balance", availableBalance) acts as an optimistic
    // lock: if a concurrent request already deducted this balance (or it changed),
    // PostgREST returns 0 rows and we bail early — preventing a double-payout.
    const { data: deducted, error: deductError } = await admin
      .from("wallets")
      .update({ available_balance: 0 })
      .eq("user_id", user.id)
      .eq("available_balance", availableBalance)
      .select("available_balance");

    if (deductError) {
      Sentry.captureException(deductError);
      return NextResponse.json(
        { error: "Erreur lors de la réservation du solde" },
        { status: 500 },
      );
    }

    if (!deducted || deducted.length === 0) {
      return NextResponse.json(
        { error: "Solde insuffisant ou virement déjà en cours" },
        { status: 409 },
      );
    }

    let transfer: Awaited<ReturnType<typeof stripe.transfers.create>> | null =
      null;

    try {
      transfer = await stripe.transfers.create(
        {
          amount: amountInCents,
          currency,
          destination: profile.stripe_account_id,
          metadata: {
            user_id: user.id,
            type: "seller_payout",
            amount_eur: (amountInCents / 100).toFixed(2),
            stripe_account_id: profile.stripe_account_id,
          },
        },
        { idempotencyKey: transferIdempotencyKey },
      );
    } catch (stripeErr) {
      // Stripe rejected the transfer — restore the wallet so the seller
      // can try again. If this restore fails we log a critical alert since
      // the ledger and Stripe are now out of sync.
      const { error: restoreError } = await admin
        .from("wallets")
        .update({ available_balance: availableBalance })
        .eq("user_id", user.id)
        .eq("available_balance", 0);

      if (restoreError) {
        Sentry.captureException(restoreError, {
          extra: {
            context: "wallet_restore_failed_after_stripe_error",
            user_id: user.id,
            amount: availableBalance,
          },
        });
        console.error(
          "[payout] CRITICAL: wallet restore failed after Stripe error",
          {
            user_id: user.id,
            amount: availableBalance,
            restoreError,
            stripeErr,
          },
        );
      }

      throw stripeErr;
    }

    // Insert payout record before triggering Stripe payout
    const { data: payoutRecord, error: insertError } = await admin
      .from("payouts")
      .insert({
        user_id: user.id,
        amount: availableBalance,
        currency: currency.toUpperCase(),
        status: "pending",
        stripe_transfer_id: transfer.id,
      })
      .select("id")
      .single();

    if (insertError) {
      Sentry.captureException(insertError, {
        extra: { context: "payout_record_insert", user_id: user.id },
      });
    }

    let payoutId: string | null = null;
    try {
      const payout = await stripe.payouts.create(
        {
          amount: amountInCents,
          currency,
          metadata: {
            user_id: user.id,
            transfer_id: transfer.id,
            payout_record_id: payoutRecord?.id ?? null,
          },
        },
        {
          stripeAccount: profile.stripe_account_id,
          idempotencyKey: payoutIdempotencyKey,
        },
      );
      payoutId = payout.id;

      // Update payout record with Stripe payout ID and status
      if (payoutRecord?.id) {
        await admin
          .from("payouts")
          .update({
            stripe_payout_id: payoutId,
            status: "in_transit",
          })
          .eq("id", payoutRecord.id);
      }
    } catch (payoutErr) {
      Sentry.captureException(payoutErr);
      console.warn(
        "[payout] Explicit payout creation failed, auto-payout will handle it:",
        payoutErr,
      );
    }

    console.info("[payout] Completed", {
      user_id: user.id,
      amount: availableBalance,
      stripe_transfer_id: transfer.id,
      stripe_payout_id: payoutId,
      payout_record_id: payoutRecord?.id,
    });

    return NextResponse.json({
      success: true,
      payout_amount: availableBalance,
      stripe_transfer_id: transfer.id,
      stripe_payout_id: payoutId,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[payout] Error:", err);

    if (isStripeError(err)) {
      if (err.code === "balance_insufficient") {
        return NextResponse.json(
          { error: "Fonds insuffisants sur le compte plateforme" },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { error: err.message ?? "Erreur Stripe lors du virement" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Erreur serveur inattendue lors du virement" },
      { status: 500 },
    );
  }
}

function isStripeError(
  err: unknown,
): err is { type: string; code?: string; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    typeof (err as Record<string, unknown>).type === "string"
  );
}
