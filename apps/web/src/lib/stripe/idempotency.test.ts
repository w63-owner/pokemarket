import { describe, expect, it } from "vitest";

import { stripeIdempotencyKeys } from "./idempotency";

describe("Stripe idempotency keys", () => {
  it("keeps retries stable for every checkout object", () => {
    expect(stripeIdempotencyKeys.customer("user-1")).toBe(
      stripeIdempotencyKeys.customer("user-1"),
    );
    expect(stripeIdempotencyKeys.checkoutSession("tx-1")).toBe(
      stripeIdempotencyKeys.checkoutSession("tx-1"),
    );
    expect(stripeIdempotencyKeys.paymentIntent("tx-1")).toBe(
      stripeIdempotencyKeys.paymentIntent("tx-1"),
    );
  });

  it("deduplicates a refund retry but not a new intentional refund", () => {
    const first = stripeIdempotencyKeys.refund("tx-1", "request-1");
    expect(stripeIdempotencyKeys.refund("tx-1", "request-1")).toBe(first);
    expect(stripeIdempotencyKeys.refund("tx-1", "request-2")).not.toBe(first);
  });
});
