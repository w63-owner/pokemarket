#!/usr/bin/env node
/**
 * Seeds a deterministic scenario for QA-testing the buyer purchase flow:
 *
 *   1. seller account (auto-confirmed) + their wallet/profile
 *   2. one ACTIVE listing with a public cover image
 *   3. buyer account (auto-confirmed) + a default shipping address on the
 *      profile so the checkout form can be filled with one click
 *
 * Outputs the credentials + IDs as JSON so the browser test can read them.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SR || !SUPABASE_ANON) {
  console.error("Missing env");
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SR, {
  auth: { persistSession: false },
});
const _anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false },
});

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const PASSWORD = "TestPassword!2026";
const stamp = Date.now();

async function main() {
  const sellerEmail = `qa.seller+${stamp}@pokemarket.local`;
  const buyerEmail = `qa.buyer+${stamp}@pokemarket.local`;

  // ─── seller ──────────────────────────────────────────────────────────────
  const { data: sCreated, error: sCErr } = await admin.auth.admin.createUser({
    email: sellerEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: `qa_seller_${String(stamp).slice(-6)}` },
  });
  if (sCErr) throw sCErr;
  const sellerId = sCreated.user.id;

  // Sign in as seller to upload the cover image to their RLS folder.
  const sellerClient = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { error: sSiErr } = await sellerClient.auth.signInWithPassword({
    email: sellerEmail,
    password: PASSWORD,
  });
  if (sSiErr) throw sSiErr;

  const coverPath = `${sellerId}/${stamp}-cover.png`;
  const backPath = `${sellerId}/${stamp}-back.png`;
  for (const path of [coverPath, backPath]) {
    const { error } = await sellerClient.storage
      .from("listing-images")
      .upload(path, TINY_PNG, { contentType: "image/png" });
    if (error) throw error;
  }
  const coverUrl = sellerClient.storage
    .from("listing-images")
    .getPublicUrl(coverPath).data.publicUrl;
  const backUrl = sellerClient.storage
    .from("listing-images")
    .getPublicUrl(backPath).data.publicUrl;

  // Use a sensible price so we don't trip on the 999.99 EUR Stripe limit
  // for indirect (test-mode) charges.
  const { data: listing, error: lErr } = await sellerClient
    .from("listings")
    .insert({
      seller_id: sellerId,
      title: `[QA-BUYER] Pikachu — Smoke Test ${stamp}`,
      price_seller: 12.34,
      condition: "NEAR_MINT",
      is_graded: false,
      delivery_weight_class: "S",
      cover_image_url: coverUrl,
      back_image_url: backUrl,
      card_language: "FR",
      status: "ACTIVE",
    })
    .select()
    .single();
  if (lErr) throw lErr;

  // ─── buyer (with a pre-filled shipping address on the profile) ───────────
  const { data: bCreated, error: bCErr } = await admin.auth.admin.createUser({
    email: buyerEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: `qa_buyer_${String(stamp).slice(-6)}` },
  });
  if (bCErr) throw bCErr;
  const buyerId = bCreated.user.id;

  // The trigger creates a profile row — patch shipping defaults if the
  // schema has them.
  await admin
    .from("profiles")
    .update({
      shipping_address_line: "10 rue du Test",
      shipping_address_city: "Paris",
      shipping_address_postcode: "75001",
      shipping_country: "FR",
    })
    .eq("id", buyerId);

  console.log(
    JSON.stringify(
      {
        sellerEmail,
        buyerEmail,
        password: PASSWORD,
        sellerId,
        buyerId,
        listingId: listing.id,
        listingTitle: listing.title,
        listingPrice: listing.price_seller,
        displayPrice: listing.display_price,
        storage: { coverPath, backPath },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
