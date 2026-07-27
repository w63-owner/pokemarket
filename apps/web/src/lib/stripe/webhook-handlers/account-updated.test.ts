/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import { createMockDb } from "@/test-utils/db-mock";

const { sendPushNotification } = vi.hoisted(() => ({
  sendPushNotification: vi.fn(async () => undefined),
}));
vi.mock("@/lib/push/send", () => ({ sendPushNotification }));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { handleAccountUpdated } from "./account-updated";

function account(
  status: "active" | "pending" | "restricted" | "unsupported" = "pending",
) {
  return {
    id: "acct_v2_seller",
    metadata: { user_id: "seller-1" },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { status, status_details: [] },
          },
        },
      },
    },
  } as unknown as Stripe.V2.Core.Account;
}

beforeEach(() => {
  sendPushNotification.mockClear();
});

describe("Accounts v2 profile synchronization", () => {
  it("repairs an account orphaned by a failed creation callback", async () => {
    const db = createMockDb({
      profiles: [
        {
          id: "seller-1",
          stripe_account_id: null,
          kyc_status: "UNVERIFIED",
        },
      ],
    });
    mockClient = db.client;

    await handleAccountUpdated(account("pending"));

    expect(db.state.profiles[0]).toMatchObject({
      stripe_account_id: "acct_v2_seller",
      kyc_status: "PENDING",
    });
  });

  it("persists the first active capability transition", async () => {
    const db = createMockDb({
      profiles: [
        {
          id: "seller-1",
          stripe_account_id: "acct_v2_seller",
          kyc_status: "PENDING",
        },
      ],
    });
    mockClient = db.client;

    await handleAccountUpdated(account("active"));

    expect(db.state.profiles[0].kyc_status).toBe("VERIFIED");
  });
});
