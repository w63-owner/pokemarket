/* eslint-disable @typescript-eslint/no-explicit-any */
import type Stripe from "stripe";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdmin = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdmin,
}));

const payoutsRetrieve = vi.fn();
const payoutsCreate = vi.fn();
const balanceSettingsUpdate = vi.fn();

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    payouts: { retrieve: payoutsRetrieve, create: payoutsCreate },
    balanceSettings: { update: balanceSettingsUpdate },
  }),
}));

import {
  executeReservedPayout,
  persistPayoutStatus,
} from "@/lib/stripe/execute-payout";

const BASE_ATTEMPT = {
  id: "payout-uuid-1",
  user_id: "user-uuid-1",
  amount_minor: 5000,
  currency: "EUR",
  status: "pending" as const,
  stripe_account_id: "acct_test_123",
  stripe_payout_id: null,
};

function mockDbSelect(attempt: any = BASE_ATTEMPT) {
  mockAdmin.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: attempt, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  balanceSettingsUpdate.mockResolvedValue({});
  mockAdmin.rpc.mockResolvedValue({ data: true, error: null });
});

describe("executeReservedPayout", () => {
  it("creates a Stripe payout for a fresh pending attempt", async () => {
    mockDbSelect();
    payoutsCreate.mockResolvedValue({
      id: "po_new",
      status: "pending",
      failure_code: null,
      failure_message: null,
      metadata: { payout_record_id: BASE_ATTEMPT.id },
    });

    mockAdmin.rpc.mockImplementation((name: string) => {
      if (name === "attach_stripe_payout") return { data: true, error: null };
      if (name === "apply_stripe_payout_transition")
        return { data: true, error: null };
      return { data: null, error: null };
    });

    const result = await executeReservedPayout(BASE_ATTEMPT.id);
    expect(result.id).toBe("po_new");
    expect(payoutsCreate).toHaveBeenCalledOnce();
    expect(balanceSettingsUpdate).toHaveBeenCalledOnce();
  });

  it("returns the existing Stripe payout without creating a new one when stripe_payout_id is set", async () => {
    mockDbSelect({
      ...BASE_ATTEMPT,
      status: "in_transit",
      stripe_payout_id: "po_existing",
    });
    payoutsRetrieve.mockResolvedValue({
      id: "po_existing",
      status: "in_transit",
      failure_code: null,
      failure_message: null,
      metadata: { payout_record_id: BASE_ATTEMPT.id },
    });
    mockAdmin.rpc.mockResolvedValue({ data: true, error: null });

    const result = await executeReservedPayout(BASE_ATTEMPT.id);
    expect(result.id).toBe("po_existing");
    expect(payoutsCreate).not.toHaveBeenCalled();
    expect(payoutsRetrieve).toHaveBeenCalledWith(
      "po_existing",
      {},
      { stripeAccount: "acct_test_123" },
    );
  });

  it("calls fail_reserved_payout on a definitive Stripe error (StripeInvalidRequestError)", async () => {
    mockDbSelect();
    balanceSettingsUpdate.mockResolvedValue({});
    const stripeErr = Object.assign(new Error("No such account: acct_bogus"), {
      type: "StripeInvalidRequestError",
      code: "account_invalid",
    });
    payoutsCreate.mockRejectedValue(stripeErr);
    mockAdmin.rpc.mockResolvedValue({ data: true, error: null });

    await expect(executeReservedPayout(BASE_ATTEMPT.id)).rejects.toMatchObject({
      type: "StripeInvalidRequestError",
    });

    const failCall = (mockAdmin.rpc.mock.calls as any[][]).find(
      ([name]) => name === "fail_reserved_payout",
    );
    expect(failCall).toBeDefined();
    expect(failCall?.[1]).toMatchObject({
      p_payout_id: BASE_ATTEMPT.id,
      p_failure_code: "account_invalid",
    });
  });

  it("does NOT call fail_reserved_payout on an ambiguous network error (StripeConnectionError)", async () => {
    mockDbSelect();
    const networkErr = Object.assign(new Error("Connection error"), {
      type: "StripeConnectionError",
    });
    payoutsCreate.mockRejectedValue(networkErr);

    await expect(executeReservedPayout(BASE_ATTEMPT.id)).rejects.toMatchObject({
      type: "StripeConnectionError",
    });

    const failCall = (mockAdmin.rpc.mock.calls as any[][]).find(
      ([name]) => name === "fail_reserved_payout",
    );
    expect(failCall).toBeUndefined();
  });

  it("throws when stripe_account_id is missing", async () => {
    mockDbSelect({ ...BASE_ATTEMPT, stripe_account_id: null });
    await expect(executeReservedPayout(BASE_ATTEMPT.id)).rejects.toThrow(
      /no connected account/i,
    );
    expect(payoutsCreate).not.toHaveBeenCalled();
  });

  it("throws immediately when payout is already terminal", async () => {
    mockDbSelect({ ...BASE_ATTEMPT, status: "paid" as "pending" });
    await expect(executeReservedPayout(BASE_ATTEMPT.id)).rejects.toThrow(
      /already paid/i,
    );
    expect(payoutsCreate).not.toHaveBeenCalled();
  });
});

