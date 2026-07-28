import { z } from "zod";

/**
 * Centralised env-var accessors.
 *
 * Goals :
 *   - One single fallback path for `NEXT_PUBLIC_APP_URL`, instead of 8 copies
 *     scattered across the codebase that all defaulted to a different domain.
 *   - Fail-fast in production : if a critical env var is missing the boot
 *     should crash explicitly instead of silently sending users to a phantom
 *     domain (e.g. payment success_url=http://localhost:3000/... in prod).
 *   - Validate the single supported payment stack (Stripe) in one place.
 */

const isProd = process.env.NODE_ENV === "production";

export const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

const optionalNonEmpty = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().optional(),
);

const restrictedStripeKey = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().regex(/^rk_(?:test|live)_/, {
    message: "must be a least-privilege Stripe restricted API key",
  }),
);

const stripeEnvSchema = z.object({
  paymentsApiKey: restrictedStripeKey,
  connectApiKey: restrictedStripeKey,
  operationsApiKey: restrictedStripeKey,
  publishableKey: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().regex(/^pk_(?:test|live)_/, {
      message: "must be a Stripe publishable key",
    }),
  ),
  webhookSecret: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().startsWith("whsec_"),
  ),
  connectWebhookSecret: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().startsWith("whsec_"),
  ),
  supportEmail: z.email(),
  allowedOrigins: optionalNonEmpty,
  webhookIpAllowlist: optionalNonEmpty,
});

export type StripeEnv = z.infer<typeof stripeEnvSchema>;

export function getStripeEnv(): StripeEnv {
  const parsed = stripeEnvSchema.safeParse({
    paymentsApiKey: process.env.STRIPE_PAYMENTS_API_KEY,
    connectApiKey: process.env.STRIPE_CONNECT_API_KEY,
    operationsApiKey: process.env.STRIPE_OPERATIONS_API_KEY,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    connectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    supportEmail: process.env.SUPPORT_EMAIL,
    allowedOrigins: process.env.CHECKOUT_ALLOWED_ORIGINS,
    webhookIpAllowlist: process.env.STRIPE_WEBHOOK_IP_ALLOWLIST,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid Stripe environment: ${z.prettifyError(parsed.error)}`,
    );
  }

  return parsed.data;
}

export function validateServerEnv(): void {
  getAppUrl();
  const stripeEnv = getStripeEnv();
  if (isProd && !process.env.CRON_SECRET?.trim()) {
    throw new Error("CRON_SECRET must be set in production");
  }
  if (
    isProd &&
    (!process.env.UPSTASH_REDIS_REST_URL?.trim() ||
      !process.env.UPSTASH_REDIS_REST_TOKEN?.trim())
  ) {
    throw new Error(
      "Upstash Redis credentials must be set outside development so financial rate limits fail closed",
    );
  }
  if (isProd && !stripeEnv.webhookIpAllowlist) {
    throw new Error(
      "STRIPE_WEBHOOK_IP_ALLOWLIST must be set outside development",
    );
  }
}

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
          "(used for Stripe redirects, sitemap/robots, transactional emails, cron callbacks).",
      );
    }
    return "http://localhost:3000";
  }
  return raw.trim().replace(/\/$/, "");
}

function normalizeHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Returns a trusted origin for Stripe redirect URLs.
 *
 * The browser-controlled Origin header is accepted only when it exactly
 * matches the canonical app URL, a Vercel deployment URL, or an explicit
 * comma-separated CHECKOUT_ALLOWED_ORIGINS entry.
 */
export function getAllowedCheckoutOrigin(
  requestOrigin: string | null,
): string | null {
  const canonicalOrigin = normalizeHttpOrigin(getAppUrl());
  if (!canonicalOrigin) {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid HTTP(S) URL");
  }

  if (!requestOrigin) return canonicalOrigin;

  const candidate = normalizeHttpOrigin(requestOrigin.trim());
  if (!candidate) return null;

  const configured = (process.env.CHECKOUT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => normalizeHttpOrigin(origin.trim()))
    .filter((origin): origin is string => origin !== null);

  const vercelOrigin = process.env.VERCEL_URL
    ? normalizeHttpOrigin(`https://${process.env.VERCEL_URL}`)
    : null;
  const allowed = new Set([
    canonicalOrigin,
    ...configured,
    ...(vercelOrigin ? [vercelOrigin] : []),
  ]);

  return allowed.has(candidate) ? candidate : null;
}
