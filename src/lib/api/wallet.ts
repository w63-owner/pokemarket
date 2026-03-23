import { createClient } from "@/lib/supabase/client";
import type { Wallet } from "@/types";

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

export async function getOnboardingUrl(): Promise<string> {
  const res = await fetch("/api/stripe-connect/onboard");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Erreur lors de la génération du lien KYC");
  }
  const data = await res.json();
  return data.url;
}
