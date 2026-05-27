import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  Clock,
  ExternalLink,
  Receipt,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react-native";
import { formatPrice, type KycStatus } from "@pokemarket/shared";

import { ApiError } from "@/lib/api/client";
import { fadeInUp, useReducedMotionSafe } from "@/lib/motion";
import {
  useRequestPayout,
  useStripeConnectOnboarding,
  useWalletData,
} from "@/hooks/use-wallet";
import { Badge, Button, Card, Skeleton, Text, toast } from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { ErrorState } from "@/components/shared";
import { haptic } from "@/lib/haptics";
import { useThemeColors } from "@/lib/theme-colors";

type KycVariant = "default" | "secondary" | "destructive" | "outline";

type KycConfigEntry = {
  label: string;
  variant: KycVariant;
  Icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
};

// Resolves the per-status colour against the live palette so the icon
// inside `<KycBadge>` keeps a usable contrast in both light and dark
// themes. We deliberately re-derive the map on every render – it's
// cheap and avoids stale closures when the user toggles the scheme.
function useKycConfig(): Record<KycStatus, KycConfigEntry> {
  const colors = useThemeColors();
  return {
    UNVERIFIED: {
      label: "Non vérifié",
      variant: "secondary",
      Icon: AlertTriangle,
      color: colors.mutedForeground,
    },
    PENDING: {
      label: "En cours",
      variant: "outline",
      Icon: Clock,
      color: colors.warning,
    },
    REQUIRED: {
      label: "Action requise",
      variant: "destructive",
      Icon: AlertTriangle,
      color: colors.destructive,
    },
    VERIFIED: {
      label: "Vérifié",
      variant: "default",
      Icon: BadgeCheck,
      color: colors.success,
    },
    REJECTED: {
      label: "Refusé",
      variant: "destructive",
      Icon: AlertTriangle,
      color: colors.destructive,
    },
  };
}

