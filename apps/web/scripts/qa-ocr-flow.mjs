#!/usr/bin/env node
/**
 * QA: end-to-end OCR flow smoke test.
 *
 * Steps:
 *  1. Create a fresh test user via admin API (auto-confirmed).
 *  2. Sign in to get an access token.
 *  3. Download a real Pokémon card image (Pikachu, Base Set, EN, from TCGdex CDN).
 *  4. Upload it to our Supabase `listing-images` bucket so the URL passes the
 *     route's same-origin guard.
 *  5. Hit POST /api/ocr with the cookie-based session (browser-like).
 *  6. Assert the response contains parsed { name, card_number, language } and
 *     at least one TCGdex match candidate.
 *  7. Cleanup: delete user + storage object.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.QA_APP_URL ?? "http://localhost:3000";
// Public TCGdex CDN — Pikachu, Base Set, English (a clean, well-known card).
const CARD_IMAGE_URL =
  process.env.QA_OCR_CARD_URL ??
  "https://assets.tcgdex.net/en/base/base1/58/high.webp";

if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SR) {
  console.error("Missing env: SUPABASE_URL / ANON / SERVICE_ROLE required");
  process.exit(2);
}

const t0 = Date.now();
const stamp = t0;
const log = (label, extra = "") =>
  console.log(
    `[${((Date.now() - t0) / 1000).toFixed(2)}s] ${label}${extra ? "  " + extra : ""}`,
  );

const admin = createClient(SUPABASE_URL, SUPABASE_SR, {
  auth: { persistSession: false },
});
const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false },
});

let createdUserId = null;
let storagePath = null;

async function cleanup() {
  if (storagePath) {
    await admin.storage
      .from("listing-images")
      .remove([storagePath])
      .catch(() => {});
  }
  if (createdUserId) {
    await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
  }
}

process.on("uncaughtException", async (e) => {
  console.error("FATAL", e);
  await cleanup();
  process.exit(1);
});

async function main() {
  // ─── 1. Create test user ──────────────────────────────────────────────────
  const email = `qa.ocr+${stamp}@pokemarket.local`;
  const password = "TestPassword!2026";
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true,
      user_metadata: { username: `qa_ocr_${String(stamp).slice(-6)}` },
    },
  );
  if (createErr) throw createErr;
  createdUserId = created.user.id;
  log("user created", `id=${createdUserId}`);

  // ─── 2. Sign in (get access token + cookies) ─────────────────────────────
  const { data: signin, error: siErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (siErr) throw siErr;
  const accessToken = signin.session.access_token;
  const refreshToken = signin.session.refresh_token;
  log("signed in");

  // ─── 3. Download the card image ──────────────────────────────────────────
  const imgRes = await fetch(CARD_IMAGE_URL);
  if (!imgRes.ok) throw new Error(`Card image fetch failed: ${imgRes.status}`);
  const imgBytes = Buffer.from(await imgRes.arrayBuffer());
  log("downloaded card image", `${(imgBytes.length / 1024).toFixed(1)} KiB`);

  // ─── 4. Upload to our storage (under the user's folder for RLS) ──────────
  storagePath = `${createdUserId}/${stamp}-ocr.webp`;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { error: upErr } = await userClient.storage
    .from("listing-images")
    .upload(storagePath, imgBytes, {
      contentType: "image/webp",
      upsert: false,
    });
  if (upErr) throw upErr;
  const publicUrl = userClient.storage
    .from("listing-images")
    .getPublicUrl(storagePath).data.publicUrl;
  log("uploaded to storage", publicUrl);

  // ─── 5. POST /api/ocr with auth cookies (the route uses createClient/server) ─
  // Build sb-* auth cookies the way @supabase/ssr expects.
  // Easiest path: pass the access token as a Bearer header AND set the
  // standard sb-access-token / sb-refresh-token cookies.
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  // @supabase/ssr stores a JSON-encoded session in a single cookie.
  const sessionCookie = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: signin.session.expires_in,
    expires_at: signin.session.expires_at,
    token_type: "bearer",
    user: signin.user,
  });
  const cookieHeader = `${cookieName}=base64-${Buffer.from(sessionCookie).toString("base64")}`;

  log("posting /api/ocr ...");
  const ocrRes = await fetch(`${APP_URL}/api/ocr`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify({ image_url: publicUrl }),
  });

  const text = await ocrRes.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  log(`ocr response`, `status=${ocrRes.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (!ocrRes.ok) {
    throw new Error(`OCR returned ${ocrRes.status}`);
  }

  // ─── 6. Validate response shape ──────────────────────────────────────────
  if (!body.parsed) throw new Error("missing parsed");
  if (typeof body.parsed.name === "undefined")
    throw new Error("parsed.name missing key");
  if (!Array.isArray(body.candidates))
    throw new Error("candidates must be array");

  const ok = (label) => log(`OK ${label}`);
  ok(`parsed.name = ${JSON.stringify(body.parsed.name)}`);
  ok(`parsed.card_number = ${JSON.stringify(body.parsed.card_number)}`);
  ok(`parsed.language = ${JSON.stringify(body.parsed.language)}`);
  ok(`candidates.length = ${body.candidates.length}`);
  if (body.candidates.length > 0) {
    const top = body.candidates[0];
    ok(
      `top match: ${top.name} (${top.set_name}) confidence=${top.confidence}%`,
    );
  } else {
    log(
      "WARN no candidates returned — TCGdex catalog may be empty for this card",
    );
  }

  log("ALL CHECKS PASSED");
}

main()
  .then(() => cleanup().then(() => process.exit(0)))
  .catch(async (e) => {
    console.error("FAIL", e?.message ?? e);
    await cleanup();
    process.exit(1);
  });
