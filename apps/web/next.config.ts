import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "assets.tcgdex.net",
      },
    ],
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://*.sentry.io",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' blob: data: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://*.sentry.io",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-src 'self' https://js.stripe.com",
    ].join("; ");

    // Enforce CSP only on the live production deployment (Vercel sets
    // VERCEL_ENV=production for the prod project). Staging, previews and
    // local dev keep Report-Only so a CSP regression doesn't take the
    // marketplace down — violations still surface in browser devtools.
    const cspHeaderKey =
      process.env.VERCEL_ENV === "production"
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only";

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: cspHeaderKey, value: csp },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "pokemarket",
  project: "pokemarket-web",
  silent: !process.env.CI,
  sourcemaps: { disable: true },
});
