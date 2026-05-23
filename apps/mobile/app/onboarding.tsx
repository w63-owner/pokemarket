import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MotiView } from "moti";
import { Camera, ShieldCheck, Wallet as WalletIcon } from "lucide-react-native";

import { Button, Text } from "@/components/ui";
import { haptics } from "@/lib/haptics";

export const ONBOARDING_DONE_KEY = "pokemarket.onboarding.done";

const SLIDES = [
  {
    icon: Camera,
    title: "Vendez en quelques secondes",
    description:
      "Photographiez votre carte, l'IA reconnaît automatiquement le set, le numéro et la rareté pour préremplir votre annonce.",
    accent: "#E63946",
  },
  {
    icon: ShieldCheck,
    title: "Achats 100% sécurisés",
    description:
      "Votre paiement est conservé en escrow jusqu'à confirmation de la réception. Litiges gérés par notre équipe.",
    accent: "#2563eb",
  },
  {
    icon: WalletIcon,
    title: "Recevez vos gains rapidement",
    description:
      "Virement automatique sur votre compte bancaire dès la confirmation de l'acheteur, en moins de 48h.",
    accent: "#16a34a",
  },
];

const { width } = Dimensions.get("window");

async function markOnboardingDone() {
  try {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {
    // ignore — onboarding will replay next launch, which is non-fatal
  }
}

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = event.nativeEvent.contentOffset.x;
      const next = Math.round(x / width);
      if (next !== index) {
        setIndex(next);
        haptics.selection();
      }
    },
    [index],
  );

  const goNext = useCallback(async () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
      return;
    }
    haptics.success();
    await markOnboardingDone();
    router.replace("/(auth)/login");
  }, [index]);

  const skip = useCallback(async () => {
    await markOnboardingDone();
    router.replace("/(auth)/login");
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="items-end px-4 pt-2">
        <Pressable hitSlop={8} onPress={skip}>
          <Text variant="muted" className="text-sm">
            Passer
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {SLIDES.map((slide, i) => {
          const Icon = slide.icon;
          return (
            <View
              key={slide.title}
              style={{ width }}
              className="items-center justify-center px-8"
            >
              <MotiView
                from={{ opacity: 0, scale: 0.85 }}
                animate={{
                  opacity: i === index ? 1 : 0.4,
                  scale: i === index ? 1 : 0.9,
                }}
                transition={{ type: "timing", duration: 250 }}
                className="mb-10 h-32 w-32 items-center justify-center rounded-full"
                style={{ backgroundColor: `${slide.accent}1A` }}
              >
                <Icon size={56} color={slide.accent} strokeWidth={1.5} />
              </MotiView>
              <Text variant="h2" className="mb-3 text-center">
                {slide.title}
              </Text>
              <Text variant="muted" className="text-center text-base">
                {slide.description}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View className="px-6 pb-6">
        <View className="mb-6 flex-row items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <MotiView
              key={i}
              animate={{
                width: i === index ? 24 : 8,
                opacity: i === index ? 1 : 0.4,
              }}
              transition={{ type: "timing", duration: 200 }}
              className="h-2 rounded-full bg-primary"
            />
          ))}
        </View>

        <Button onPress={goNext} size="lg">
          {index === SLIDES.length - 1 ? "Commencer" : "Suivant"}
        </Button>
      </View>
    </SafeAreaView>
  );
}
