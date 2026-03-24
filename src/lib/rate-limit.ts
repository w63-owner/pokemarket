import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export const ocrRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  prefix: "ratelimit:ocr",
  analytics: true,
});

export const checkoutRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 m"),
  prefix: "ratelimit:checkout",
  analytics: true,
});

export const pushRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:push",
  analytics: true,
});

export const onboardRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, "1 m"),
  prefix: "ratelimit:onboard",
  analytics: true,
});

export const payoutRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "1 m"),
  prefix: "ratelimit:payout",
  analytics: true,
});

export const defaultRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:default",
  analytics: true,
});

export async function applyRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<Response | null> {
  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return new Response(
      JSON.stringify({
        error: "Trop de requêtes. Veuillez patienter avant de réessayer.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  return null;
}
