/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

const { parseEventNotification, retrieveAccount, handleAccountUpdated } =
  vi.hoisted(() => ({
    parseEventNotification: vi.fn(),
    retrieveAccount: vi.fn(async () => ({ id: "acct_v2_seller" })),
    handleAccountUpdated: vi.fn(async () => undefined),
  }));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({ parseEventNotification }),
}));
vi.mock("@/lib/env", () => ({
  getStripeEnv: () => ({ connectWebhookSecret: "whsec_connect_test" }),
}));
vi.mock("@/lib/stripe/connect-account", () => ({
  retrieveStripeRecipientAccount: retrieveAccount,
}));
vi.mock("@/lib/stripe/webhook-handlers/account-updated", () => ({
  handleAccountUpdated,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { POST } from "./route";

function request() {
  return new Request(
    "https://thedeckdealr.test/api/webhooks/stripe/accounts-v2",
    {
      method: "POST",
      headers: { "stripe-signature": "sig_test" },
      body: "{}",
    },
  );
}

beforeEach(() => {
  const db = createMockDb({ stripe_webhooks_processed: [] });
  mockClient = db.client;
  parseEventNotification.mockReset();
  retrieveAccount.mockClear();
  handleAccountUpdated.mockClear();
});

describe("Stripe Accounts v2 webhook", () => {
  it("refreshes readiness on recipient capability transitions", async () => {
    parseEventNotification.mockReturnValue({
      id: "evt_v2_1",
      type: "v2.core.account[configuration.recipient].capability_status_updated",
      related_object: { id: "acct_v2_seller" },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(parseEventNotification).toHaveBeenCalledWith(
      "{}",
      "sig_test",
      "whsec_connect_test",
    );
    expect(retrieveAccount).toHaveBeenCalledWith("acct_v2_seller");
    expect(handleAccountUpdated).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid signature before claiming the event", async () => {
    parseEventNotification.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(retrieveAccount).not.toHaveBeenCalled();
  });
});
