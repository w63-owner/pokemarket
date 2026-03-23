"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Heart, PlusCircle, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useUnreadCount } from "@/hooks/use-conversations";
import { useSavedSearchNewCounts } from "@/hooks/use-saved-searches";

const tabs = [
  { href: "/", label: "Recherche", icon: Search },
  { href: "/favorites", label: "Favoris", icon: Heart },
  { href: "/sell", label: "Vendre", icon: PlusCircle },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profil", icon: User },
] as const;

const HIDDEN_ROUTES = [
  "/sell",
  "/search",
  "/listing/",
  "/messages/",
  "/checkout/",
  "/auth",
];

export function TabBar() {
  const pathname = usePathname();
  const { data: unreadCount } = useUnreadCount();
  const { totalNew: savedSearchNewTotal } = useSavedSearchNewCounts();

  const isHidden = HIDDEN_ROUTES.some((route) => {
    if (route === "/sell") return pathname === "/sell";
    if (route === "/search") return pathname === "/search";
    return pathname.startsWith(route) && pathname !== "/messages";
  });

  if (isHidden) return null;

  return (
    <nav className="border-border bg-background/80 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-lg lg:hidden">
      <div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

          const messageBadge =
            tab.href === "/messages" && !!unreadCount && unreadCount > 0;
          const favBadge = tab.href === "/favorites" && savedSearchNewTotal > 0;
          const badgeCount = messageBadge
            ? unreadCount
            : favBadge
              ? savedSearchNewTotal
              : 0;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors",
                isActive
                  ? "text-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <motion.div whileTap={{ scale: 0.85 }} className="relative">
                <tab.icon className="size-5" />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] leading-none font-bold text-white">
                    {badgeCount > 99 ? "99" : badgeCount}
                  </span>
                )}
              </motion.div>
              <span>{tab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="bg-brand absolute -top-px right-3 left-3 h-0.5 rounded-full"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
