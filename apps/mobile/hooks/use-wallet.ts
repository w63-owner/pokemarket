import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@pokemarket/shared";

import {
  fetchStripeConnectStatus,
  fetchWalletBalance,
  getOnboardingUrl,
  requestPayout,
} from "@/lib/api/wallet";

const STRIPE_CONNECT_STATUS_KEY = ["stripe-connect", "status"] as const;

/**
 * Fetches the current user's wallet balance + Stripe Connect status in
 * parallel. Both queries share the same `staleTime` so a refresh on the
 * wallet screen re-fires both at once.
 */
export function useWalletData() {
  const balanceQuery = useQuery({
    queryKey: queryKeys.wallet.balance(),
    queryFn: fetchWalletBalance,
    staleTime: 15_000,
  });

  const kycQuery = useQuery({
    queryKey: STRIPE_CONNECT_STATUS_KEY,
    queryFn: fetchStripeConnectStatus,
    staleTime: 15_000,
  });

  return {
    balanceQuery,
    kycQuery,
    refetchAll: async () => {
      await Promise.all([balanceQuery.refetch(), kycQuery.refetch()]);
    },
  };
}

/**
 * Triggers Stripe Connect onboarding and returns the hosted URL the
 * caller should open in `expo-web-browser`.
 */
export function useStripeConnectOnboarding() {
  return useMutation({
    mutationFn: getOnboardingUrl,
  });
}

/**
 * Demande de virement de la totalité du solde disponible. Invalide les
 * caches `wallet.balance` au succès pour rafraîchir l'écran.
 */
export function useRequestPayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: requestPayout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    },
  });
}

export const stripeConnectStatusKey = STRIPE_CONNECT_STATUS_KEY;
