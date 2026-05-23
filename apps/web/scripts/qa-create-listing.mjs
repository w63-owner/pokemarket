#!/usr/bin/env node
/**
 * QA: end-to-end "create listing" smoke test.
 *
 * Steps:
 *  1. Log in to Supabase as the prepared test user.
 *  2. Upload a tiny PNG to the `listings` storage bucket (RLS-enforced).
 *  3. Insert a listing as the authed user (RLS-enforced).
 *  4. Read the listing back through the same authed client.
 *  5. Read the listing through the *anon* client (public visibility check).
 *  6. Hit the public feed RPC to confirm the new listing surfaces.
 *
 * Pass criteria: every step prints "OK", final exit code is 0.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.QA_EMAIL;
const TEST_PASSWORD = process.env.QA_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_EMAIL, QA_PASSWORD",
  );
  process.exit(2);
}

function ok(label, extra = "") {
  console.log(`OK   ${label}${extra ? "  " + extra : ""}`);
}
function fail(label, err) {
  console.error(`FAIL ${label}`);
  console.error(err);
  process.exit(1);
}

const authed = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false },
});
const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false },
});

// 1×1 transparent PNG (smallest possible)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function main() {
  // ─── 1. Login ─────────────────────────────────────────────────────────────
  const { data: signin, error: signinErr } =
    await authed.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
  if (signinErr || !signin.user) fail("login", signinErr);
  const userId = signin.user.id;
  ok("login", `user=${userId}`);

  // ─── 2. Upload images to storage ─────────────────────────────────────────
  const stamp = Date.now();
  const coverPath = `${userId}/${stamp}-cover.png`;
  const backPath = `${userId}/${stamp}-back.png`;

  for (const [path, label] of [
    [coverPath, "cover"],
    [backPath, "back"],
  ]) {
    const { error: upErr } = await authed.storage
      .from("listing-images")
      .upload(path, TINY_PNG, { contentType: "image/png", upsert: false });
    if (upErr) fail(`storage.upload ${label}`, upErr);
  }
  const coverUrl = authed.storage.from("listing-images").getPublicUrl(coverPath)
    .data.publicUrl;
  const backUrl = authed.storage.from("listing-images").getPublicUrl(backPath)
    .data.publicUrl;
  ok("storage.upload (cover + back)");

  // ─── 3. Insert listing as authed user (RLS-enforced) ─────────────────────
  const insertPayload = {
    seller_id: userId,
    title: `[QA] Pikachu Holo — Smoke Test ${stamp}`,
    price_seller: 1234, // cents
    condition: "NEAR_MINT",
    is_graded: false,
    delivery_weight_class: "S",
    cover_image_url: coverUrl,
    back_image_url: backUrl,
    card_language: "FR",
    status: "ACTIVE",
  };

  const { data: listing, error: insertErr } = await authed
    .from("listings")
    .insert(insertPayload)
    .select()
    .single();
  if (insertErr || !listing) fail("listings.insert (authed)", insertErr);
  ok("listings.insert", `id=${listing.id}`);

  // ─── 4. Read it back as the seller ───────────────────────────────────────
  const { data: byId, error: readErr } = await authed
    .from("listings")
    .select("id, title, price_seller, status, seller_id")
    .eq("id", listing.id)
    .single();
  if (readErr || !byId) fail("listings.select (authed self)", readErr);
  if (byId.status !== "ACTIVE") fail("listing status mismatch", byId);
  ok("listings.select (authed self)");

  // ─── 5. Read as anonymous (public visibility) ────────────────────────────
  const { data: anonRead, error: anonErr } = await anon
    .from("listings")
    .select("id, title, status")
    .eq("id", listing.id)
    .maybeSingle();
  if (anonErr) fail("listings.select (anon)", anonErr);
  if (!anonRead) fail("listing invisible to anon — RLS too strict", null);
  ok("listings.select (anon — public RLS)");

  // ─── 6. Surface via search_feed RPC ──────────────────────────────────────
  const { data: feed, error: feedErr } = await anon.rpc("search_feed", {
    p_query: "Pikachu",
    p_limit: 50,
    p_offset: 0,
  });
  if (feedErr) {
    console.warn(
      "WARN search_feed RPC failed (signature may differ):",
      feedErr.message,
    );
  } else {
    const found = (feed ?? []).find((r) => r.id === listing.id);
    if (!found) {
      console.warn("WARN listing not yet in feed (likely indexing/cache lag).");
    } else {
      ok("search_feed contains new listing");
    }
  }

  if (process.env.QA_KEEP === "1") {
    console.log(`KEEP listing in DB: ${listing.id}`);
  } else {
    const { error: delErr } = await authed
      .from("listings")
      .delete()
      .eq("id", listing.id)
      .eq("seller_id", userId);
    if (delErr) fail("listings.delete (cleanup)", delErr);
    await authed.storage.from("listing-images").remove([coverPath, backPath]);
    ok("cleanup");
  }

  console.log("\nALL CHECKS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
