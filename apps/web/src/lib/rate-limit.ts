import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import * as Sentry from "@sentry/nextjs";

type RateLimiter = {
  name: string;
  client: Ratelimit | null;
  failClosed: boolean;
};

const hasRedisCredentials = Boolean(
  process.env.UPSTASH_REDIS_REST_URL?.trim() &&
  process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
);
const redis = hasRedisCredentials ? Redis.fromEnv() : null;
const isDevelopmentOrTest =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

function createRateLimiter(
  name: string,
  requests: number,
  failClosed = false,
): RateLimiter {
  return {
    name,
    failClosed,
    client: redis
      ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(requests, "1 m"),
          prefix: `ratelimit:${name}`,
          analytics: true,
        })
      : null,
  };
}

export const ocrRateLimit = createRateLimiter("ocr", 5);
export const checkoutRateLimit = createRateLimiter("checkout", 3, true);
export const pushRateLimit = createRateLimiter("push", 10);
export const onboardRateLimit = createRateLimiter("onboard", 2);
export const payoutRateLimit = createRateLimiter("payout", 1, true);

// Admin actions can create refunds or submit dispute evidence. Never continue
// without the distributed limiter outside local development/test.
export const adminActionRateLimit = createRateLimiter("admin-action", 20, true);
export const defaultRateLimit = createRateLimiter("default", 10);

export async function applyRateLimit(
  limiter: RateLimiter,
  identifier: string,
): Promise<Response | null> {
  if (!limiter.client) {
    if (limiter.failClosed && !isDevelopmentOrTest) {
      Sentry.captureMessage("Critical rate limiter is not configured", {
        level: "error",
        tags: {
          component: "rate-limit",
          limiter: limiter.name,
          failure_mode: "closed",
        },
      });
      return unavailableResponse();
    }
    return null;
  }

  try {
    const { success, limit, remaining, reset } =
      await limiter.client.limit(identifier);

    if (!success) {
      Sentry.captureMessage("Rate limit exceeded", {
        level: "warning",
        tags: { component: "rate-limit", limiter: limiter.name },
        extra: { limit, remaining, reset },
      });
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
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        component: "rate-limit",
        limiter: limiter.name,
        failure_mode:
          limiter.failClosed && !isDevelopmentOrTest ? "closed" : "open",
      },
    });
    return limiter.failClosed && !isDevelopmentOrTest
      ? unavailableResponse()
      : null;
  }
}

function unavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      error:
        "Protection anti-abus temporairement indisponible. Veuillez réessayer.",
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
    },
  );
}
