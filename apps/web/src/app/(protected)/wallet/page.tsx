"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useSearchParams } from "next/navigation";
import type {
  StripeConnectEntityType,
  StripeConnectStatusResponse,
} from "@pokemarket/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryKeys } from "@/lib/query-keys";
import {
  fetchWalletBalance,
  fetchPayoutPolicy,
  getOnboardingUrl,
  requestPayout,
} from "@/lib/api/wallet";
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
      return res.json() as Promise<StripeConnectStatusResponse>;
    },
  });

  const payoutPolicyQuery = useQuery({
    queryKey: ["wallet", "payout-policy"],
    queryFn: fetchPayoutPolicy,
  });

  return { balanceQuery, kycQuery, payoutPolicyQuery };
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
  const { balanceQuery, kycQuery, payoutPolicyQuery } = useWalletData();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [entityType, setEntityType] =
    useState<StripeConnectEntityType>("individual");
  const [country, setCountry] = useState("FR");

  const onboardMutation = useMutation({
    mutationFn: getOnboardingUrl,
    onSuccess: (url) => {
      setOnboardingOpen(false);
      window.location.href = url;
    },
    onError: () => {
      toast.error("Impossible de démarrer la vérification");
    },
  });

  const payoutMutation = useMutation({
    mutationFn: requestPayout,
    onSuccess: () => {
      toast.success(
        "Virement demandé ! Les fonds arriveront sous 1 à 3 jours ouvrés.",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Impossible de demander le virement");
    },
  });

  const isLoading =
    balanceQuery.isLoading || kycQuery.isLoading || payoutPolicyQuery.isLoading;
  const wallet = balanceQuery.data;
  const kycData = kycQuery.data;
  const kycStatus = (kycData?.kyc_status ?? "UNVERIFIED") as KycStatus;
  const isVerified = kycStatus === "VERIFIED";
  const payoutPolicy = payoutPolicyQuery.data;
  const minimumRequired = payoutPolicy
    ? (payoutPolicy.minimum_payout_minor + payoutPolicy.risk_reserve_minor) /
      100
    : Number.POSITIVE_INFINITY;
  const estimatedPayout = payoutPolicy
    ? Math.max(
        0,
        (wallet?.available_balance ?? 0) -
          payoutPolicy.risk_reserve_minor / 100,
      )
    : 0;
  const canPayout =
    isVerified &&
    wallet != null &&
    (wallet.available_balance ?? 0) >= minimumRequired &&
    !payoutMutation.isPending;

  useEffect(() => {
    if (searchParams.get("stripe_connect") !== "refresh") return;
    window.history.replaceState(null, "", "/wallet");
    onboardMutation.mutate({});
    // This callback intentionally runs once for Stripe's single-use refresh
    // redirect; mutation state updates must not generate another Account Link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleOnboardingStart() {
    if (kycData?.has_account) {
      onboardMutation.mutate({});
      return;
    }
    setOnboardingOpen(true);
  }

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
                  onClick={handleOnboardingStart}
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
                onClick={() => payoutMutation.mutate()}
              >
                {payoutMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Demande en cours…
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="mr-2 size-4" />
                    {wallet?.available_balance && wallet.available_balance > 0
                      ? `Virer jusqu'à ${formatPrice(estimatedPayout)}`
                      : "Demander un virement"}
                  </>
                )}
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
              {isVerified && payoutPolicy && (
                <p className="text-muted-foreground mt-1.5 text-center text-xs">
                  Minimum {formatPrice(payoutPolicy.minimum_payout_minor / 100)}
                  {" · "}réserve{" "}
                  {formatPrice(payoutPolicy.risk_reserve_minor / 100)}
                  {" · "}disponible {payoutPolicy.payout_delay_days} j après
                  transfert
                </p>
              )}
            </m.div>

            <div className="border-border space-y-1 border-t pt-4">
              {kycData?.has_account && (
                <Button
                  variant="ghost"
                  className="text-muted-foreground w-full justify-start text-sm"
                  render={<Link href="/wallet/stripe" />}
                >
                  Gérer mon compte Stripe →
                </Button>
              )}
              <Button
                variant="ghost"
                className="text-muted-foreground w-full justify-start text-sm"
                render={<Link href="/wallet/payouts" />}
              >
                Voir l&apos;historique des virements →
              </Button>
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

      <Dialog open={onboardingOpen} onOpenChange={setOnboardingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurer votre compte vendeur</DialogTitle>
            <DialogDescription>
              Stripe adapte la vérification à votre statut et à votre pays.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type de vendeur</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={entityType === "individual" ? "default" : "outline"}
                  onClick={() => setEntityType("individual")}
                >
                  Particulier
                </Button>
                <Button
                  type="button"
                  variant={entityType === "company" ? "default" : "outline"}
                  onClick={() => setEntityType("company")}
                >
                  Professionnel
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="connect-country">Pays (code ISO)</Label>
              <Input
                id="connect-country"
                value={country}
                onChange={(event) =>
                  setCountry(event.target.value.toUpperCase().slice(0, 2))
                }
                maxLength={2}
                autoComplete="country"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                onboardMutation.mutate({
                  entity_type: entityType,
                  country,
                })
              }
              disabled={country.length !== 2 || onboardMutation.isPending}
            >
              Continuer avec Stripe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