function stubPayout(
  id: string,
  status: string,
  metadata: Record<string, string> = {},
): Stripe.Payout {
  return {
    id,
    object: "payout",
    status,
    failure_code: null,
    failure_message: null,
    metadata,
  } as unknown as Stripe.Payout;
}

describe("persistPayoutStatus", () => {
  it("updates the DB record for a valid status", async () => {
    mockAdmin.rpc.mockResolvedValue({ data: true, error: null });
    const result = await persistPayoutStatus(stubPayout("po_test", "paid"));
    expect(result).toBe(true);
    expect(mockAdmin.rpc).toHaveBeenCalledWith(
      "apply_stripe_payout_transition",
      expect.objectContaining({
        p_stripe_payout_id: "po_test",
        p_target_status: "paid",
      }),
    );
  });

  it("handles payout.canceled status (terminal, not 'failed')", async () => {
    mockAdmin.rpc.mockResolvedValue({ data: true, error: null });
    const result = await persistPayoutStatus(
      stubPayout("po_canceled", "canceled"),
    );
    expect(result).toBe(true);
    expect(mockAdmin.rpc).toHaveBeenCalledWith(
      "apply_stripe_payout_transition",
      expect.objectContaining({ p_target_status: "canceled" }),
    );
  });

  it("attaches payout via payout_record_id metadata when apply_stripe_payout_transition returns null", async () => {
    mockAdmin.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    mockAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { stripe_account_id: "acct_test_meta" },
            error: null,
          }),
        }),
      }),
    });

    const result = await persistPayoutStatus(
      stubPayout("po_late", "paid", { payout_record_id: "payout-uuid-late" }),
    );

    expect(result).toBe(true);
    const attachCall = (mockAdmin.rpc.mock.calls as any[][]).find(
      ([name]) => name === "attach_stripe_payout",
    );
    expect(attachCall).toBeDefined();
    expect(attachCall?.[1]).toMatchObject({ p_stripe_payout_id: "po_late" });
  });

  it("returns false for an unrecognised Stripe payout status", async () => {
    const result = await persistPayoutStatus(
      stubPayout("po_weird", "unknown_future_status"),
    );
    expect(result).toBe(false);
    expect(mockAdmin.rpc).not.toHaveBeenCalled();
  });

  it("out-of-order payout.paid arriving after payout.canceled is safely ignored by the DB (returns false)", async () => {
    mockAdmin.rpc.mockResolvedValue({ data: false, error: null });

    const result = await persistPayoutStatus(
      stubPayout("po_late_paid", "paid"),
    );

    expect(result).toBe(false);
    expect(mockAdmin.rpc).toHaveBeenCalledWith(
      "apply_stripe_payout_transition",
      expect.objectContaining({ p_target_status: "paid" }),
    );
  });
});
