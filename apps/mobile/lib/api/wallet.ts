import type { KycStatus, Payout, Wallet } from "@pokemarket/shared";

import { requireUserId } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase";
import { api } from "./client";

export type StripeConnectStatus = {
  kyc_status: KycStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
};

export type PayoutResult = {
  success: true;
  payout_amount: number;
  stripe_transfer_id: string;
  stripe_payout_id: string | null;
};

/**
 * RLS-protected read of the current user's wallet row. Mirrors the web
 * helper at `apps/web/src/lib/api/wallet.ts`.
 */
export async function fetchWalletBalance(): Promise<Wallet | null> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Wallet | null) ?? null;
}

/**
 * Returns the current Stripe Connect KYC + capabilities snapshot. The
 * backend re-syncs the cached `kyc_status` on the profile each call, so
 * this is what powers the wallet badge.
 */
export async function fetchStripeConnectStatus(): Promise<StripeConnectStatus> {
  return api.get<StripeConnectStatus>("/api/stripe-connect/status");
}

/**
 * Asks the backend for an Account Onboarding link. The mobile flag tells
 * Stripe to use deep-link return / refresh URLs (`pokemarket://wallet/return`,
 * `pokemarket://wallet`) instead of bouncing through web pages.
 */
export async function getOnboardingUrl(): Promise<string> {
  const res = await api.get<{ url: string }>(
    "/api/stripe-connect/onboard?client=mobile",
  );
  return res.url;
}

/**
 * Triggers a Stripe payout for the seller's full available balance.
 * Idempotent within a 24h window per (user, amount, day).
 */
export async function requestPayout(): Promise<PayoutResult> {
  return api.post<PayoutResult>("/api/stripe-connect/payout");
}

export type PayoutHistoryResponse = {
  payouts: Payout[];
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * Fetches the user's payout history with cursor-based pagination.
 */
export async function fetchPayoutHistory(
  cursor?: string | null,
): Promise<PayoutHistoryResponse> {
  const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api.get<PayoutHistoryResponse>(`/api/stripe-connect/payouts${params}`);
}
