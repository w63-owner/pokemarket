import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import {
  Bell,
  BellOff,
  Heart,
  MessageSquare,
  Search,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react-native";
import { queryKeys } from "@pokemarket/shared";

import {
  fetchNotificationPreferences,
  upsertNotificationPreference,
  type NotificationPrefCategory,
} from "@/lib/api/notification-preferences";
import { registerPushToken, unregisterPushToken } from "@/lib/notifications";
import { Card, Skeleton, Switch, Text, toast } from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { useAuth } from "@/hooks/use-auth";

type Status = "loading" | "granted" | "denied" | "undetermined" | "unsupported";

const CATEGORY_ORDER: NotificationPrefCategory[] = [
  "messages",
  "offers",
  "commerce",
  "saved_searches",
  "following",
];

const CATEGORY_META: Record<
  NotificationPrefCategory,
  { label: string; description: string; Icon: typeof MessageSquare }
> = {
  messages: {
    label: "Nouveaux messages",
    description: "Quand un acheteur ou vendeur vous écrit.",
    Icon: MessageSquare,
  },
  offers: {
    label: "Offres reçues",
    description: "Quand quelqu'un fait ou accepte une offre sur vos annonces.",
    Icon: ShoppingCart,
  },
  commerce: {
    label: "Achats / ventes",
    description: "Paiements, expéditions, litiges et confirmations.",
    Icon: ShoppingBag,
  },
  saved_searches: {
    label: "Recherches sauvegardées",
    description: "Quand de nouvelles cartes correspondent à vos alertes.",
    Icon: Search,
  },
  following: {
    label: "Vendeurs suivis",
    description: "Quand un vendeur que vous suivez publie une annonce.",
    Icon: Heart,
  },
};

const DEFAULT_CATEGORY_STATE = (): Record<
  NotificationPrefCategory,
  boolean
> => ({
  commerce: true,
  messages: true,
  offers: true,
  saved_searches: true,
  following: true,
});

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [togglingPush, setTogglingPush] = useState(false);

  const {
    data: categoryPrefs,
    isLoading: loadingPrefs,
    error: prefsError,
  } = useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: fetchNotificationPreferences,
    enabled: !!user,
  });

  const prefMutation = useMutation({
    mutationFn: ({
      category,
      enabled,
    }: {
      category: NotificationPrefCategory;
      enabled: boolean;
    }) => upsertNotificationPreference({ category, enabled }),
    onMutate: async ({ category, enabled }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.preferences(),
      });
      queryClient.setQueryData<Record<NotificationPrefCategory, boolean>>(
        queryKeys.notifications.preferences(),
        (old) => {
          const prev = old ?? DEFAULT_CATEGORY_STATE();
          return { ...prev, [category]: enabled };
        },
      );
    },
    onError: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.preferences(),
      });
      toast.error(
        "Sauvegarde impossible",
        "Réessayez dans un instant après reconnexion.",
      );
    },
  });

  const refreshPermissions = useCallback(async () => {
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
    refreshPermissions();
  }, [refreshPermissions]);

  const handlePushToggle = useCallback(async (next: boolean) => {
    setTogglingPush(true);
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
      setTogglingPush(false);
    }
  }, []);

  const displayPrefs = categoryPrefs ?? DEFAULT_CATEGORY_STATE();

  const onCategoryToggle = useCallback(
    (category: NotificationPrefCategory, next: boolean) => {
      prefMutation.mutate({ category, enabled: next });
    },
    [prefMutation],
  );

  const showSkeleton =
    status === "loading" ||
    (status === "granted" && !!user && loadingPrefs && !prefsError);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader title="Notifications" fallbackHref="/(tabs)/profile" />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {showSkeleton ? (
          <View className="gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
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
                  onCheckedChange={handlePushToggle}
                  disabled={
                    togglingPush ||
                    status === "denied" ||
                    status === "unsupported"
                  }
                />
              </View>
            </Card>

            {prefsError ? (
              <Card>
                <Text className="text-sm text-destructive">
                  Impossible de charger vos préférences. Elles sont réappliquées
                  automatiquement à la prochaine connexion.
                </Text>
              </Card>
            ) : null}

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
                {CATEGORY_ORDER.map((key, idx) => {
                  const meta = CATEGORY_META[key];
                  const Icon = meta.Icon;

                  return (
                    <View key={key}>
                      {idx > 0 ? (
                        <View className="my-2 h-px bg-border" />
                      ) : null}
                      <View
                        className="flex-row items-center gap-4"
                        style={{
                          opacity: status === "granted" ? 1 : 0.5,
                        }}
                      >
                        <View className="h-11 w-11 items-center justify-center rounded-xl bg-muted">
                          <Icon size={18} color="#475569" />
                        </View>
                        <View className="flex-1">
                          <Text className="font-medium">{meta.label}</Text>
                          <Text variant="muted" className="text-xs">
                            {meta.description}
                          </Text>
                        </View>
                        <Switch
                          checked={
                            status === "granted" ? displayPrefs[key] : false
                          }
                          disabled={
                            status !== "granted" ||
                            loadingPrefs ||
                            prefMutation.isPending ||
                            !user
                          }
                          onCheckedChange={(next) => {
                            if (status !== "granted" || !user) return;
                            onCategoryToggle(key, next);
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
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
    </View>
  );
}
