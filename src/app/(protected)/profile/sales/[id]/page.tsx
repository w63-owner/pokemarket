"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { m } from "framer-motion";
import {
  Package,
  MapPin,
  User,
  CreditCard,
  Receipt,
  Truck,
  CheckCircle2,
} from "lucide-react";

import { MobileHeader } from "@/components/layout/mobile-header";
import { SmartBackButton } from "@/components/ui/smart-back-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConditionBadge } from "@/components/shared/condition-badge";
import { TransactionActions } from "@/components/messages/transaction-actions";
import { queryKeys } from "@/lib/query-keys";
import { fetchSaleDetail } from "@/lib/api/transactions-history";
import { formatPrice, formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: typeof Package;
  }
> = {
  PENDING_PAYMENT: {
    label: "En attente de paiement",
    variant: "outline",
    icon: CreditCard,
  },
  PAID: {
    label: "Payée — En attente d'expédition",
    variant: "default",
    icon: Package,
  },
  SHIPPED: { label: "Expédiée", variant: "secondary", icon: Truck },
  COMPLETED: { label: "Finalisée", variant: "default", icon: CheckCircle2 },
  CANCELLED: { label: "Annulée", variant: "destructive", icon: Package },
  REFUNDED: { label: "Remboursée", variant: "outline", icon: Package },
  DISPUTED: { label: "Litige en cours", variant: "destructive", icon: Package },
};

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status] ?? {
      label: status,
      variant: "outline" as const,
      icon: Package,
    }
  );
}

export default function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();

  const { data: sale, isLoading } = useQuery({
    queryKey: queryKeys.transactions.detail(id),
    queryFn: () => fetchSaleDetail(id),
    enabled: !!id,
  });

  if (isLoading) return <SaleDetailSkeleton />;
  if (!sale) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center px-4 text-center">
        <Receipt className="text-muted-foreground mb-4 size-12" />
        <h1 className="font-heading mb-2 text-lg font-bold">
          Vente introuvable
        </h1>
        <SmartBackButton
          fallbackUrl="/profile/transactions"
          variant="secondary"
          label="Retour"
        />
      </div>
    );
  }

  const statusConfig = getStatusConfig(sale.status);
  const StatusIcon = statusConfig.icon;
  const netEarnings = sale.total_amount - sale.fee_amount;
  const hasShippingAddress =
    sale.shipping_address_line || sale.shipping_address_city;

  return (
    <>
      <MobileHeader
        title="Détail de la vente"
        fallbackUrl="/profile/transactions"
      />
      <div className="mx-auto max-w-lg px-4 py-6">
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6 flex items-center gap-3">
            <Badge variant={statusConfig.variant} className="gap-1.5 px-3 py-1">
              <StatusIcon className="size-3.5" />
              {statusConfig.label}
            </Badge>
          </div>

          {user && (sale.status === "PAID" || sale.status === "SHIPPED") && (
            <div className="mb-4 overflow-hidden rounded-xl border">
              <TransactionActions
                transaction={sale}
                conversationId=""
                listingId={sale.listing_id}
                currentUser={user}
                sellerId={sale.seller_id}
                buyerId={sale.buyer_id}
              />
            </div>
          )}

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Package className="size-4" />
                  Carte vendue
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-3">
                  <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg">
                    {sale.listing?.cover_image_url ? (
                      <Image
                        src={sale.listing.cover_image_url}
                        alt={sale.listing.title}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="bg-muted flex size-full items-center justify-center">
                        <Package className="text-muted-foreground size-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading truncate font-semibold">
                      {sale.listing?.title ?? sale.listing_title ?? "—"}
                    </p>
                    {sale.listing?.condition && (
                      <div className="mt-1">
                        <ConditionBadge condition={sale.listing.condition} />
                      </div>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      Vendue le {formatDate(sale.created_at)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CreditCard className="size-4" />
                  Récapitulatif financier
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Montant total</span>
                  <span>{formatPrice(sale.total_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Commission PokeMarket
                  </span>
                  <span className="text-destructive">
                    -{formatPrice(sale.fee_amount)}
                  </span>
                </div>
                {sale.shipping_cost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Frais de port (payé par l&apos;acheteur)
                    </span>
                    <span className="text-muted-foreground">
                      {formatPrice(sale.shipping_cost)}
                    </span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Prix net gagné</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {formatPrice(netEarnings)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <User className="size-4" />
                  Acheteur
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-3">
                  {sale.buyer?.avatar_url ? (
                    <Image
                      src={sale.buyer.avatar_url}
                      alt={sale.buyer.username}
                      width={36}
                      height={36}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="bg-muted flex size-9 items-center justify-center rounded-full">
                      <User className="text-muted-foreground size-4" />
                    </div>
                  )}
                  <span className="text-sm font-medium">
                    {sale.buyer?.username ?? "Acheteur"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {hasShippingAddress && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <MapPin className="size-4" />
                    Adresse de livraison
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm leading-relaxed">
                    {sale.shipping_address_line && (
                      <p>{sale.shipping_address_line}</p>
                    )}
                    <p>
                      {[
                        sale.shipping_address_postcode,
                        sale.shipping_address_city,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                    {sale.shipping_country && (
                      <p className="text-muted-foreground">
                        {sale.shipping_country}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {sale.tracking_number && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Truck className="size-4" />
                    Suivi de livraison
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="font-mono text-sm">{sale.tracking_number}</p>
                  {sale.tracking_url && (
                    <a
                      href={
                        /^https?:\/\//i.test(sale.tracking_url)
                          ? sale.tracking_url
                          : `https://${sale.tracking_url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary mt-1 inline-block text-sm underline"
                    >
                      Suivre le colis →
                    </a>
                  )}
                  {sale.shipped_at && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Expédié le {formatDate(sale.shipped_at)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </m.div>
      </div>
    </>
  );
}

function SaleDetailSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <Skeleton className="h-8 w-20 rounded-lg" />
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}
