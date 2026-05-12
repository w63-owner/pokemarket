/**
 * Centralised env-var accessors.
 *
 * Goals :
 *   - One single fallback path for `NEXT_PUBLIC_APP_URL`, instead of 8 copies
 *     scattered across the codebase that all defaulted to a different domain.
 *   - Fail-fast in production : if a critical env var is missing the boot
 *     should crash explicitly instead of silently sending users to a phantom
 *     domain (e.g. payment success_url=http://localhost:3000/... in prod).
 *   - Centralise MangoPay credentials so every caller goes through the same
 *     validation and we can add typing / Zod / metrics in one place.
 */

const isProd = process.env.NODE_ENV === "production";

/**
 * Returns the canonical, trailing-slash-free public URL of the app.
 *
 * - Reads `NEXT_PUBLIC_APP_URL`.
 * - In production, throws if the variable is missing — we never want to
 *   serve a payment success URL or an SEO sitemap pointing at localhost.
 * - In dev/test/preview, falls back to `http://localhost:3000` so local
 *   workflows and unit tests don't need to set the var explicitly.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw || raw.trim() === "") {
    if (isProd) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL must be set in production " +
          "(used for MangoPay redirects, sitemap/robots, transactional emails, cron callbacks).",
      );
    }
    return "http://localhost:3000";
  }
  return raw.trim().replace(/\/$/, "");
}

export type MangoPayConfig = {
  clientId: string;
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
  platformUserId: string;
  platformWalletId: string;
  publicClientId: string;
};

/**
 * Returns the MangoPay configuration. Throws in production if any required
 * variable is missing — payments are too sensitive to silently fall back.
 *
 * Fields:
 *   - `clientId` / `apiKey`     : OAuth credentials (server-only)
 *   - `baseUrl`                 : sandbox vs prod API endpoint
 *   - `webhookSecret`           : HMAC SHA-256 secret for inbound webhooks
 *   - `platformUserId/WalletId` : the marketplace's own NaturalUser + Wallet
 *                                 (created once during onboarding, where all
 *                                 PayIn funds land before being transferred)
 *   - `publicClientId`          : same as `clientId` but exposed to the
 *                                 browser for the CardRegistration tokenisation
 *                                 step (no secret, safe to leak)
 */
export function getMangoPayConfig(): MangoPayConfig {
  const required = {
    clientId: process.env.MANGOPAY_CLIENT_ID,
    apiKey: process.env.MANGOPAY_API_KEY,
    webhookSecret: process.env.MANGOPAY_WEBHOOK_SECRET,
    platformUserId: process.env.MANGOPAY_PLATFORM_USER_ID,
    platformWalletId: process.env.MANGOPAY_PLATFORM_WALLET_ID,
    publicClientId: process.env.NEXT_PUBLIC_MANGOPAY_CLIENT_ID,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v || v.trim() === "")
    .map(([k]) => k);

  if (missing.length > 0) {
    if (isProd) {
      throw new Error(
        `Missing MangoPay env vars in production: ${missing.join(", ")}`,
      );
    }
    // In dev / test we still return a partial config so the app can boot.
    // Routes that actually need MangoPay will throw their own clearer error.
  }

  return {
    clientId: required.clientId ?? "",
    apiKey: required.apiKey ?? "",
    baseUrl: (
      process.env.MANGOPAY_BASE_URL ?? "https://api.sandbox.mangopay.com"
    ).replace(/\/$/, ""),
    webhookSecret: required.webhookSecret ?? "",
    platformUserId: required.platformUserId ?? "",
    platformWalletId: required.platformWalletId ?? "",
    publicClientId: required.publicClientId ?? "",
  };
}
