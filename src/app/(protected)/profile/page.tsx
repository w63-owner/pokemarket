"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "next-themes";
import {
  User,
  Tag,
  Receipt,
  Wallet,
  CreditCard,
  Bell,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const menuItems = [
  { href: "/profile/profile", label: "Mon profil", icon: User },
  { href: "/profile/listings", label: "Mes annonces", icon: Tag },
  { href: "/profile/transactions", label: "Mes transactions", icon: Receipt },
  { href: "/profile/wallet", label: "Mon portefeuille", icon: Wallet },
  { href: "/profile/payments", label: "Moyens de paiement", icon: CreditCard },
  { href: "/profile/notifications", label: "Notifications", icon: Bell },
];

export default function ProfileHubPage() {
  const { signOut } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="font-heading text-2xl font-bold">Mon compte</h1>

      <div className="mt-6 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="hover:bg-muted flex items-center gap-3 rounded-lg px-3 py-3 transition-colors"
          >
            <item.icon className="text-muted-foreground size-5" />
            <span className="flex-1 text-sm font-medium">{item.label}</span>
            <ChevronRight className="text-muted-foreground size-4" />
          </Link>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-lg px-3 py-3">
        <div className="flex items-center gap-3">
          {theme === "dark" ? (
            <Moon className="text-muted-foreground size-5" />
          ) : (
            <Sun className="text-muted-foreground size-5" />
          )}
          <span className="text-sm font-medium">Mode sombre</span>
        </div>
        <Switch
          checked={theme === "dark"}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        />
      </div>

      <div className="mt-6 space-y-2">
        <Button
          variant="ghost"
          className="text-destructive w-full justify-start gap-3"
          onClick={handleSignOut}
        >
          <LogOut className="size-5" />
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}
