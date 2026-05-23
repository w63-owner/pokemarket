import { NextResponse } from "next/server";

export const runtime = "edge";
export const revalidate = 3600;

const PACKAGE_NAME =
  process.env.ANDROID_APP_PACKAGE_NAME ?? "app.pokemarket.mobile";
// Comma-separated SHA-256 fingerprints of the Android app signing certificate
// (release keystore, EAS managed key, AND any test keystores you want to
// link). Get them via `eas credentials --platform android` or
// `keytool -list -v -keystore <file>`. Format: "AA:BB:CC:..."
const FINGERPRINTS = (process.env.ANDROID_APP_SHA256_FINGERPRINTS ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);

const payload = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: PACKAGE_NAME,
      sha256_cert_fingerprints: FINGERPRINTS,
    },
  },
];

export async function GET() {
  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
