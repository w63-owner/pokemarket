#!/usr/bin/env node
/**
 * QA: chaos tests for /api/ocr (authenticated, but malicious / malformed inputs).
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.QA_APP_URL ?? "http://localhost:3000";

const admin = createClient(SUPABASE_URL, SUPABASE_SR, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });

const stamp = Date.now();
const email = `qa.chaos+${stamp}@pokemarket.local`;
const password = "TestPassword!2026";
let userId = null;

async function cleanup() {
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

try {
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `qa_chaos_${String(stamp).slice(-6)}` },
  });
  if (cErr) throw cErr;
  userId = created.user.id;

  const { data: si, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;

  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const sessionCookie = JSON.stringify({
    access_token: si.session.access_token,
    refresh_token: si.session.refresh_token,
    expires_in: si.session.expires_in,
    expires_at: si.session.expires_at,
    token_type: "bearer",
    user: si.user,
  });
  const cookie = `${cookieName}=base64-${Buffer.from(sessionCookie).toString("base64")}`;

  async function call(label, body, expect) {
    const r = await fetch(`${APP_URL}/api/ocr`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    const ok = r.status === expect;
    console.log(`${ok ? "OK  " : "FAIL"} [${label}] expected ${expect} got ${r.status}  body=${txt.slice(0, 120)}`);
    return ok;
  }

  const results = await Promise.all([
    call("external URL", { image_url: "https://evil.example.com/x.png" }, 400),
    call("missing image_url", { foo: "bar" }, 400),
    call("non-string image_url", { image_url: 123 }, 400),
    call("legit-looking but wrong host", { image_url: "https://qevmnveyjdovupyveoqc.evil.com/x.png" }, 400),
    call("empty body", {}, 400),
  ]);

  if (results.every(Boolean)) {
    console.log("\nALL CHAOS CHECKS PASSED");
    process.exit(0);
  } else {
    console.error("\nSOME CHAOS CHECKS FAILED");
    process.exit(1);
  }
} catch (e) {
  console.error("FATAL", e?.message ?? e);
  process.exit(1);
} finally {
  await cleanup();
}
