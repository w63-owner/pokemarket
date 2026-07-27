import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  deriveRecipientKycStatus,
  isStripeRecipientReady,
} from "./connect-readiness";

describe("Stripe recipient readiness", () => {
  it("accepts the transitional Accounts v1 transfers capability", () => {
    const account = {
      charges_enabled: false,
      payouts_enabled: false,
      capabilities: { transfers: "active" },
      requirements: {},
    } as unknown as Stripe.Account;

    expect(isStripeRecipientReady(account)).toBe(true);
    expect(deriveRecipientKycStatus(account)).toBe("VERIFIED");
  });

  it("prefers the Accounts v2 recipient capability when present", () => {
    const account = {
      capabilities: { transfers: "active" },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { status: "inactive" },
            },
          },
        },
      },
      requirements: {},
    } as unknown as Stripe.Account;

    expect(isStripeRecipientReady(account)).toBe(false);
    expect(deriveRecipientKycStatus(account)).toBe("PENDING");
  });
});
