/**
 * Centralised env-var accessors.
 *
 * Goals :
 *   - One single fallback path for `NEXT_PUBLIC_APP_URL`, instead of 8 copies
 *     scattered across the codebase that all defaulted to a different domain
 *     (`pokemarket.fr`, `pokemarket.app`, `localhost:3000`).
 *   - Fail-fast in production : if a critical env var is missing the boot
 *     should crash explicitly instead of silently sending users to a phantom
 *     domain (e.g. Stripe `success_url=http://localhost:3000/...` in prod).
 */

const isProd = process.env.NODE_ENV === "production";

/**
 * Returns the canonical, trailing-slash-free public URL of the app.
 *
 * - Reads `NEXT_PUBLIC_APP_URL`.
 * - In production, throws if the variable is missing — we never want to
 *   serve a Stripe success URL or an SEO sitemap pointing at localhost.
 * - In dev/test/preview, falls back to `http://localhost:3000` so local
 *   workflows and unit tests don't need to set the var explicitly.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw || raw.trim() === "") {
    if (isProd) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL must be set in production " +
          "(used for Stripe redirects, sitemap/robots, transactional emails, cron callbacks).",
      );
    }
    return "http://localhost:3000";
  }
  return raw.trim().replace(/\/$/, "");
}
