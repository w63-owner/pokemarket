import type {
  OnboardingResponse,
  Payout,
  PayoutPolicy,
  StripeConnectOnboardingRequest,
  StripeConnectStatusResponse,
  Wallet,
} from "@deckdealr/shared";

import { requireUserId } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase";
import { api } from "./client";

export type StripeConnectStatus = StripeConnectStatusResponse;

export type PayoutResult = {
  success: true;
  payout_id: string;
  payout_amount: number;
  stripe_payout_id: string;
  status: "pending" | "in_transit" | "paid" | "failed" | "canceled";
  risk_reserve: number;
  payout_delay_days: number;
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

export async function fetchPayoutPolicy(): Promise<PayoutPolicy> {
  const { data, error } = await supabase
    .from("financial_payout_config")
    .select(
      "minimum_payout_minor, risk_reserve_minor, payout_delay_days, schedule_interval",
    )
    .single();
  if (error) throw error;
  return data as PayoutPolicy;
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
 * Stripe to use deep-link return / refresh URLs (`deckdealr://wallet/return`,
 * `deckdealr://wallet/refresh`) instead of bouncing through web pages.
 */
export async function getOnboardingUrl(
  input: Omit<StripeConnectOnboardingRequest, "client"> = {},
): Promise<string> {
  const res = await api.post<OnboardingResponse>(
    "/api/stripe-connect/onboard",
    { ...input, client: "mobile" },
  );
  if (!res.url) throw new Error("Lien Stripe Connect manquant");
  return res.url;
}

export async function getStripeDashboardUrl(): Promise<string> {
  const res = await api.post<{ url: string }>("/api/stripe-connect/dashboard");
  return res.url;
}

/**
 * Requests a bank payout from funds already transferred order-by-order to the
 * connected account. The backend durably reserves eligible funds first.
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
