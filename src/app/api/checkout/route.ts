import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { checkoutSchema } from "@/lib/validations";
import { calcPriceSeller, calcFeeAmount, calcTotalBuyer } from "@/lib/pricing";
import { LIMITS } from "@/lib/constants";
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

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
      listing.status === "RESERVED" && listing.reserved_for === user.id;
    const isActive = listing.status === "ACTIVE";

    if (!isActive && !isReservedForMe) {
      return NextResponse.json(
        { error: "Cette annonce n'est plus disponible à l'achat" },
        { status: 400 },
      );
    }

    const effectiveDisplayPrice = isReservedForMe
      ? (listing.reserved_price ?? listing.display_price)
      : listing.display_price;

    const shippingCost = await getShippingCost(
      "FR",
      shipping_country,
      listing.delivery_weight_class,
    );

    const priceSeller = calcPriceSeller(effectiveDisplayPrice);
    const feeAmount = calcFeeAmount(effectiveDisplayPrice, priceSeller);
    const totalAmount = calcTotalBuyer(effectiveDisplayPrice, shippingCost);

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

    const expirationDate = new Date(
      Date.now() + LIMITS.CHECKOUT_LOCK_MINUTES * 60 * 1000,
    ).toISOString();

    const { data: transaction, error: txError } = await admin
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

    if (txError || !transaction) {
      await admin
        .from("listings")
        .update({ status: isReservedForMe ? "RESERVED" : "ACTIVE" })
        .eq("id", listing_id);

      return NextResponse.json(
        { error: "Impossible de créer la transaction" },
        { status: 500 },
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ??
      "http://localhost:3000";

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
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
      expires_at:
        Math.floor(Date.now() / 1000) + LIMITS.CHECKOUT_LOCK_MINUTES * 60,
    });

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
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
