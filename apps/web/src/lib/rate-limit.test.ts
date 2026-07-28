import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({}) },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }

    limit = mocks.limit;
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));

describe("financial rate limiting", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed for checkout when Upstash is missing", async () => {
    const { applyRateLimit, checkoutRateLimit } = await import("./rate-limit");

    const response = await applyRateLimit(checkoutRateLimit, "buyer-id");

    expect(response?.status).toBe(503);
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      "Critical rate limiter is not configured",
      expect.objectContaining({ level: "error" }),
    );
  });

  it("keeps non-financial endpoints available when Upstash is missing", async () => {
    const { applyRateLimit, pushRateLimit } = await import("./rate-limit");

    await expect(applyRateLimit(pushRateLimit, "user-id")).resolves.toBeNull();
  });

  it("reports and returns a standard 429 response when limited", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    mocks.limit.mockResolvedValue({
      success: false,
      limit: 3,
      remaining: 0,
      reset: Date.now() + 30_000,
    });
    const { applyRateLimit, checkoutRateLimit } = await import("./rate-limit");

    const response = await applyRateLimit(checkoutRateLimit, "buyer-id");

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      "Rate limit exceeded",
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("fails closed when Redis errors on a financial endpoint", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    mocks.limit.mockRejectedValue(new Error("redis unavailable"));
    const { applyRateLimit, payoutRateLimit } = await import("./rate-limit");

    const response = await applyRateLimit(payoutRateLimit, "seller-id");

    expect(response?.status).toBe(503);
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ failure_mode: "closed" }),
      }),
    );
  });
});
