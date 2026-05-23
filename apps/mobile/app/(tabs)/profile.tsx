import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Heart,
  ListChecks,
  ChevronRight,
  Wallet,
  Receipt,
  Star,
  Settings,
  TrendingUp,
  LogOut,
} from "lucide-react-native";
import { Avatar, Card, Skeleton, Text } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";

const items = [
  { icon: ListChecks, label: "Mes annonces", href: "/profile/listings" },
  { icon: Heart, label: "Favoris", href: "/favorites" },
  { icon: Receipt, label: "Mes achats / ventes", href: "/transactions" },
  { icon: Wallet, label: "Mon portefeuille", href: "/wallet" },
  { icon: TrendingUp, label: "Cote des cartes", href: "/price-checking" },
  { icon: Settings, label: "Paramètres", href: "/profile/settings" },
] as const;

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useMyProfile();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
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

        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.href}
                onPress={() => router.push(item.href as never)}
                className="flex-row items-center justify-between px-4 py-3.5 active:bg-muted"
                style={
                  idx < items.length - 1
                    ? { borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" }
                    : undefined
                }
              >
                <View className="flex-row items-center gap-3">
                  <Icon size={20} color="#0f172a" />
                  <Text>{item.label}</Text>
                </View>
                <ChevronRight size={18} color="#94a3b8" />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={async () => {
            await signOut();
            router.replace("/(auth)/login");
          }}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-card p-3.5 active:opacity-80"
        >
          <LogOut size={18} color="#dc2626" />
          <Text className="font-semibold text-destructive">Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
