import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import {
  Bell,
  BellOff,
  MessageSquare,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react-native";

import {
  Card,
  Skeleton,
  SmartBackButton,
  Switch,
  Text,
  toast,
} from "@/components/ui";
import { registerPushToken, unregisterPushToken } from "@/lib/notifications";

type Status = "loading" | "granted" | "denied" | "undetermined" | "unsupported";

export default function NotificationsScreen() {
  const [status, setStatus] = useState<Status>("loading");
  const [toggling, setToggling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { status: perm } = await Notifications.getPermissionsAsync();
      if (perm === "granted") setStatus("granted");
      else if (perm === "denied") setStatus("denied");
      else setStatus("undetermined");
    } catch {
      setStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggle = useCallback(async (next: boolean) => {
    setToggling(true);
    try {
      if (next) {
        const result = await registerPushToken();
        if (result.ok) {
          setStatus("granted");
          toast.success("Notifications activées");
        } else if (result.reason === "denied") {
          setStatus("denied");
          toast.error(
            "Permission refusée",
            "Activez les notifications dans les réglages système.",
          );
        } else if (result.reason === "unsupported") {
          toast.error(
            "Non supporté ici",
            "Les notifications push nécessitent un build natif (pas Expo Go).",
          );
        } else {
          toast.error("Activation impossible", result.message);
        }
      } else {
        await unregisterPushToken();
        setStatus("undetermined");
        toast.success("Notifications désactivées");
      }
    } finally {
      setToggling(false);
    }
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-2">
        <SmartBackButton fallbackHref="/(tabs)/profile" />
        <Text variant="h3">Notifications</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {status === "loading" ? (
          <View className="gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </View>
        ) : (
          <>
            <Card>
              <View className="flex-row items-center gap-4">
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-muted">
                  {status === "granted" ? (
                    <Bell size={22} color="#0f172a" />
                  ) : (
                    <BellOff size={22} color="#94a3b8" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-semibold">Notifications push</Text>
                  <Text variant="muted" className="text-xs">
                    {status === "granted"
                      ? "Activées sur cet appareil"
                      : status === "denied"
                        ? "Bloquées par les réglages système"
                        : "Recevez les alertes en temps réel"}
                  </Text>
                </View>
                <Switch
                  checked={status === "granted"}
                  onCheckedChange={handleToggle}
                  disabled={
                    toggling || status === "denied" || status === "unsupported"
                  }
                />
              </View>
            </Card>

            {status === "denied" ? (
              <Card>
                <Text className="text-sm text-destructive">
                  Les notifications sont bloquées. Ouvrez les réglages pour les
                  réautoriser.
                </Text>
                <Pressable
                  onPress={() => Linking.openSettings()}
                  className="mt-3 self-start rounded-full bg-primary px-4 py-2 active:opacity-80"
                >
                  <Text className="font-semibold text-white">
                    Ouvrir les réglages
                  </Text>
                </Pressable>
              </Card>
            ) : null}

            <View className="gap-1">
              <Text
                variant="caption"
                className="px-1 uppercase tracking-wider text-muted-foreground"
              >
                Vous serez notifié pour
              </Text>
              <Card>
                <Category
                  icon={<MessageSquare size={18} color="#475569" />}
                  label="Nouveaux messages"
                  description="Quand un acheteur ou vendeur vous écrit."
                  enabled={status === "granted"}
                />
                <View className="my-2 h-px bg-border" />
                <Category
                  icon={<ShoppingCart size={18} color="#475569" />}
                  label="Offres reçues"
                  description="Quand quelqu'un fait une offre sur vos annonces."
                  enabled={status === "granted"}
                />
                <View className="my-2 h-px bg-border" />
                <Category
                  icon={<ShoppingBag size={18} color="#475569" />}
                  label="Achats / ventes"
                  description="Paiements, expéditions, litiges et confirmations."
                  enabled={status === "granted"}
                />
              </Card>
            </View>

            <Text variant="caption" className="px-1 text-muted-foreground">
              Plateforme :{" "}
              {Platform.OS === "ios"
                ? "iOS (APNs via Expo)"
                : "Android (FCM via Expo)"}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Category({
  icon,
  label,
  description,
  enabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
}) {
  return (
    <View
      className="flex-row items-start gap-3"
      style={{ opacity: enabled ? 1 : 0.5 }}
    >
      <View className="mt-0.5">{icon}</View>
      <View className="flex-1">
        <Text className="font-medium">{label}</Text>
        <Text variant="muted" className="text-xs">
          {description}
        </Text>
      </View>
    </View>
  );
}
