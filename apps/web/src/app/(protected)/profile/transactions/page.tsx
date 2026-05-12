"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import Link from "next/link";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import {
  ShoppingBag,
  Store,
  ChevronRight,
  Receipt,
  Loader2,
} from "lucide-react";

import { MobileHeader } from "@/components/layout/mobile-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { queryKeys } from "@/lib/query-keys";
import { fetchMyPurchases, fetchMySales } from "@/lib/api/transactions-history";
import { formatPrice, formatDate } from "@/lib/utils";
import type { TransactionWithDetails } from "@/types";

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  PENDING_PAYMENT: { label: "En attente de paiement", variant: "outline" },
  PAID: { label: "Payée", variant: "default" },
  SHIPPED: { label: "Expédiée", variant: "secondary" },
  COMPLETED: { label: "Finalisée", variant: "default" },
  CANCELLED: { label: "Annulée", variant: "destructive" },
  EXPIRED: { label: "Expirée", variant: "destructive" },
  REFUNDED: { label: "Remboursée", variant: "outline" },
  DISPUTED: { label: "Litige", variant: "destructive" },
};

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const }
  );
}

export default function TransactionsPage() {
  const [tab, setTab] = useState("purchases");

  const purchasesQuery = useInfiniteQuery({
    queryKey: queryKeys.transactions.purchases(),
    queryFn: ({ pageParam }) => fetchMyPurchases({ pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: tab === "purchases",
  });

  const salesQuery = useInfiniteQuery({
    queryKey: queryKeys.transactions.sales(),
    queryFn: ({ pageParam }) => fetchMySales({ pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: tab === "sales",
  });

  const activeQuery = tab === "purchases" ? purchasesQuery : salesQuery;

  return (
    <>
      <MobileHeader title="Mes transactions" fallbackUrl="/profile" />
      <div className="mx-auto max-w-lg px-4 py-6">
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 grid w-full grid-cols-2" variant="line">
              <TabsTrigger value="purchases">
                <ShoppingBag className="size-4" />
                Mes Achats
              </TabsTrigger>
              <TabsTrigger value="sales">
                <Store className="size-4" />
                Mes Ventes
              </TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <m.div
                key={tab}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.2 }}
                className="mt-0"
              >
                <TransactionList
                  query={activeQuery}
                  type={tab === "purchases" ? "purchase" : "sale"}
                />
              </m.div>
            </AnimatePresence>
          </Tabs>
        </m.div>
      </div>
    </>
  );
}

type InfiniteTransactionsQuery = ReturnType<
  typeof useInfiniteQuery<Awaited<ReturnType<typeof fetchMyPurchases>>, Error>
>;

function TransactionList({
  query,
  type,
}: {
  query: InfiniteTransactionsQuery;
  type: "purchase" | "sale";
}) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    query;

  const { ref: sentinelRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allTransactions = data?.pages.flatMap((page) => page.data) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (allTransactions.length === 0) {
    return (
      <EmptyState
        icon={
          type === "purchase" ? (
            <ShoppingBag className="size-6" />
          ) : (
            <Store className="size-6" />
          )
        }
        title={
          type === "purchase"
            ? "Aucun achat pour le moment"
            : "Aucune vente pour le moment"
        }
        description={
          type === "purchase"
            ? "Vos achats apparaîtront ici une fois un paiement effectué."
            : "Vos ventes apparaîtront ici dès qu'un acheteur passera commande."
        }
        action={
          type === "purchase"
            ? { label: "Explorer le marché", href: "/" }
            : { label: "Vendre une carte", href: "/sell" }
        }
      />
    );
  }

  return (
    <>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="space-y-2"
      >
        {allTransactions.map((tx, index) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            type={type}
            index={index}
          />
        ))}

        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        )}
      </m.div>

      {hasNextPage && (
        <div ref={sentinelRef} className="h-10" aria-hidden="true" />
      )}
    </>
  );
}

function TransactionRow({
  transaction: tx,
  type,
  index,
}: {
  transaction: TransactionWithDetails;
  type: "purchase" | "sale";
  index: number;
}) {
  const statusConfig = getStatusConfig(tx.status ?? "PENDING_PAYMENT");

  const href =
    type === "sale" ? `/profile/sales/${tx.id}` : `/orders/${tx.id}/success`;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Link href={href}>
        <Card className="hover:bg-muted/50 transition-colors">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-lg">
              {tx.listing?.cover_image_url ? (
                <Image
                  src={tx.listing.cover_image_url}
                  alt={tx.listing.title ?? ""}
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              ) : (
                <div className="bg-muted flex size-full items-center justify-center">
                  <Receipt className="text-muted-foreground size-5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {tx.listing?.title ?? tx.listing_title ?? "Transaction"}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge variant={statusConfig.variant} className="text-[10px]">
                  {statusConfig.label}
                </Badge>
                <span className="text-muted-foreground text-[11px]">
                  {formatDate(tx.created_at ?? "")}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-heading text-sm font-semibold">
                {formatPrice(tx.total_amount)}
              </span>
              <ChevronRight className="text-muted-foreground size-4" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </m.div>
  );
}
