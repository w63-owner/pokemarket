import { View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { TrendingUp } from "lucide-react-native";
import { SmartBackButton, Text } from "@/components/ui";

/**
 * Price checking screen — placeholder, to be expanded in a later sprint
 * with the price history chart (victory-native).
 */
export default function PriceCheckingScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <SmartBackButton />
        <Text variant="h4">Cote des cartes</Text>
      </View>
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
          <TrendingUp size={28} color="#E63946" />
        </View>
        <Text variant="h4">Bientôt disponible</Text>
        <Text variant="muted" className="text-center">
          La cote des cartes Pokémon arrive prochainement sur mobile. Pour
          l&apos;instant, tu peux la consulter sur pokemarket.app.
        </Text>
      </View>
    </SafeAreaView>
  );
}
