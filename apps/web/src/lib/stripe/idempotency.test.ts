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
    expect(stripeIdempotencyKeys.connectAccount("user-1")).toBe(
      stripeIdempotencyKeys.connectAccount("user-1"),
    );
  });

  it("deduplicates a refund retry but not a new intentional refund", () => {
    const first = stripeIdempotencyKeys.refund("tx-1", "request-1");
    expect(stripeIdempotencyKeys.refund("tx-1", "request-1")).toBe(first);
    expect(stripeIdempotencyKeys.refund("tx-1", "request-2")).not.toBe(first);
  });

  it("keeps order transfers and reserved payouts stable across retries", () => {
    expect(stripeIdempotencyKeys.transfer("tx-1")).toBe("order-transfer-tx-1");
    expect(stripeIdempotencyKeys.transferReversal("recovery-1", 4000)).toBe(
      "transfer-reversal-recovery-1-4000",
    );
    expect(stripeIdempotencyKeys.disputeRestore("recovery-1")).toBe(
      "dispute-restore-recovery-1",
    );
    expect(stripeIdempotencyKeys.payout("payout-1")).toBe(
      "seller-payout-payout-1",
    );
  });
});
