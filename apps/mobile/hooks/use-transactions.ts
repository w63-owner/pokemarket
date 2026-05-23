import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@pokemarket/shared";

import {
  confirmReception,
  createDispute,
  fetchMyPurchases,
  fetchMySales,
  fetchPurchaseDetail,
  fetchSaleDetail,
  shipOrder,
  type DisputeReason,
} from "@/lib/api/transactions";

const PAGE_SIZE = 20;

/**
 * Infinite list of the current user's purchases, newest first.
 */
export function usePurchases({ enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions.purchases(),
    queryFn: ({ pageParam }) =>
      fetchMyPurchases({ pageParam: pageParam as number, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

/**
 * Infinite list of the current user's sales, newest first.
 */
export function useSales({ enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions.sales(),
    queryFn: ({ pageParam }) =>
      fetchMySales({ pageParam: pageParam as number, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

export function useSaleDetail(saleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transactions.detail(saleId ?? ""),
    queryFn: () => fetchSaleDetail(saleId!),
    enabled: !!saleId,
  });
}

export function usePurchaseDetail(purchaseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transactions.purchaseDetail(purchaseId ?? ""),
    queryFn: () => fetchPurchaseDetail(purchaseId!),
    enabled: !!purchaseId,
  });
}

/** Invalidate every cached view that depends on a transaction status. */
function invalidateTransactionCaches(args: {
  queryClient: ReturnType<typeof useQueryClient>;
  conversationId?: string;
  listingId?: string;
  transactionId: string;
}) {
  const { queryClient, conversationId, listingId, transactionId } = args;

  queryClient.invalidateQueries({
    queryKey: queryKeys.transactions.detail(transactionId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.transactions.purchaseDetail(transactionId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.transactions.purchases(),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.transactions.sales(),
  });
  queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });

  if (listingId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.transactions.byListing(listingId),
    });
  }
  if (conversationId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.messages(conversationId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.detail(conversationId),
    });
  }
}

export function useShipOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      transactionId: string;
      conversationId: string;
      listingId?: string;
      trackingNumber: string;
      trackingUrl: string | null;
    }) =>
      shipOrder(
        vars.transactionId,
        vars.trackingNumber.trim(),
        vars.trackingUrl?.trim() || null,
        vars.conversationId,
      ),
    onSuccess: (_data, vars) =>
      invalidateTransactionCaches({
        queryClient,
        conversationId: vars.conversationId,
        listingId: vars.listingId,
        transactionId: vars.transactionId,
      }),
  });
}

export function useCreateDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      transactionId: string;
      conversationId: string;
      listingId?: string;
      reason: DisputeReason;
      description: string;
    }) =>
      createDispute(
        vars.transactionId,
        vars.reason,
        vars.description,
        vars.conversationId,
      ),
    onSuccess: (_data, vars) =>
      invalidateTransactionCaches({
        queryClient,
        conversationId: vars.conversationId,
        listingId: vars.listingId,
        transactionId: vars.transactionId,
      }),
  });
}

export function useConfirmReception() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      transactionId: string;
      conversationId: string;
      listingId?: string;
      rating: number;
      comment: string | null;
    }) =>
      confirmReception({
        transactionId: vars.transactionId,
        conversationId: vars.conversationId,
        rating: vars.rating,
        comment: vars.comment,
      }),
    onSuccess: (_data, vars) =>
      invalidateTransactionCaches({
        queryClient,
        conversationId: vars.conversationId,
        listingId: vars.listingId,
        transactionId: vars.transactionId,
      }),
  });
}
