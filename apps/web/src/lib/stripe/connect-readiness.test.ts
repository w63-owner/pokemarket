import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  deriveRecipientKycStatus,
  isStripeRecipientReady,
} from "./connect-readiness";

describe("Stripe recipient readiness", () => {
  it("uses only the Accounts v2 recipient transfer capability", () => {
    const account = {
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { status: "active", status_details: [] },
            },
          },
        },
      },
    } as unknown as Stripe.V2.Core.Account;

    expect(isStripeRecipientReady(account)).toBe(true);
    expect(deriveRecipientKycStatus(account)).toBe("VERIFIED");
  });

  it("marks remediable past-due requirements as required", () => {
    const account = {
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: {
                status: "restricted",
                status_details: [
                  {
                    code: "requirements_past_due",
                    resolution: "provide_info",
                  },
                ],
              },
            },
          },
        },
      },
    } as unknown as Stripe.V2.Core.Account;

    expect(isStripeRecipientReady(account)).toBe(false);
    expect(deriveRecipientKycStatus(account)).toBe("REQUIRED");
  });

  it("rejects an unsupported recipient", () => {
    const account = {
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: {
                status: "unsupported",
                status_details: [
                  {
                    code: "unsupported_country",
                    resolution: "no_resolution",
                  },
                ],
              },
            },
          },
        },
      },
    } as unknown as Stripe.V2.Core.Account;

    expect(deriveRecipientKycStatus(account)).toBe("REJECTED");
  });
});