export default function WalletScreen() {
  const { balanceQuery, kycQuery, refetchAll } = useWalletData();
  const onboardMutation = useStripeConnectOnboarding();
  const payoutMutation = useRequestPayout();
  const colors = useThemeColors();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setRefreshing(false);
    }
  }, [refetchAll]);

  const handleOnboard = useCallback(async () => {
    try {
      const url = await onboardMutation.mutateAsync();
      // `WebBrowser.openAuthSessionAsync` blocks until either Stripe
      // redirects to our `pokemarket://wallet/return` deep link, or the
      // user dismisses the in-app browser. Either way we land on the
      // return screen which polls the new KYC status.
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        "pokemarket://wallet/return",
      );

      if (result.type === "success" || result.type === "dismiss") {
        router.push("/wallet/return");
      }
    } catch (err) {
      haptic("error");
      toast.error(
        "Impossible de démarrer la vérification",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, [onboardMutation]);

  const handlePayout = useCallback(async () => {
    try {
      const result = await payoutMutation.mutateAsync();
      haptic("success");
      toast.success(
        `Virement de ${formatPrice(result.payout_amount)} demandé`,
        "Les fonds arriveront sous 1 à 3 jours ouvrés.",
      );
    } catch (err) {
      haptic("error");
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Impossible de demander le virement";
      toast.error("Erreur", message);
    }
  }, [payoutMutation]);

  const isLoading = balanceQuery.isLoading || kycQuery.isLoading;
  const wallet = balanceQuery.data;
  const kycStatus: KycStatus = (kycQuery.data?.kyc_status ??
    "UNVERIFIED") as KycStatus;
  const isVerified = kycStatus === "VERIFIED";
  const availableBalance = wallet?.available_balance ?? 0;
  const canPayout =
    isVerified && availableBalance > 0 && !payoutMutation.isPending;
  const reduceMotion = useReducedMotionSafe();

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader
        title="Mon portefeuille"
        subtitle="Revenus & virements"
        fallbackHref="/(tabs)/profile"
      />

      <SafeAreaView edges={["bottom"]} className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {isLoading ? (
            <WalletSkeleton />
          ) : balanceQuery.isError && wallet == null ? (
            <ErrorState
              variant="card"
              title="Solde inaccessible"
              description={
                balanceQuery.error instanceof Error
                  ? balanceQuery.error.message
                  : "Réessayez dans un instant."
              }
              action={{
                label: "Réessayer",
                onPress: () => void refetchAll(),
              }}
            />
          ) : (
            <MotiView
              from={reduceMotion ? fadeInUp.animate : fadeInUp.from}
              animate={fadeInUp.animate}
              transition={fadeInUp.transition}
              style={{ gap: 16 }}
            >
              <View className="flex-row gap-3">
                <BalanceCard
                  label="Solde disponible"
                  amount={availableBalance}
                  accentClassName="text-success"
                />
                <BalanceCard
                  label="En attente"
                  amount={wallet?.pending_balance ?? 0}
                  accentClassName="text-warning"
                  hint="Libéré à la confirmation de réception"
                />
              </View>

              <Card>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <ShieldCheck size={20} color={colors.mutedForeground} />
                    <View>
                      <Text className="text-sm font-medium">
                        Vérification KYC
                      </Text>
                      <Text variant="caption">Stripe Connect</Text>
                    </View>
                  </View>
                  <KycBadge status={kycStatus} />
                </View>
              </Card>

              {(kycStatus === "UNVERIFIED" ||
                kycStatus === "PENDING" ||
                kycStatus === "REQUIRED" ||
                kycStatus === "REJECTED") && (
                <MotiView
                  from={reduceMotion ? fadeInUp.animate : fadeInUp.from}
                  animate={fadeInUp.animate}
                  transition={{
                    ...(fadeInUp.transition as object),
                    delay: 80,
                  }}
                >
                  <Button
                    size="lg"
                    loading={onboardMutation.isPending}
                    onPress={handleOnboard}
                    leftIcon={
                      onboardMutation.isPending ? null : (
                        <ExternalLink
                          size={18}
                          color={colors.primaryForeground}
                        />
                      )
                    }
                  >
                    {kycStatus === "UNVERIFIED"
                      ? "Compléter mon identité (KYC)"
                      : "Reprendre la vérification"}
                  </Button>
                </MotiView>
              )}

              <MotiView
                from={reduceMotion ? fadeInUp.animate : fadeInUp.from}
                animate={fadeInUp.animate}
                transition={{
                  ...(fadeInUp.transition as object),
                  delay: 120,
                }}
              >
                <Button
                  variant="outline"
                  size="lg"
                  disabled={!canPayout}
                  loading={payoutMutation.isPending}
                  onPress={() => {
                    Alert.alert(
                      "Demander un virement",
                      `Vous allez recevoir ${formatPrice(availableBalance)} sur votre compte bancaire sous 1 à 3 jours ouvrés.`,
                      [
                        { text: "Annuler", style: "cancel" },
                        {
                          text: "Confirmer",
                          style: "default",
                          onPress: handlePayout,
                        },
                      ],
                    );
                  }}
                  leftIcon={
                    payoutMutation.isPending ? null : (
                      <ArrowUpRight size={18} color={colors.foreground} />
                    )
                  }
                >
                  {availableBalance > 0
                    ? `Virer ${formatPrice(availableBalance)}`
                    : "Demander un virement"}
                </Button>
                {!isVerified && (
                  <Text variant="caption" className="mt-2 text-center">
                    Complétez la vérification KYC pour demander un virement
                  </Text>
                )}
                {isVerified && availableBalance === 0 && (
                  <Text variant="caption" className="mt-2 text-center">
                    Aucun solde disponible pour le moment
                  </Text>
                )}
              </MotiView>

              <Pressable
                onPress={() => router.push("/transactions")}
                className="mt-2 flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 active:bg-muted"
              >
                <View className="flex-row items-center gap-3">
                  <Receipt size={18} color={colors.foreground} />
                  <Text className="font-medium">
                    Historique des transactions
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.mutedForeground} />
              </Pressable>
            </MotiView>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function BalanceCard({
  label,
  amount,
  accentClassName,
  hint,
}: {
  label: string;
  amount: number;
  accentClassName: string;
  hint?: string;
}) {
  return (
    <Card className="flex-1 p-4">
      <Text variant="caption" className="mb-1">
        {label}
      </Text>
      <Text className={`text-2xl font-bold ${accentClassName}`}>
        {formatPrice(amount)}
      </Text>
      {hint ? (
        <Text variant="caption" className="mt-1 text-[11px]">
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

function KycBadge({ status }: { status: KycStatus }) {
  const config = useKycConfig()[status];
  const Icon = config.Icon;
  return (
    <Badge variant={config.variant} className="flex-row items-center gap-1.5">
      <Icon size={12} color={config.color} />
      <Text
        className={`text-xs font-medium ${
          config.variant === "default"
            ? "text-primary-foreground"
            : config.variant === "destructive"
              ? "text-destructive"
              : "text-foreground"
        }`}
      >
        {config.label}
      </Text>
    </Badge>
  );
}

function WalletSkeleton() {
  return (
    <View className="gap-4">
      <View className="flex-row gap-3">
        <Skeleton className="h-24 flex-1 rounded-2xl" />
        <Skeleton className="h-24 flex-1 rounded-2xl" />
      </View>
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
    </View>
  );
}
