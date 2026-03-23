"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Heart, PlusCircle, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/hooks/use-conversations";

const links = [
  { href: "/", label: "Marketplace", icon: Search },
  { href: "/favorites", label: "Favoris", icon: Heart },
  { href: "/sell", label: "Vendre", icon: PlusCircle },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profil", icon: User },
] as const;

export function Header() {
  const pathname = usePathname();
  const { data: unreadCount } = useUnreadCount();

  return (
    <header className="border-border bg-background/80 sticky top-0 z-50 hidden border-b backdrop-blur-lg lg:block">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="font-heading text-xl font-bold">
          Poke<span className="text-brand">Market</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
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
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] leading-none font-bold text-white">
                      {unreadCount > 99 ? "99" : unreadCount}
                    </span>
                  )}
                </span>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
