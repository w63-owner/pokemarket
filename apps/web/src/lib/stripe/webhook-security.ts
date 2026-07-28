import * as Sentry from "@sentry/nextjs";

export function verifyStripeWebhookSource(request: Request): Response | null {
  if (process.env.NODE_ENV !== "production") return null;

  const allowedIps = new Set(
    (process.env.STRIPE_WEBHOOK_IP_ALLOWLIST ?? "")
      .split(",")
      .map((value) => normalizeIp(value))
      .filter((value): value is string => value !== null),
  );
  const forwardedFor = request.headers.get("x-vercel-forwarded-for");
  const sourceIp = normalizeIp(forwardedFor?.split(",")[0] ?? "");

  if (!sourceIp || !allowedIps.has(sourceIp)) {
    Sentry.captureMessage("Stripe webhook rejected by IP allowlist", {
      level: "warning",
      tags: {
        component: "stripe-webhook",
        source_ip_present: String(Boolean(sourceIp)),
      },
    });
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

function normalizeIp(value: string): string | null {
  const normalized = value.trim().replace(/^\[|\]$/g, "");
  if (!normalized) return null;
  return normalized.startsWith("::ffff:")
    ? normalized.slice("::ffff:".length)
    : normalized;
}
