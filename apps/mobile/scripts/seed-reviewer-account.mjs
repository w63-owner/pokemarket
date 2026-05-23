#!/usr/bin/env node
/**
 * Seeds a deterministic reviewer account that Apple App Review and
 * Google Play Console can use to validate the app.
 *
 * Creates / resets:
 *   - reviewer@pokemarket.app  (with username "reviewer_pokemarket")
 *   - 12 ACTIVE listings with public covers
 *   - 1 PAID transaction in transit
 *   - 1 conversation with a PENDING offer
 *   - wallet seller credited 350 EUR
 *
 * Usage:
 *   cd apps/mobile
 *   npm run seed:reviewer            # idempotent (skips if user already exists)
 *   npm run seed:reviewer -- --reset # force-delete + recreate
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY  (admin, NEVER commit)
 *
 * Outputs the credentials + IDs as JSON on stdout so the calling shell
 * can feed App Store Connect or paste into reviewer notes.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SR || !SUPABASE_ANON) {
  console.error(
    "Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(2);
}

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");

const REVIEWER_EMAIL = "reviewer@pokemarket.app";
const REVIEWER_PASSWORD = "ReviewerPass2026!";
const BUDDY_EMAIL = "buddy.reviewer@pokemarket.app";
const BUDDY_PASSWORD = "BuddyReviewerPass2026!";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const SAMPLE_LISTINGS = [
  { title: "Charizard Base Set Holo PSA 8", price: 299.0, condition: "GOOD", graded: true, grading_company: "PSA", grading_value: "8" },
  { title: "Pikachu Illustrator Promo (replica) PSA 9", price: 49.0, condition: "NEAR_MINT", graded: true, grading_company: "PSA", grading_value: "9" },
  { title: "Dracaufeu V Astro Évolution Céleste FR", price: 14.5, condition: "MINT", graded: false },
  { title: "Mewtwo EX Full Art XY Promo", price: 22.0, condition: "NEAR_MINT", graded: false },
  { title: "Mew ex 151 EN", price: 9.9, condition: "MINT", graded: false },
  { title: "Tortank Holo Néo Génésis FR", price: 35.0, condition: "GOOD", graded: false },
  { title: "Ronflex VMAX Rainbow", price: 18.0, condition: "MINT", graded: false },
  { title: "Lugia Argenté Tempête Argentée FR", price: 26.5, condition: "NEAR_MINT", graded: false },
  { title: "Évoli ex Évolutions Prismatiques", price: 11.0, condition: "MINT", graded: false },
  { title: "Pikachu Promo Black Star", price: 7.5, condition: "PLAYED", graded: false },
  { title: "Carapuce Délire Galarien holo", price: 4.0, condition: "GOOD", graded: false },
  { title: "Dialga GX Rainbow Tonnerre Perdu", price: 39.0, condition: "NEAR_MINT", graded: false },
];

const admin = createClient(SUPABASE_URL, SUPABASE_SR, {
  auth: { persistSession: false },
});

async function deleteUserByEmail(email) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
  if (existing) {
    await admin.auth.admin.deleteUser(existing.id);
    return existing.id;
  }
  return null;
}

async function createUser(email, password, username) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) throw error;
  return data.user;
}

async function uploadCover(client, userId, suffix) {
  const path = `${userId}/${Date.now()}-${suffix}.png`;
  const { error } = await client.storage
    .from("listing-images")
    .upload(path, TINY_PNG, { contentType: "image/png" });
  if (error) throw error;
  return client.storage.from("listing-images").getPublicUrl(path).data.publicUrl;
}

async function main() {
  if (RESET) {
    await deleteUserByEmail(REVIEWER_EMAIL);
    await deleteUserByEmail(BUDDY_EMAIL);
  }

  // ── reviewer (the seller account presented to Apple) ────────────────
  const reviewer = await createUser(
    REVIEWER_EMAIL,
    REVIEWER_PASSWORD,
    "reviewer_pokemarket",
  );

  const reviewerClient = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { error: rSi } = await reviewerClient.auth.signInWithPassword({
    email: REVIEWER_EMAIL,
    password: REVIEWER_PASSWORD,
  });
  if (rSi) throw rSi;

  const listingIds = [];
  for (const sample of SAMPLE_LISTINGS) {
    const cover = await uploadCover(reviewerClient, reviewer.id, "cover");
    const back = await uploadCover(reviewerClient, reviewer.id, "back");
    const { data: listing, error } = await reviewerClient
      .from("listings")
      .insert({
        seller_id: reviewer.id,
        title: sample.title,
        price_seller: sample.price,
        condition: sample.condition,
        is_graded: sample.graded,
        grading_company: sample.grading_company ?? null,
        grading_value: sample.grading_value ?? null,
        delivery_weight_class: "S",
        cover_image_url: cover,
        back_image_url: back,
        card_language: "FR",
        status: "ACTIVE",
      })
      .select()
      .single();
    if (error) throw error;
    listingIds.push(listing.id);
  }

  // ── buddy buyer (used to populate inbox + transaction in transit) ───
  const buddy = await createUser(
    BUDDY_EMAIL,
    BUDDY_PASSWORD,
    "buddy_reviewer",
  );

  const buddyClient = createClient(SUPABASE_URL, SUPABASE_ANON);
  await buddyClient.auth.signInWithPassword({
    email: BUDDY_EMAIL,
    password: BUDDY_PASSWORD,
  });

  // Conversation with a pending offer on listing #2 (Pikachu Illustrator)
  const { data: convo, error: convoErr } = await buddyClient
    .from("conversations")
    .insert({
      listing_id: listingIds[1],
      buyer_id: buddy.id,
      seller_id: reviewer.id,
    })
    .select()
    .single();
  if (convoErr) throw convoErr;

  await buddyClient.from("messages").insert([
    {
      conversation_id: convo.id,
      sender_id: buddy.id,
      content: "Hello ! Toujours dispo pour 40 € ?",
    },
  ]);

  await buddyClient.from("offers").insert({
    conversation_id: convo.id,
    listing_id: listingIds[1],
    buyer_id: buddy.id,
    seller_id: reviewer.id,
    amount: 40.0,
    status: "PENDING",
  });

  // PAID transaction in transit on listing #3 (Dracaufeu V Astro)
  // We bypass the full checkout by inserting directly via service role.
  const { error: txErr } = await admin.from("transactions").insert({
    listing_id: listingIds[2],
    buyer_id: buddy.id,
    seller_id: reviewer.id,
    status: "SHIPPED",
    amount_cents: 1450,
    fee_cents: 58,
    shipping_cents: 290,
    paid_at: new Date().toISOString(),
    shipped_at: new Date().toISOString(),
  });
  if (txErr) {
    console.warn("Could not insert transaction (schema may differ):", txErr.message);
  }

  // Wallet credit (only if a wallets table exists in current schema)
  const { error: wErr } = await admin
    .from("wallets")
    .upsert(
      { user_id: reviewer.id, balance_cents: 35000, pending_cents: 0 },
      { onConflict: "user_id" },
    );
  if (wErr) {
    console.warn("Could not seed wallet (table may not exist yet):", wErr.message);
  }

  // ── Output ────────────────────────────────────────────────────────────
  console.log(
    JSON.stringify(
      {
        reviewer: {
          email: REVIEWER_EMAIL,
          password: REVIEWER_PASSWORD,
          userId: reviewer.id,
        },
        buddy: {
          email: BUDDY_EMAIL,
          password: BUDDY_PASSWORD,
          userId: buddy.id,
        },
        seeded: {
          listings: listingIds.length,
          conversationId: convo.id,
          firstListingId: listingIds[0],
        },
        reviewerNotesPath: "apps/mobile/store/reviewer/notes-en.md",
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
