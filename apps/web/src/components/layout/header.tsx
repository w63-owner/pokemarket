"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Heart, PlusCircle, MessageCircle, User } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { FEATURE_FLAGS, type FeatureFlag } from "@pokemarket/shared";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/hooks/use-conversations";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { spring, scaleIn } from "@/lib/motion";

const links: ReadonlyArray<{
  href: string;
  label: string;
  icon: typeof Search;
  flag: FeatureFlag | null;
}> = [
  { href: "/", label: "Marketplace", icon: Search, flag: null },
  {
    href: "/favorites",
    label: "Favoris",
    icon: Heart,
    flag: FEATURE_FLAGS.FAVORITES,
  },
  {
    href: "/sell",
    label: "Vendre",
    icon: PlusCircle,
    flag: FEATURE_FLAGS.SELLING,
  },
  {
    href: "/messages",
    label: "Messages",
    icon: MessageCircle,
    flag: FEATURE_FLAGS.MESSAGING,
  },
  { href: "/profile", label: "Profil", icon: User, flag: null },
] as const;

export function Header() {
  const pathname = usePathname();
  const { data: unreadCount } = useUnreadCount();
  const { data: featureFlags } = useFeatureFlags();
  const { direction, isAtTop } = useScrollDirection({ threshold: 15 });

  if (pathname === "/sell") return null;

  const isHidden = direction === "down" && !isAtTop;

  return (
    <m.header
      animate={{ y: isHidden ? "-100%" : "0%" }}
      transition={spring.snappy}
      className="border-border bg-background/80 sticky top-0 z-50 hidden border-b backdrop-blur-lg lg:block"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="font-heading text-xl font-bold">
          Poke<span className="text-brand">Market</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links
            .filter(
              (link) =>
                link.flag === null || (featureFlags?.flags[link.flag] ?? true),
            )
            .map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);

              const showBadge =
                link.href === "/messages" && !!unreadCount && unreadCount > 0;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand/10 text-brand"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="relative">
                    <link.icon className="size-4" />
                    <AnimatePresence>
                      {showBadge && (
                        <m.span
                          variants={scaleIn}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className="absolute -top-1.5 -right-2 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] leading-none font-bold text-white"
                        >
                          {unreadCount > 99 ? "99" : unreadCount}
                        </m.span>
                      )}
                    </AnimatePresence>
                  </span>
                  {link.label}
                  {isActive && (
                    <m.div
                      layoutId="header-active-indicator"
                      className="bg-brand absolute inset-x-1 -bottom-1 h-0.5 rounded-full"
                      transition={spring.gentle}
                    />
                  )}
                </Link>
              );
            })}
        </nav>
      </div>
    </m.header>
  );
}
