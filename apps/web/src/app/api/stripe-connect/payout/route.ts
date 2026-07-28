import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { getRequestUser } from "@/lib/auth/api";
import { applyRateLimit, payoutRateLimit } from "@/lib/rate-limit";
import {
  getStripePayoutCapability,
  retrieveStripeRecipientAccount,
} from "@/lib/stripe/connect-account";
import { isStripeRecipientReady } from "@/lib/stripe/connect-readiness";
import { executeReservedPayout } from "@/lib/stripe/execute-payout";
import { createAdminClient } from "@/lib/supabase/admin";

type ReservedPayout = {
  payout_id: string;
  amount_minor: number;
  currency: string;
  risk_reserve_minor: number;
  payout_delay_days: number;
};

export async function POST(request: Request) {
  let reserved: ReservedPayout | null = null;

  try {
    const { user } = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const rateLimitResponse = await applyRateLimit(payoutRateLimit, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const admin = createAdminClient();
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

    const account = await retrieveStripeRecipientAccount(
      profile.stripe_account_id,
    );
    if (!isStripeRecipientReady(account)) {
      return NextResponse.json(
        {
          error:
            "Votre compte Stripe ne peut pas encore recevoir de transferts. Complétez la vérification d'identité.",
        },
        { status: 400 },
      );
    }

    if (getStripePayoutCapability(account)?.status !== "active") {
      return NextResponse.json(
        {
          error:
            "Les virements bancaires ne sont pas encore activés sur votre compte Stripe.",
        },
        { status: 400 },
      );
    }

    const { data, error } = await admin.rpc("reserve_seller_payout", {
      p_seller_id: user.id,
    });

    if (error) {
      if (error.message.includes("PAYOUT_BLOCKED_BY_SELLER_DEBT")) {
        return NextResponse.json(
          {
            error:
              "Les retraits sont temporairement bloqués car votre solde présente une dette liée à un remboursement ou un litige.",
          },
          { status: 409 },
        );
      }
      if (error.message.includes("PAYOUT_BELOW_MINIMUM")) {
        return NextResponse.json(
          {
            error:
              "Le solde éligible n'atteint pas encore le minimum de retrait après délai et réserve de sécurité.",
          },
          { status: 400 },
        );
      }
      throw error;
    }

    reserved = (data?.[0] as ReservedPayout | undefined) ?? null;
    if (!reserved) {
      throw new Error("La réservation du virement n'a retourné aucun résultat");
    }

    const payout = await executeReservedPayout(reserved.payout_id);

    return NextResponse.json({
      success: true,
      payout_id: reserved.payout_id,
      payout_amount: reserved.amount_minor / 100,
      stripe_payout_id: payout.id,
      status: payout.status,
      risk_reserve: reserved.risk_reserve_minor / 100,
      payout_delay_days: reserved.payout_delay_days,
    });
  } catch (cause) {
    Sentry.captureException(cause, {
      tags: { component: "stripe-payout" },
      extra: { payout_id: reserved?.payout_id },
    });

    if (isAmbiguousStripeFailure(cause) && reserved) {
      return NextResponse.json(
        {
          error:
            "Le virement est enregistré et sera automatiquement réconcilié. Ne relancez pas la demande.",
          payout_id: reserved.payout_id,
          status: "pending",
        },
        { status: 503 },
      );
    }

    if (isStripeError(cause)) {
      return NextResponse.json(
        { error: cause.message ?? "Erreur Stripe lors du virement" },
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
  cause: unknown,
): cause is { type: string; code?: string; message: string } {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "type" in cause &&
    typeof (cause as { type?: unknown }).type === "string"
  );
}

function isAmbiguousStripeFailure(cause: unknown): boolean {
  if (!isStripeError(cause)) return false;
  return [
    "StripeConnectionError",
    "StripeAPIError",
    "StripeRateLimitError",
  ].includes(cause.type);
}
