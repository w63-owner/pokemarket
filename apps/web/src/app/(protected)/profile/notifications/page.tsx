"use client";

import { useCallback, useEffect, useState } from "react";
import { m } from "framer-motion";
import {
  Bell,
  BellOff,
  Heart,
  MessageSquare,
  Search,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Json } from "@/types/database";
import type { PushNotificationCategory } from "@pokemarket/shared";

type PermissionState = "default" | "granted" | "denied";
type CategoryPreference = PushNotificationCategory;

const CATEGORY_META: Record<
  CategoryPreference,
  {
    label: string;
    description: string;
    icon: React.ReactNode;
  }
> = {
  messages: {
    label: "Nouveaux messages",
    description: "Quand un acheteur ou vendeur vous écrit",
    icon: <MessageSquare className="size-4" />,
  },
  offers: {
    label: "Offres reçues",
    description: "Quand une offre est créée ou acceptée",
    icon: <ShoppingCart className="size-4" />,
  },
  commerce: {
    label: "Achats / ventes",
    description: "Paiements, expéditions, litiges et confirmations",
    icon: <ShoppingBag className="size-4" />,
  },
  saved_searches: {
    label: "Recherches sauvegardées",
    description: "Quand de nouvelles cartes correspondent à vos alertes",
    icon: <Search className="size-4" />,
  },
  following: {
    label: "Vendeurs suivis",
    description: "Quand un vendeur suivi publie une annonce",
    icon: <Heart className="size-4" />,
  },
};

const DEFAULT_CATEGORY_PREFS: Record<CategoryPreference, boolean> = {
  messages: true,
  offers: true,
  commerce: true,
  saved_searches: true,
  following: true,
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<PermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [categoryPrefs, setCategoryPrefs] = useState(DEFAULT_CATEGORY_PREFS);
  const [savingCategory, setSavingCategory] =
    useState<CategoryPreference | null>(null);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (!isSupported) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    setPermission(Notification.permission as PermissionState);

    navigator.serviceWorker.ready.then(async (registration) => {
      const sub = await registration.pushManager.getSubscription();
      setIsSubscribed(!!sub);
      setLoading(false);
    });
  }, [isSupported]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notification_preferences")
      .select("category, enabled")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (error) {
          toast.error("Impossible de charger vos préférences.");
          return;
        }
        setCategoryPrefs((current) => {
          const next = { ...current };
          for (const row of data ?? []) {
            if (row.category in next) {
              next[row.category as CategoryPreference] = row.enabled;
            }
          }
          return next;
        });
      });
  }, [user]);

  const subscribe = useCallback(async () => {
    if (!vapidKey || !user) {
      toast.error("Les notifications push ne sont pas encore configurées.");
      return;
    }

    setToggling(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);

      if (perm !== "granted") {
        toast.error(
          "Vous devez autoriser les notifications dans votre navigateur.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const supabase = createClient();
      const subJson = subscription.toJSON();

      await supabase.from("push_subscriptions").delete().eq("user_id", user.id);

      const { error } = await supabase.from("push_subscriptions").insert({
        user_id: user.id,
        subscription: subJson as unknown as Json,
      });

      if (error) throw error;

      setIsSubscribed(true);
      toast.success("Notifications activées !");
    } catch {
      toast.error("Impossible d'activer les notifications.");
    } finally {
      setToggling(false);
    }
  }, [vapidKey, user]);

  const unsubscribe = useCallback(async () => {
    if (!user) return;

    setToggling(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      const supabase = createClient();
      await supabase.from("push_subscriptions").delete().eq("user_id", user.id);

      setIsSubscribed(false);
      toast.success("Notifications désactivées.");
    } catch {
      toast.error("Impossible de désactiver les notifications.");
    } finally {
      setToggling(false);
    }
  }, [user]);

  const handleToggle = useCallback(
    (checked: boolean) => {
      if (checked) {
        subscribe();
      } else {
        unsubscribe();
      }
    },
    [subscribe, unsubscribe],
  );

  const handleCategoryToggle = useCallback(
    async (category: CategoryPreference, enabled: boolean) => {
      if (!user) return;
      const previous = categoryPrefs[category];
      setCategoryPrefs((current) => ({ ...current, [category]: enabled }));
      setSavingCategory(category);

      const { error } = await createClient()
        .from("notification_preferences")
        .upsert(
          {
            user_id: user.id,
            category,
            enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,category" },
        );

      if (error) {
        setCategoryPrefs((current) => ({
          ...current,
          [category]: previous,
        }));
        toast.error("Impossible d'enregistrer cette préférence.");
      }
      setSavingCategory(null);
    },
    [categoryPrefs, user],
  );

  if (!isSupported && !loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <EmptyState
          icon={<BellOff className="size-8" />}
          title="Notifications non supportées"
          description="Votre navigateur ne supporte pas les notifications push. Essayez avec Chrome, Firefox ou Safari."
        />
      </div>
    );
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
            <Bell className="text-primary size-6" />
          </div>
          <h1 className="font-heading text-xl font-bold">Notifications</h1>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
                  <Smartphone className="text-muted-foreground size-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Notifications push</p>
                  <p className="text-muted-foreground text-xs">
                    {isSubscribed
                      ? "Vous recevez des notifications sur cet appareil"
                      : "Activez pour recevoir des alertes en temps réel"}
                  </p>
                </div>
                <Switch
                  checked={isSubscribed}
                  onCheckedChange={handleToggle}
                  disabled={toggling || permission === "denied"}
                />
              </CardContent>
            </Card>

            {permission === "denied" && (
              <p className="text-destructive bg-destructive/10 rounded-lg px-4 py-3 text-xs">
                Les notifications sont bloquées par votre navigateur. Allez dans
                les paramètres de votre navigateur pour réautoriser les
                notifications pour ce site.
              </p>
            )}

            <div className="pt-2">
              <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
                Vous serez notifié pour
              </p>
              <div className="space-y-1">
                {(
                  Object.entries(CATEGORY_META) as [
                    CategoryPreference,
                    (typeof CATEGORY_META)[CategoryPreference],
                  ][]
                ).map(([category, meta]) => (
                  <NotificationCategory
                    key={category}
                    icon={meta.icon}
                    label={meta.label}
                    description={meta.description}
                    enabled={isSubscribed && categoryPrefs[category]}
                    disabled={!isSubscribed || savingCategory !== null}
                    onEnabledChange={(enabled) =>
                      handleCategoryToggle(category, enabled)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </m.div>
    </div>
  );
}

function NotificationCategory({
  icon,
  label,
  description,
  enabled,
  disabled,
  onEnabledChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-opacity ${
        enabled ? "opacity-100" : "opacity-50"
      }`}
    >
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch
        checked={enabled}
        disabled={disabled}
        onCheckedChange={onEnabledChange}
        aria-label={label}
      />
    </div>
  );
}
