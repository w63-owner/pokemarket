import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { getStripe } from "@/lib/stripe/server";
import {
  reconcileCheckoutSession,
  reconcilePaymentIntent,
} from "@/lib/stripe/reconcile";

async function expirePendingCheckout(tx: {
  id: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
}): Promise<"PENDING_PAYMENT" | "PAID" | "ALREADY_PROCESSED"> {
  let reconciled: "PENDING_PAYMENT" | "PAID" | "ALREADY_PROCESSED" =
    "PENDING_PAYMENT";

  if (tx.stripe_checkout_session_id) {
    reconciled = await reconcileCheckoutSession(
      tx.id,
      tx.stripe_checkout_session_id,
    );
  } else if (tx.stripe_payment_intent_id) {
    reconciled = await reconcilePaymentIntent(
      tx.id,
      tx.stripe_payment_intent_id,
    );
  }

  if (reconciled === "PAID" || reconciled === "ALREADY_PROCESSED") {
    return reconciled;
  }

  const stripe = getStripe();

  if (tx.stripe_checkout_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        tx.stripe_checkout_session_id,
      );
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(session.id);
      }
    } catch (err) {
      Sentry.captureException(err, {
        extra: {
          context: "cancel_offer_expire_checkout_session",
          transaction_id: tx.id,
        },
      });
    }
  }

  if (tx.stripe_payment_intent_id) {
    try {
      const intent = await stripe.paymentIntents.retrieve(
        tx.stripe_payment_intent_id,
      );
      if (intent.status !== "canceled" && intent.status !== "succeeded") {
        await stripe.paymentIntents.cancel(intent.id);
      }
    } catch (err) {
      Sentry.captureException(err, {
        extra: {
          context: "cancel_offer_cancel_payment_intent",
          transaction_id: tx.id,
        },
      });
    }
  }

  return "PENDING_PAYMENT";
}

export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { offer_id, conversation_id } = body as {
      offer_id?: string;
      conversation_id?: string;
    };

    if (!offer_id || !conversation_id) {
      return NextResponse.json(
        { error: "offer_id et conversation_id requis" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: offer, error: fetchError } = await admin
      .from("offers")
      .select("*")
      .eq("id", offer_id)
      .single();

    if (fetchError || !offer) {
      return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
    }

    if (offer.buyer_id !== user.id) {
      return NextResponse.json(
        { error: "Seul l'acheteur peut annuler son offre" },
        { status: 403 },
      );
    }

    if (offer.conversation_id !== conversation_id) {
      return NextResponse.json(
        { error: "La conversation ne correspond pas à cette offre" },
        { status: 400 },
      );
    }

    const { data: listing, error: listingFetchError } = await admin
      .from("listings")
      .select("seller_id, status, reserved_for")
      .eq("id", offer.listing_id)
      .maybeSingle();
    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .select("id")
      .eq("id", conversation_id)
      .eq("listing_id", offer.listing_id)
      .eq("buyer_id", offer.buyer_id)
      .eq("seller_id", listing?.seller_id ?? "")
      .maybeSingle();

    if (listingFetchError || !listing || conversationError || !conversation) {
      return NextResponse.json(
        { error: "La conversation ne correspond pas à cette offre" },
        { status: 400 },
      );
    }

    if (offer.status !== "PENDING" && offer.status !== "ACCEPTED") {
      return NextResponse.json(
        { error: "Cette offre ne peut plus être annulée" },
        { status: 400 },
      );
    }

    const wasAccepted = offer.status === "ACCEPTED";

    // An accepted offer that already produced a paid order cannot be cancelled.
    if (wasAccepted && listing.status === "SOLD") {
      return NextResponse.json(
        { error: "Cette offre ne peut plus être annulée" },
        { status: 400 },
      );
    }

    let pendingTx: {
      id: string;
      stripe_checkout_session_id: string | null;
      stripe_payment_intent_id: string | null;
    } | null = null;

    // Critical: never release a LOCKED listing while a payable Stripe object
    // still exists. That would let another buyer check out the same card while
    // the original checkout session remains completable (double-sale).
    if (wasAccepted) {
      const { data: openTx, error: pendingTxError } = await admin
        .from("transactions")
        .select(
          "id, stripe_checkout_session_id, stripe_payment_intent_id, status",
        )
        .eq("listing_id", offer.listing_id)
        .eq("buyer_id", user.id)
        .in("status", ["PENDING_PAYMENT", "PAID"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingTxError) throw pendingTxError;

      if (openTx?.status === "PAID") {
        return NextResponse.json(
          { error: "Le paiement a déjà été effectué pour cet article" },
          { status: 409 },
        );
      }

      if (openTx?.status === "PENDING_PAYMENT") {
        pendingTx = openTx;
        const reconciled = await expirePendingCheckout(openTx);
        if (reconciled === "PAID" || reconciled === "ALREADY_PROCESSED") {
          return NextResponse.json(
            { error: "Le paiement a déjà été effectué pour cet article" },
            { status: 409 },
          );
        }

        const { data: cancelledTx, error: cancelTxError } = await admin
          .from("transactions")
          .update({ status: "CANCELLED" })
          .eq("id", openTx.id)
          .eq("status", "PENDING_PAYMENT")
          .select("id");

        if (cancelTxError) throw cancelTxError;
        if (!cancelledTx || cancelledTx.length === 0) {
          return NextResponse.json(
            { error: "Le paiement a déjà été effectué pour cet article" },
            { status: 409 },
          );
        }
      }
    }

    // Atomic guard: only the first concurrent caller wins. Others get 0 rows
    // back and bail out with 400 (otherwise we'd insert duplicate
    // "Offre annulée" system messages on double-click).
    const { data: updated, error: updateError } = await admin
      .from("offers")
      .update({ status: "CANCELLED" })
      .eq("id", offer_id)
      .in("status", ["PENDING", "ACCEPTED"])
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "Cette offre ne peut plus être annulée" },
        { status: 400 },
      );
    }

    if (wasAccepted) {
      const { error: listingError } = await admin
        .from("listings")
        .update({
          status: "ACTIVE",
          reserved_for: null,
          reserved_price: null,
        })
        .eq("id", offer.listing_id)
        .eq("reserved_for", user.id)
        .in("status", ["RESERVED", "LOCKED"]);

      if (listingError) throw listingError;
    }

    const { error: msgError } = await admin.from("messages").insert({
      conversation_id,
      sender_id: user.id,
      content: "Offre annulée",
      message_type: "offer_cancelled",
      offer_id,
    });

    if (msgError) throw msgError;

    return NextResponse.json({
      success: true,
      checkout_cancelled: Boolean(pendingTx),
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("Cancel offer error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
