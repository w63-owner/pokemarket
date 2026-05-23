import { View } from "react-native";
import { Stack } from "expo-router";
import { TrendingUp } from "lucide-react-native";
import { Text } from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { useThemeColor } from "@/lib/theme-colors";

/**
 * Price checking screen — placeholder, to be expanded in a later sprint
 * with the price history chart (victory-native).
 */
export default function PriceCheckingScreen() {
  const brand = useThemeColor("brand");
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <MobileHeader title="Cote des cartes" fallbackHref="/(tabs)/profile" />
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
          <TrendingUp size={28} color={brand} />
        </View>
        <Text variant="h4">Bientôt disponible</Text>
        <Text variant="muted" className="text-center">
          La cote des cartes Pokémon arrive prochainement sur mobile. Pour
          l&apos;instant, tu peux la consulter sur pokemarket.app.
        </Text>
      </View>
    </View>
  );
}
