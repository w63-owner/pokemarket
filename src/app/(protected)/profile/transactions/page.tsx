"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Store, ChevronRight, Receipt } from "lucide-react";

import { MobileHeader } from "@/components/layout/mobile-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  const purchasesQuery = useQuery({
    queryKey: queryKeys.transactions.purchases(),
    queryFn: fetchMyPurchases,
    enabled: tab === "purchases",
  });

  const salesQuery = useQuery({
    queryKey: queryKeys.transactions.sales(),
    queryFn: fetchMySales,
    enabled: tab === "sales",
  });

  return (
    <>
      <MobileHeader title="Mes transactions" fallbackUrl="/profile" />
      <div className="mx-auto max-w-lg px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="purchases" className="flex-1 gap-1.5">
                <ShoppingBag className="size-4" />
                Mes Achats
              </TabsTrigger>
              <TabsTrigger value="sales" className="flex-1 gap-1.5">
                <Store className="size-4" />
                Mes Ventes
              </TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <TabsContent key="purchases" value="purchases" className="mt-0">
                <TransactionList
                  data={purchasesQuery.data}
                  isLoading={purchasesQuery.isLoading}
                  type="purchase"
                />
              </TabsContent>

              <TabsContent key="sales" value="sales" className="mt-0">
                <TransactionList
                  data={salesQuery.data}
                  isLoading={salesQuery.isLoading}
                  type="sale"
                />
              </TabsContent>
            </AnimatePresence>
          </Tabs>
        </motion.div>
      </div>
    </>
  );
}

function TransactionList({
  data,
  isLoading,
  type,
}: {
  data: TransactionWithDetails[] | undefined;
  isLoading: boolean;
  type: "purchase" | "sale";
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-2"
    >
      {data.map((tx, index) => (
        <TransactionRow
          key={tx.id}
          transaction={tx}
          type={type}
          index={index}
        />
      ))}
    </motion.div>
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
  const statusConfig = getStatusConfig(tx.status);

  const href =
    type === "sale" ? `/profile/sales/${tx.id}` : `/orders/${tx.id}/success`;

  return (
    <motion.div
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
                  {formatDate(tx.created_at)}
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
    </motion.div>
  );
}
