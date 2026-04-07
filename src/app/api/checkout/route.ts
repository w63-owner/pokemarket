import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { checkoutSchema } from "@/lib/validations";
import { calcPriceSeller, calcFeeAmount, calcTotalBuyer } from "@/lib/pricing";
import { LIMITS } from "@/lib/constants";
import { checkoutRateLimit, applyRateLimit } from "@/lib/rate-limit";
import type { CheckoutResponse } from "@/types/api";

const MOCK_SHIPPING_COST = 4.99;

async function getShippingCost(
  _originCountry: string,
  destCountry: string,
  weightClass: string,
): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("shipping_matrix")
    .select("price")
    .eq("dest_country", destCountry)
    .eq("weight_class", weightClass)
    .limit(1)
    .maybeSingle();

  return data?.price ?? MOCK_SHIPPING_COST;
}

export async function POST(request: Request) {
  try {
    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "32ea25",
      },
      body: JSON.stringify({
        sessionId: "32ea25",
        location: "checkout/route.ts:POST:entry",
        message: "Checkout POST started",
        data: {},
        timestamp: Date.now(),
        hypothesisId: "ALL",
      }),
    }).catch(() => {});
    // #endregion

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    let rateLimitResponse: Response | null = null;
    try {
      rateLimitResponse = await applyRateLimit(checkoutRateLimit, user.id);
    } catch (rlErr) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "32ea25",
          },
          body: JSON.stringify({
            sessionId: "32ea25",
            location: "checkout/route.ts:rateLimit",
            message: "Rate limiter threw",
            data: { error: String(rlErr) },
            timestamp: Date.now(),
            hypothesisId: "H4",
          }),
        },
      ).catch(() => {});
      // #endregion
      console.warn("Rate limiter unavailable, failing open:", rlErr);
    }
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const {
      listing_id,
      shipping_country,
      shipping_address_line,
      shipping_address_city,
      shipping_address_postcode,
    } = validation.data;

    const admin = createAdminClient();

    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("*")
      .eq("id", listing_id)
      .single();

    if (listingError || !listing) {
      return NextResponse.json(
        { error: "Annonce introuvable" },
        { status: 404 },
      );
    }

    if (listing.seller_id === user.id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas acheter votre propre annonce" },
        { status: 400 },
      );
    }

    const isReservedForMe =
      (listing.status === "RESERVED" || listing.status === "LOCKED") &&
      listing.reserved_for === user.id;
    const isActive = listing.status === "ACTIVE";

    if (!isActive && !isReservedForMe) {
      return NextResponse.json(
        { error: "Cette annonce n'est plus disponible à l'achat" },
        { status: 400 },
      );
    }

    const effectiveDisplayPrice =
      (isReservedForMe
        ? (listing.reserved_price ?? listing.display_price)
        : listing.display_price) ?? 0;

    if (listing.status === "LOCKED") {
      await admin
        .from("transactions")
        .update({ status: "EXPIRED" })
        .eq("listing_id", listing_id)
        .eq("buyer_id", user.id)
        .eq("status", "PENDING_PAYMENT");
    }

    const shippingCost = await getShippingCost(
      "FR",
      shipping_country,
      listing.delivery_weight_class ?? "standard",
    );

    const priceSeller = calcPriceSeller(effectiveDisplayPrice);
    const feeAmount = calcFeeAmount(effectiveDisplayPrice, priceSeller);
    const totalAmount = calcTotalBuyer(effectiveDisplayPrice, shippingCost);

    if (listing.status !== "LOCKED") {
      const { error: lockError } = await admin
        .from("listings")
        .update({ status: "LOCKED" })
        .eq("id", listing_id)
        .in("status", isReservedForMe ? ["RESERVED"] : ["ACTIVE"]);

      if (lockError) {
        return NextResponse.json(
          { error: "Impossible de verrouiller l'annonce" },
          { status: 500 },
        );
      }
    }

    const expirationDate = new Date(
      Date.now() + LIMITS.CHECKOUT_LOCK_MINUTES * 60 * 1000,
    ).toISOString();

    let txResult;
    try {
      txResult = await admin
        .from("transactions")
        .insert({
          listing_id,
          buyer_id: user.id,
          seller_id: listing.seller_id,
          total_amount: totalAmount,
          fee_amount: feeAmount,
          shipping_cost: shippingCost,
          status: "PENDING_PAYMENT",
          expiration_date: expirationDate,
          listing_title: listing.title,
          shipping_address_line,
          shipping_address_city,
          shipping_address_postcode,
          shipping_country,
        })
        .select("id")
        .single();
    } catch (txInsertErr) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "32ea25",
          },
          body: JSON.stringify({
            sessionId: "32ea25",
            location: "checkout/route.ts:txInsert",
            message: "Transaction insert threw",
            data: { error: String(txInsertErr) },
            timestamp: Date.now(),
            hypothesisId: "H3",
          }),
        },
      ).catch(() => {});
      // #endregion
      throw txInsertErr;
    }
    const { data: transaction, error: txError } = txResult;

    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "32ea25",
      },
      body: JSON.stringify({
        sessionId: "32ea25",
        location: "checkout/route.ts:txResult",
        message: "Transaction insert result",
        data: {
          transactionId: transaction?.id,
          txError: txError?.message,
          txErrorCode: txError?.code,
        },
        timestamp: Date.now(),
        hypothesisId: "H3",
      }),
    }).catch(() => {});
    // #endregion

    if (txError || !transaction) {
      const rollbackStatus = isReservedForMe ? "RESERVED" : "ACTIVE";
      await admin
        .from("listings")
        .update({ status: rollbackStatus })
        .eq("id", listing_id);

      return NextResponse.json(
        { error: "Impossible de créer la transaction" },
        { status: 500 },
      );
    }

    const { data: buyerProfile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ??
      "http://localhost:3000";

    const stripeCustomerProps = buyerProfile?.stripe_customer_id
      ? {
          customer: buyerProfile.stripe_customer_id,
          customer_update: { address: "auto" as const, name: "auto" as const },
        }
      : { customer_email: user.email };

    const stripeExpiresAt =
      Math.floor(Date.now() / 1000) + LIMITS.CHECKOUT_LOCK_MINUTES * 60;

    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "32ea25",
      },
      body: JSON.stringify({
        sessionId: "32ea25",
        location: "checkout/route.ts:beforeStripe",
        message: "About to create Stripe session",
        data: {
          stripeCustomerProps,
          appUrl,
          effectiveDisplayPrice,
          shippingCost,
          unitAmountCard: Math.round(effectiveDisplayPrice * 100),
          unitAmountShipping: Math.round(shippingCost * 100),
          expiresAt: stripeExpiresAt,
          transactionId: transaction.id,
          listingId: listing_id,
          listingTitle: listing.title,
          coverImageUrl: listing.cover_image_url,
        },
        timestamp: Date.now(),
        hypothesisId: "H1_H2",
      }),
    }).catch(() => {});
    // #endregion

    const stripe = getStripe();
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...stripeCustomerProps,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: listing.title,
                images: listing.cover_image_url
                  ? [listing.cover_image_url]
                  : undefined,
              },
              unit_amount: Math.round(effectiveDisplayPrice * 100),
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: "eur",
              product_data: { name: "Frais de livraison" },
              unit_amount: Math.round(shippingCost * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          transaction_id: transaction.id,
          listing_id,
        },
        success_url: `${appUrl}/orders/${transaction.id}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/listing/${listing_id}?checkout=cancelled`,
        expires_at: stripeExpiresAt,
      });
    } catch (stripeErr: unknown) {
      // #region agent log
      const sErrData: Record<string, unknown> = { error: String(stripeErr) };
      if (stripeErr && typeof stripeErr === "object") {
        const se = stripeErr as Record<string, unknown>;
        sErrData.type = se.type;
        sErrData.code = se.code;
        sErrData.statusCode = se.statusCode;
        sErrData.message = se.message;
        sErrData.param = se.param;
      }
      fetch(
        "http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "32ea25",
          },
          body: JSON.stringify({
            sessionId: "32ea25",
            location: "checkout/route.ts:stripeCreate",
            message: "Stripe session create threw",
            data: sErrData,
            timestamp: Date.now(),
            hypothesisId: "H1_H2",
          }),
        },
      ).catch(() => {});
      // #endregion
      throw stripeErr;
    }

    await admin
      .from("transactions")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", transaction.id);

    const response: CheckoutResponse = {
      url: session.url!,
      transaction_id: transaction.id,
    };

    return NextResponse.json(response);
  } catch (err) {
    // #region agent log
    const errData: Record<string, unknown> = {
      error: String(err),
      stack: (err as Error)?.stack,
    };
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      errData.type = e.type;
      errData.code = e.code;
      errData.statusCode = e.statusCode;
      errData.message = e.message;
      errData.param = e.param;
      errData.name = e.name;
    }
    fetch("http://127.0.0.1:7638/ingest/38e16e0f-1e33-457e-a7b0-2a438c776c6a", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "32ea25",
      },
      body: JSON.stringify({
        sessionId: "32ea25",
        location: "checkout/route.ts:catch",
        message: "Unhandled checkout error",
        data: errData,
        timestamp: Date.now(),
        hypothesisId: "ALL",
      }),
    }).catch(() => {});
    // #endregion
    Sentry.captureException(err);
    console.error("Checkout error:", err);
    // #region agent log — temporary: surface real error in production for debugging
    const debugMsg = err instanceof Error ? err.message : String(err);
    const debugCode =
      (err as Record<string, unknown>)?.code ??
      (err as Record<string, unknown>)?.type ??
      "";
    return NextResponse.json(
      {
        error: "Erreur serveur inattendue",
        _debug: { message: debugMsg, code: debugCode },
      },
      { status: 500 },
    );
    // #endregion
  }
}
