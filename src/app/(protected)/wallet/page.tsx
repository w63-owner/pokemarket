"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { m } from "framer-motion";
import {
  Wallet as WalletIcon,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  ArrowUpRight,
  Clock,
  BadgeCheck,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/query-keys";
import { fetchWalletBalance, getOnboardingUrl } from "@/lib/api/wallet";
import { formatPrice } from "@/lib/utils";
import type { KycStatus } from "@/lib/constants";

function useWalletData() {
  const balanceQuery = useQuery({
    queryKey: queryKeys.wallet.balance(),
    queryFn: fetchWalletBalance,
  });

  const kycQuery = useQuery({
    queryKey: ["stripe-connect", "status"],
    queryFn: async () => {
      const res = await fetch("/api/stripe-connect/status");
      if (!res.ok) throw new Error("Erreur KYC");
      return res.json() as Promise<{
        kyc_status: KycStatus;
        charges_enabled: boolean;
        payouts_enabled: boolean;
      }>;
    },
  });

  return { balanceQuery, kycQuery };
}

const KYC_CONFIG: Record<
  KycStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: typeof BadgeCheck;
  }
> = {
  UNVERIFIED: {
    label: "Non vérifié",
    variant: "secondary",
    icon: AlertTriangle,
  },
  PENDING: { label: "En cours", variant: "outline", icon: Clock },
  REQUIRED: {
    label: "Action requise",
    variant: "destructive",
    icon: AlertTriangle,
  },
  VERIFIED: { label: "Vérifié", variant: "default", icon: BadgeCheck },
  REJECTED: { label: "Refusé", variant: "destructive", icon: AlertTriangle },
};

export default function WalletPage() {
  const { balanceQuery, kycQuery } = useWalletData();

  const onboardMutation = useMutation({
    mutationFn: getOnboardingUrl,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: () => {
      toast.error("Impossible de démarrer la vérification");
    },
  });

  const isLoading = balanceQuery.isLoading || kycQuery.isLoading;
  const wallet = balanceQuery.data;
  const kycData = kycQuery.data;
  const kycStatus = (kycData?.kyc_status ?? "UNVERIFIED") as KycStatus;
  const isVerified = kycStatus === "VERIFIED";
  const canPayout =
    isVerified && wallet != null && (wallet.available_balance ?? 0) > 0;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-primary/10 rounded-full p-2.5">
            <WalletIcon className="text-primary size-6" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">
              Mon portefeuille
            </h1>
            <p className="text-muted-foreground text-sm">
              Gérez vos revenus et virements
            </p>
          </div>
        </div>

        {isLoading ? (
          <WalletSkeleton />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-muted-foreground mb-1 text-xs font-medium">
                    Solde disponible
                  </p>
                  <p className="font-heading text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPrice(wallet?.available_balance ?? 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-muted-foreground mb-1 text-xs font-medium">
                    En attente
                  </p>
                  <p className="font-heading text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {formatPrice(wallet?.pending_balance ?? 0)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    Libéré à la confirmation de réception
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-muted-foreground size-5" />
                  <div>
                    <p className="text-sm font-medium">Vérification KYC</p>
                    <p className="text-muted-foreground text-xs">
                      Stripe Connect
                    </p>
                  </div>
                </div>
                <KycBadge status={kycStatus} />
              </CardContent>
            </Card>

            {(kycStatus === "UNVERIFIED" ||
              kycStatus === "PENDING" ||
              kycStatus === "REQUIRED") && (
              <m.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Button
                  onClick={() => onboardMutation.mutate()}
                  disabled={onboardMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {onboardMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Redirection…
                    </>
                  ) : (
                    <>
                      <ExternalLink className="mr-2 size-4" />
                      {kycStatus === "UNVERIFIED"
                        ? "Compléter mon identité (KYC)"
                        : "Reprendre la vérification"}
                    </>
                  )}
                </Button>
              </m.div>
            )}

            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                disabled={!canPayout}
              >
                <ArrowUpRight className="mr-2 size-4" />
                Demander un virement
              </Button>
              {!isVerified && (
                <p className="text-muted-foreground mt-1.5 text-center text-xs">
                  Complétez la vérification KYC pour demander un virement
                </p>
              )}
              {isVerified && wallet?.available_balance === 0 && (
                <p className="text-muted-foreground mt-1.5 text-center text-xs">
                  Aucun solde disponible pour le moment
                </p>
              )}
            </m.div>

            <div className="border-border border-t pt-4">
              <Button
                variant="ghost"
                className="text-muted-foreground w-full justify-start text-sm"
                render={<Link href="/profile/transactions" />}
              >
                Voir l&apos;historique des transactions →
              </Button>
            </div>
          </div>
        )}
      </m.div>
    </div>
  );
}

function KycBadge({ status }: { status: KycStatus }) {
  const config = KYC_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}

function WalletSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
    </div>
  );
}
