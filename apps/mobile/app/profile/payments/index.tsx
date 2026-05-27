import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { MotiView } from "moti";
import { CreditCard, Plus, ShieldCheck } from "lucide-react-native";
import { queryKeys } from "@pokemarket/shared";

import {
  deletePaymentMethod,
  fetchPaymentMethods,
  setDefaultPaymentMethod,
  type PaymentMethod,
} from "@/lib/api/payment-methods";
import { ApiError } from "@/lib/api/client";
import { ErrorState } from "@/components/shared";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Text,
  toast,
} from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { fadeInUp, staggerDelay } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

// Custom: swipe-to-delete needs a slightly tighter spring than
// `spring.snappy` (400/30) so the row settles back fast under flick
// gestures without overshoot — 380/28 keeps the snap-back crisp while
// matching the system-wide spring vocabulary in feel.
const SWIPE_SPRING = { damping: 28, stiffness: 380 };
const SWIPE_MAX_SHIFT = 56;
const DELETE_THRESHOLD = -36;

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

function brandLabel(brand: string | null) {
  if (!brand) return "Carte";
  return BRAND_LABELS[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

export default function PaymentsScreen() {
  const queryClient = useQueryClient();
  const {
    data: cards,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.paymentMethods.list(),
    queryFn: fetchPaymentMethods,
  });

  const muted = useThemeColor("mutedForeground");
  const primary = useThemeColor("primary");
  const onPrimary = useThemeColor("primaryForeground");

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader
        title="Moyens de paiement"
        fallbackHref="/(tabs)/profile"
        rightAction={
          <Button
            size="sm"
            onPress={() => router.push("/profile/payments/new" as never)}
            leftIcon={<Plus size={16} color={onPrimary} />}
          >
            Ajouter
          </Button>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {isLoading ? (
          <>
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </>
        ) : error ? (
          <ErrorState
            variant="card"
            title="Impossible de charger vos cartes"
            description={
              error instanceof Error ? error.message : "Réessayez plus tard."
            }
            action={{
              label: "Réessayer",
              onPress: () =>
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.paymentMethods.list(),
                }),
            }}
          />
        ) : !cards || cards.length === 0 ? (
          <PaymentsEmptyState mutedColor={muted} onPrimary={onPrimary} />
        ) : (
          cards.map((card, i) => (
            <MotiView
              key={card.id}
              from={fadeInUp.from}
              animate={fadeInUp.animate}
              transition={{
                ...(fadeInUp.transition as object),
                delay: staggerDelay(i, 50, 10),
              }}
            >
              <SwipePaymentCard card={card} mutedColor={muted} />
            </MotiView>
          ))
        )}

        <View className="mt-2 flex-row items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <ShieldCheck size={20} color={primary} />
          <Text className="flex-1 text-xs leading-5 text-muted-foreground">
            Vos informations bancaires sont stockées de manière sécurisée par
            Stripe. PokeMarket ne voit ni ne stocke jamais votre numéro de
            carte.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SwipePaymentCard({
  card,
  mutedColor,
}: {
  card: PaymentMethod;
  mutedColor: string;
}) {
  const qc = useQueryClient();
  const translateX = useSharedValue(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, SWIPE_SPRING);
  }, [translateX]);

  const deleteMutation = useMutation({
    mutationFn: () => deletePaymentMethod(card.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.paymentMethods.list() });
      toast.success("Carte supprimée");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError ? err.message : "Impossible de supprimer.";
      toast.error("Erreur", msg);
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: () => setDefaultPaymentMethod(card.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.paymentMethods.list() });
      toast.success("Carte par défaut mise à jour");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError ? err.message : "Impossible de mettre à jour.";
      toast.error("Erreur", msg);
    },
  });

  const promptDelete = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setConfirmOpen(false);
    resetPosition();
  }, [resetPosition]);

  const handleConfirmDelete = useCallback(() => {
    setConfirmOpen(false);
    resetPosition();
    deleteMutation.mutate();
  }, [deleteMutation, resetPosition]);

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const pan = Gesture.Pan()
    .activeOffsetX(-14)
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      const next = Math.min(0, Math.max(-SWIPE_MAX_SHIFT, e.translationX));
      translateX.value = next;
    })
    .onEnd(() => {
      const shouldPrompt = translateX.value <= DELETE_THRESHOLD;
      translateX.value = withSpring(0, SWIPE_SPRING);
      if (shouldPrompt) {
        runOnJS(promptDelete)();
      }
    });

  return (
    <>
      <GestureDetector gesture={pan}>
        <Animated.View style={animatedRowStyle} className="rounded-xl">
          <Card>
            <View className="gap-3">
              <View className="flex-row items-center gap-4">
                <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <CreditCard size={20} color={mutedColor} />
                </View>
                <View className="flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="font-semibold">
                      {brandLabel(card.brand)} •••• {card.last4}
                    </Text>
                    {card.is_default ? (
                      <Badge variant="secondary" className="px-2 py-0">
                        <Text className="text-[10px] font-medium">
                          Par défaut
                        </Text>
                      </Badge>
                    ) : null}
                  </View>
                  {card.exp_month != null && card.exp_year != null ? (
                    <Text variant="caption">
                      Expire {String(card.exp_month).padStart(2, "0")}/
                      {card.exp_year}
                    </Text>
                  ) : null}
                </View>
              </View>

              {!card.is_default ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  loading={setDefaultMutation.isPending}
                  disabled={setDefaultMutation.isPending}
                  onPress={() => setDefaultMutation.mutate()}
                >
                  Définir par défaut
                </Button>
              ) : null}

              <Text variant="caption" className="text-muted-foreground">
                Glisse vers la gauche pour supprimer.
              </Text>
            </View>
          </Card>
        </Animated.View>
      </GestureDetector>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) handleCancelDelete();
        }}
      >
        <DialogHeader>
          <DialogTitle>Supprimer cette carte ?</DialogTitle>
          <DialogDescription>
            Tu pourras enregistrer une nouvelle carte à tout moment.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onPress={handleCancelDelete}>
            Annuler
          </Button>
          <Button variant="destructive" onPress={handleConfirmDelete}>
            Supprimer
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function PaymentsEmptyState({
  mutedColor,
  onPrimary,
}: {
  mutedColor: string;
  onPrimary: string;
}) {
  return (
    <View className="items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-12">
      <View className="rounded-full bg-muted p-3">
        <CreditCard size={28} color={mutedColor} />
      </View>
      <Text className="text-base font-semibold">Aucune carte enregistrée</Text>
      <Text variant="muted" className="text-center">
        Ajoutez une carte bancaire pour vos futurs achats — vous pourrez payer
        plus rapidement la prochaine fois.
      </Text>
      <Button
        className="mt-2"
        onPress={() => router.push("/profile/payments/new" as never)}
        leftIcon={<Plus size={16} color={onPrimary} />}
      >
        Ajouter une carte
      </Button>
    </View>
  );
}
