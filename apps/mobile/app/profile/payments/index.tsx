import { ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { CreditCard, Plus, ShieldCheck } from "lucide-react-native";

import {
  fetchPaymentMethods,
  type PaymentMethod,
} from "@/lib/api/payment-methods";
import { Button, Card, Skeleton, SmartBackButton, Text } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

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
  const {
    data: cards,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["paymentMethods", "list"],
    queryFn: fetchPaymentMethods,
  });

  const muted = useThemeColor("mutedForeground");

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center justify-between border-b border-border bg-card px-2 py-3">
        <View className="flex-row items-center gap-3">
          <SmartBackButton fallbackHref="/(tabs)/profile" />
          <Text className="text-base font-semibold">Moyens de paiement</Text>
        </View>
        <View className="mr-2">
          <Button
            size="sm"
            onPress={() => router.push("/profile/payments/new" as never)}
            leftIcon={<Plus size={16} color="#fff" />}
          >
            Ajouter
          </Button>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {isLoading ? (
          <>
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </>
        ) : error ? (
          <View className="items-center gap-2 py-12">
            <Text variant="muted">Erreur lors du chargement.</Text>
          </View>
        ) : !cards || cards.length === 0 ? (
          <EmptyState mutedColor={muted} />
        ) : (
          cards.map((card, i) => (
            <MotiView
              key={card.id}
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ delay: i * 50 }}
            >
              <CardRow card={card} mutedColor={muted} />
            </MotiView>
          ))
        )}

        <View className="mt-2 flex-row items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <ShieldCheck size={20} color="#E63946" />
          <Text className="flex-1 text-xs leading-5 text-muted-foreground">
            Vos informations bancaires sont stockées de manière sécurisée par
            Stripe. PokeMarket ne voit ni ne stocke jamais votre numéro de
            carte.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CardRow({
  card,
  mutedColor,
}: {
  card: PaymentMethod;
  mutedColor: string;
}) {
  return (
    <Card>
      <View className="flex-row items-center gap-4">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <CreditCard size={20} color={mutedColor} />
        </View>
        <View className="flex-1">
          <Text className="font-semibold">
            {brandLabel(card.brand)} •••• {card.last4}
          </Text>
          {card.exp_month != null && card.exp_year != null ? (
            <Text variant="caption">
              Expire {String(card.exp_month).padStart(2, "0")}/{card.exp_year}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function EmptyState({ mutedColor }: { mutedColor: string }) {
  return (
    <View className="items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-12">
      <View className="rounded-full bg-muted p-3">
        <CreditCard size={28} color={mutedColor} />
      </View>
      <Text className="text-base font-semibold">
        Aucune carte enregistrée
      </Text>
      <Text variant="muted" className="text-center">
        Ajoutez une carte bancaire pour vos futurs achats — vous pourrez payer
        plus rapidement la prochaine fois.
      </Text>
      <Button
        className="mt-2"
        onPress={() => router.push("/profile/payments/new" as never)}
        leftIcon={<Plus size={16} color="#fff" />}
      >
        Ajouter une carte
      </Button>
    </View>
  );
}
