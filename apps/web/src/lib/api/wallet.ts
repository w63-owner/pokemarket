import { createClient } from "@/lib/supabase/client";
import type {
  OnboardingResponse,
  Payout,
  PayoutPolicy,
  StripeConnectOnboardingRequest,
  Wallet,
} from "@pokemarket/shared";

export type PayoutHistoryResponse = {
  payouts: Payout[];
  nextCursor: string | null;
  hasMore: boolean;
};

export async function fetchWalletBalance(): Promise<Wallet | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  return (data as Wallet | null) ?? null;
}

export async function requestPayout(): Promise<void> {
  const res = await fetch("/api/stripe-connect/payout", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Erreur lors de la demande de virement");
  }
}

export async function fetchPayoutPolicy(): Promise<PayoutPolicy> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("financial_payout_config")
    .select(
      "minimum_payout_minor, risk_reserve_minor, payout_delay_days, schedule_interval",
    )
    .single();
  if (error) throw error;
  return data as PayoutPolicy;
}

export async function getOnboardingUrl(
  input: Omit<StripeConnectOnboardingRequest, "client"> = {},
): Promise<string> {
  const res = await fetch("/api/stripe-connect/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, client: "web" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Erreur lors de la génération du lien KYC");
  }
  const data = (await res.json()) as OnboardingResponse;
  if (!data.url) throw new Error("Lien Stripe Connect manquant");
  return data.url;
}

export async function fetchPayoutHistory(
  cursor?: string | null,
): Promise<PayoutHistoryResponse> {
  const url = new URL("/api/stripe-connect/payouts", window.location.origin);
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Erreur lors du chargement de l'historique");
  }

  return res.json();
}
