import { useEffect, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import ConfettiCannon from "react-native-confetti-cannon";
import { CheckCircle2, Home, ShoppingBag, Sparkles } from "lucide-react-native";
import { formatPrice, queryKeys } from "@pokemarket/shared";

import {
  fetchTransactionForBuyer,
  reconcileMobileOrder,
} from "@/lib/api/checkout";
import { Button, Skeleton, Text } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { spring, useReducedMotionSafe } from "@/lib/motion";
import { useThemeColors } from "@/lib/theme-colors";

// Brand-tinted palette for the confetti burst — mirrors the web
// `canvas-confetti` colours used on the success page.
const CONFETTI_COLORS = [
  "#E63946", // brand red
  "#F4A261", // brand accent (orange)
  "#FFD166", // warm yellow
  "#06D6A0", // success green
  "#118AB2", // brand secondary blue
];

const STATUS_COPY: Record<string, { title: string; description: string }> = {
  PAID: {
    title: "Commande confirmée !",
    description:
      "Votre paiement est en cours de validation. Le vendeur sera notifié et préparera l'envoi de votre carte.",
  },
  SHIPPED: {
    title: "Commande expédiée",
    description:
      "Votre carte a été expédiée ! Vous recevrez bientôt votre colis.",
  },
  COMPLETED: {
    title: "Vente terminée",
    description: "Cette vente est terminée. Merci pour votre achat !",
  },
};

const FRESH_STATUSES = new Set(["PAID", "PENDING_PAYMENT"]);

function getStatusCopy(status: string) {
  return (
    STATUS_COPY[status] ?? {
      title: "Détail de la commande",
      description: `Statut actuel : ${status.toLowerCase().replace("_", " ")}.`,
    }
  );
}

/**
 * Order success screen reached after PaymentSheet (Stripe) succeeds or
 * MangoPay 3DS resolves. The webhook is what actually flips the
 * transaction to PAID server-side, so we poll the transaction with a
 * short interval until we observe the PAID status (or give up after 3
 * polls and show "Paiement en cours de validation").
 */
export default function OrderSuccessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pollCount, setPollCount] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotionSafe();
  const [confettiVisible, setConfettiVisible] = useState(false);
  const colors = useThemeColors();
  const queryClient = useQueryClient();

  const { data: transaction, isLoading } = useQuery({
    queryKey: ["transactions", "buyer", id],
    queryFn: () => fetchTransactionForBuyer(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1500;
      // Stop polling once we observe PAID — the webhook caught up.
      if (data.status !== "PENDING_PAYMENT") return false;
      // Webhook can lag a few seconds. We poll up to ~10 seconds, then
      // optimistically render the success UI anyway (the buyer's payment
      // was confirmed by Stripe client-side).
      return pollCount > 6 ? false : 1500;
    },
  });

  // Server-side reconcile fallback. The mobile PaymentSheet flow uses
  // direct PaymentIntents, so the `payment_intent.succeeded` webhook is
  // what flips PENDING_PAYMENT → PAID. Webhooks can lag (especially in
  // local dev where `stripe listen` isn't always running), leaving the
  // buyer stuck on "En attente de paiement" in their purchases list.
  // Calling reconcile asks the server to query Stripe directly and run
  // the same finalize side-effects the webhook would. Idempotent: a
  // concurrent webhook still wins exactly-once via the atomic PAID
  // transition guard in `finalizePaidTransaction`.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    reconcileMobileOrder(id)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "PAID") {
          // Refresh the buyer's transaction immediately so the success UI
          // stops polling AND invalidate the purchases list so navigating
          // back to Profile → "Mes achats" doesn't show a stale
          // PENDING_PAYMENT badge.
          queryClient.invalidateQueries({
            queryKey: ["transactions", "buyer", id],
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.transactions.purchases(),
          });
        }
      })
      .catch(() => {
        // Best-effort — polling below will surface the eventual PAID
        // state once the webhook catches up.
      });
    return () => {
      cancelled = true;
    };
  }, [id, queryClient]);

  useEffect(() => {
    if (transaction?.status === "PENDING_PAYMENT") {
      const id = setTimeout(() => setPollCount((n) => n + 1), 1500);
      return () => clearTimeout(id);
    }
  }, [transaction]);

  // Trigger an Apple Pay-style success haptic exactly once when the success
  // copy first becomes visible. We don't want to retrigger on each refetch.
  // The same flag also gates the confetti cannon so a buyer who briefly
  // navigates back to this screen doesn't get a second burst.
  const successFiredRef = useRef(false);
  useEffect(() => {
    if (successFiredRef.current) return;
    const shouldFire =
      (transaction?.status && transaction.status !== "PENDING_PAYMENT") ||
      (transaction?.status === "PENDING_PAYMENT" && pollCount > 6);
    if (shouldFire) {
      successFiredRef.current = true;
      haptic("success");
      if (!reduceMotion) setConfettiVisible(true);
    }
  }, [transaction, pollCount, reduceMotion]);

  if (isLoading || !transaction) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="gap-3 p-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-6 w-2/3 self-center" />
          <Skeleton className="h-4 w-1/2 self-center" />
        </View>
      </SafeAreaView>
    );
  }

  // Treat both PAID and the temporarily-still-PENDING_PAYMENT (waiting on
  // webhook) the same in the UI so the buyer sees the success state
  // without a confusing "pending" delay.
  const rawStatus = transaction.status ?? "PENDING_PAYMENT";
  const observedStatus = rawStatus === "PENDING_PAYMENT" ? "PAID" : rawStatus;
  const isFresh = FRESH_STATUSES.has(observedStatus);
  const copy = getStatusCopy(observedStatus);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      {confettiVisible ? (
        // Top-centre cannon firing downward — frames the hero check icon.
        // `fadeOut` lets the particles dim into the background instead of
        // hard-clipping; `autoStart` triggers the burst as soon as the
        // node mounts (right after we set `confettiVisible = true`).
        <ConfettiCannon
          count={140}
          origin={{ x: screenWidth / 2, y: -20 }}
          explosionSpeed={420}
          fallSpeed={2600}
          fadeOut
          colors={CONFETTI_COLORS}
        />
      ) : null}
      <View className="flex-1 items-center justify-center px-6">
        <MotiView
          from={{ opacity: 0, scale: 0.8, translateY: 30 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={spring.gentle}
          className="w-full max-w-md items-center"
        >
          <MotiView
            from={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ ...spring.bouncy, delay: 200 }}
            className="mb-6 items-center justify-center rounded-full bg-primary/10 p-5"
          >
            <View className="relative">
              <CheckCircle2
                size={64}
                color={colors.primary}
                strokeWidth={1.5}
              />
              {isFresh ? (
                <MotiView
                  from={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 500 }}
                  className="absolute -right-1 -top-1"
                >
                  <Sparkles size={24} color={colors.warning} />
                </MotiView>
              ) : null}
            </View>
          </MotiView>

          <Text variant="h2" className="mb-2 text-center">
            {copy.title}
          </Text>

          <Text variant="muted" className="mb-6 text-center">
            {isFresh
              ? `Votre paiement de ${formatPrice(transaction.total_amount)} est en cours de validation. Le vendeur sera notifié et préparera l'envoi de votre carte.`
              : copy.description}
          </Text>

          {transaction.listing_title ? (
            <View className="mb-6 w-full rounded-xl border border-border bg-muted/40 px-4 py-3">
              <Text variant="caption">Article</Text>
              <Text className="font-semibold">{transaction.listing_title}</Text>
            </View>
          ) : null}

          <View className="w-full gap-3">
            <Button
              size="lg"
              onPress={() => router.replace("/(tabs)/profile" as never)}
              leftIcon={
                <ShoppingBag size={18} color={colors.primaryForeground} />
              }
            >
              Voir mes achats
            </Button>
            <Button
              variant="outline"
              size="lg"
              onPress={() => router.replace("/(tabs)" as never)}
              leftIcon={<Home size={18} color={colors.foreground} />}
            >
              Retour à l&apos;accueil
            </Button>
          </View>
        </MotiView>
      </View>
    </SafeAreaView>
  );
}
