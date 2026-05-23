import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { MotiView } from "moti";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  CreditCard,
  ChevronRight,
  FileText,
  Fingerprint,
  Heart,
  Info,
  ListChecks,
  LogOut,
  Moon,
  Receipt,
  Scale,
  ShieldCheck,
  Sun,
  TrendingUp,
  User as UserIcon,
  Wallet,
} from "lucide-react-native";
import { Avatar, Card, Skeleton, Switch, Text, toast } from "@/components/ui";
import { AuthRequired } from "@/components/shared";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import {
  disableBiometry,
  enableBiometryForCurrentSession,
  getBiometryCapability,
  isBiometryEnabled,
} from "@/lib/biometry";
import { tapScale } from "@/lib/motion";
import { useEffectiveTheme, useThemeStore } from "@/lib/stores/theme";
import { useThemeColor } from "@/lib/theme-colors";

const accountItems = [
  { icon: UserIcon, label: "Mon profil", href: "/profile/edit" },
  { icon: ListChecks, label: "Mes annonces", href: "/profile/listings" },
  { icon: Heart, label: "Favoris", href: "/favorites" },
  { icon: Receipt, label: "Mes achats / ventes", href: "/transactions" },
  { icon: Wallet, label: "Mon portefeuille", href: "/wallet" },
  { icon: CreditCard, label: "Moyens de paiement", href: "/profile/payments" },
  { icon: Bell, label: "Notifications", href: "/profile/notifications" },
  { icon: TrendingUp, label: "Cote des cartes", href: "/price-checking" },
] as const;

const legalItems = [
  { icon: FileText, label: "CGV", href: "/legal/cgv" },
  { icon: Scale, label: "CGU", href: "/legal/cgu" },
  { icon: ShieldCheck, label: "Confidentialité", href: "/legal/privacy" },
  { icon: Info, label: "Mentions légales", href: "/legal/mentions" },
] as const;

