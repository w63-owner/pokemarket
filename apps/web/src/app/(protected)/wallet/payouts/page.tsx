"use client";

import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { m } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Loader2,
  Banknote,
} from "lucide-react";

import { MobileHeader } from "@/components/layout/mobile-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { queryKeys } from "@/lib/query-keys";
import { fetchPayoutHistory } from "@/lib/api/wallet";
import { formatPrice, formatDate } from "@/lib/utils";
import type { PayoutStatus, Payout } from "@pokemarket/shared";

const STATUS_CONFIG: Record<
  PayoutStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: typeof CheckCircle2;
  }
> = {
  pending: {
    label: "En attente",
    variant: "outline",
    icon: Clock,
  },
  in_transit: {
    label: "En cours",
    variant: "secondary",
    icon: ArrowUpRight,
  },
  paid: {
    label: "Reçu",
    variant: "default",
    icon: CheckCircle2,
  },
  failed: {
    label: "Échoué",
    variant: "destructive",
    icon: AlertCircle,
  },
  canceled: {
    label: "Annulé",
    variant: "outline",
    icon: XCircle,
  },
};

export default function PayoutsHistoryPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: queryKeys.wallet.payouts(),
      queryFn: ({ pageParam }) => fetchPayoutHistory(pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

  const { ref: sentinelRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allPayouts = data?.pages.flatMap((page) => page.payouts) ?? [];

  return (
    <>
      <MobileHeader title="Historique des virements" fallbackUrl="/wallet" />
      <div className="mx-auto max-w-lg px-4 py-6">
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 rounded-full p-2.5">
              <Banknote className="text-primary size-6" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold">Mes virements</h1>
              <p className="text-muted-foreground text-sm">
                Historique de tous vos virements vers votre compte bancaire
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : allPayouts.length === 0 ? (
            <EmptyState
              icon={<Banknote className="size-6" />}
              title="Aucun virement effectué"
              description="Vos virements apparaîtront ici une fois que vous aurez demandé un retrait de votre solde disponible."
              action={{ label: "Retour au portefeuille", href: "/wallet" }}
            />
          ) : (
            <>
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="space-y-2"
              >
                {allPayouts.map((payout, index) => (
                  <PayoutRow key={payout.id} payout={payout} index={index} />
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
          )}
        </m.div>
      </div>
    </>
  );
}

function PayoutRow({ payout, index }: { payout: Payout; index: number }) {
  const config = STATUS_CONFIG[payout.status];
  const Icon = config.icon;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              payout.status === "paid"
                ? "bg-emerald-100 dark:bg-emerald-950"
                : payout.status === "failed"
                  ? "bg-destructive/10"
                  : "bg-muted"
            }`}
          >
            <Icon
              className={`size-5 ${
                payout.status === "paid"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : payout.status === "failed"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Virement bancaire</p>
              <Badge variant={config.variant} className="text-[10px]">
                {config.label}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {formatDate(payout.requested_at)}
            </p>
            {payout.status === "failed" && payout.failure_message && (
              <p className="text-destructive mt-1 text-xs">
                {payout.failure_message}
              </p>
            )}
          </div>
          <div className="text-right">
            <p
              className={`font-heading text-lg font-semibold ${
                payout.status === "paid"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : payout.status === "failed"
                    ? "text-destructive"
                    : ""
              }`}
            >
              {formatPrice(payout.amount)}
            </p>
            {payout.completed_at && (
              <p className="text-muted-foreground text-[10px]">
                {payout.status === "paid" ? "Reçu le " : ""}
                {formatDate(payout.completed_at)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}