export default function ProfileScreen() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { data: profile, isLoading } = useMyProfile();

  const effectiveTheme = useEffectiveTheme();
  const setThemePreference = useThemeStore((s) => s.setPreference);

  const iconForeground = useThemeColor("foreground");
  const iconMuted = useThemeColor("mutedForeground");
  const destructive = useThemeColor("destructive");
  const primary = useThemeColor("primary");

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biométrie");
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([isBiometryEnabled(), getBiometryCapability()]).then(
      ([enabled, capability]) => {
        if (cancelled) return;
        setBiometricEnabled(enabled);
        setBiometricLabel(capability.label);
        setBiometricSupported(capability.hasHardware && capability.isEnrolled);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleBiometric = async (next: boolean) => {
    setBiometricBusy(true);
    try {
      if (next) {
        const result = await enableBiometryForCurrentSession();
        if (result.ok) {
          setBiometricEnabled(true);
          toast.success(`${biometricLabel} activé`);
        } else {
          toast.error("Activation impossible", result.reason);
        }
      } else {
        await disableBiometry();
        setBiometricEnabled(false);
        toast.success(`${biometricLabel} désactivé`);
      }
    } finally {
      setBiometricBusy(false);
    }
  };

  // Never render the profile content while we don't have a confirmed
  // authenticated user — otherwise the profile card / menu rows would
  // flash for a frame before the AuthRequired empty state appears.
  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="border-b border-border bg-background px-4 pb-3 pt-2">
          <Text variant="h2">Profil</Text>
        </View>
        {authLoading ? null : (
          <View className="flex-1 items-center justify-center">
            <AuthRequired
              icon={<UserIcon size={28} color={primary} />}
              title="Connecte-toi pour accéder à tes informations"
              description="Retrouve ton profil, tes annonces, ton portefeuille et tes paramètres."
            />
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Animated.ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Card>
          {isLoading ? (
            <View className="flex-row items-center gap-3">
              <Skeleton className="h-16 w-16 rounded-full" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </View>
            </View>
          ) : profile ? (
            <View className="flex-row items-center gap-3">
              <Avatar
                uri={profile.avatar_url}
                fallback={profile.username ?? user?.email ?? "?"}
                size={64}
              />
              <View className="flex-1">
                <Text variant="h4">@{profile.username ?? "—"}</Text>
                <Text variant="muted">{user?.email}</Text>
              </View>
            </View>
          ) : null}
        </Card>

        <MenuList>
          {accountItems.map((item, idx) => {
            const Icon = item.icon;
            const isLast = idx === accountItems.length - 1;
            return (
              <MenuRow
                key={item.href}
                icon={<Icon size={20} color={iconForeground} />}
                label={item.label}
                onPress={() => router.push(item.href as never)}
                isLast={isLast}
                chevronColor={iconMuted}
              />
            );
          })}
        </MenuList>

        <Card>
          <View className="flex-row items-center gap-3">
            {effectiveTheme === "dark" ? (
              <Moon size={20} color={iconForeground} />
            ) : (
              <Sun size={20} color={iconForeground} />
            )}
            <View className="flex-1">
              <Text className="font-semibold">Mode sombre</Text>
              <Text variant="muted" className="text-xs">
                {effectiveTheme === "dark" ? "Activé" : "Désactivé"}
              </Text>
            </View>
            <Switch
              checked={effectiveTheme === "dark"}
              onCheckedChange={(checked) =>
                setThemePreference(checked ? "dark" : "light")
              }
            />
          </View>
        </Card>

        {biometricSupported ? (
          <Card>
            <View className="flex-row items-center gap-3">
              <Fingerprint size={20} color={iconForeground} />
              <View className="flex-1">
                <Text className="font-semibold">
                  Connexion par {biometricLabel}
                </Text>
                <Text variant="muted" className="text-xs">
                  Déverrouille l&apos;app sans saisir ton mot de passe.
                </Text>
              </View>
              <Switch
                checked={biometricEnabled}
                onCheckedChange={handleToggleBiometric}
                disabled={biometricBusy}
              />
            </View>
          </Card>
        ) : null}

        <Pressable
          onPress={async () => {
            await signOut();
            router.replace("/(auth)/login");
          }}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-card p-3.5 active:opacity-80"
        >
          <LogOut size={18} color={destructive} />
          <Text className="font-semibold text-destructive">Se déconnecter</Text>
        </Pressable>

        <View className="gap-2">
          <Text
            variant="caption"
            className="px-1 uppercase tracking-wider text-muted-foreground"
          >
            Informations légales
          </Text>
          <MenuList>
            {legalItems.map((item, idx) => {
              const Icon = item.icon;
              const isLast = idx === legalItems.length - 1;
              return (
                <MenuRow
                  key={item.href}
                  icon={<Icon size={20} color={iconForeground} />}
                  label={item.label}
                  onPress={() => router.push(item.href as never)}
                  isLast={isLast}
                  chevronColor={iconMuted}
                />
              );
            })}
          </MenuList>
        </View>

        <Text variant="caption" className="text-center">
          {`© ${new Date().getFullYear()} PokeMarket. Tous droits réservés.`}
        </Text>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

function MenuList({ children }: { children: React.ReactNode }) {
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      {children}
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  isLast,
  chevronColor,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  isLast: boolean;
  chevronColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={isLast ? "" : "border-b border-border"}
    >
      {({ pressed }) => (
        <MotiView
          animate={tapScale.animate(pressed)}
          transition={tapScale.transition}
          className={`flex-row items-center justify-between px-4 py-3.5 ${
            pressed ? "bg-muted" : ""
          }`}
        >
          <View className="flex-row items-center gap-3">
            {icon}
            <Text>{label}</Text>
          </View>
          <ChevronRight size={18} color={chevronColor} />
        </MotiView>
      )}
    </Pressable>
  );
}
