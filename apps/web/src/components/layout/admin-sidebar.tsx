"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PackageSearch,
  Users,
  Scale,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/listings", label: "Annonces", icon: PackageSearch },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/disputes", label: "Litiges", icon: Scale },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-muted/30 hidden w-56 shrink-0 border-r md:block">
      <div className="sticky top-16 flex flex-col gap-1 p-4">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-2 text-xs font-medium transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Retour au site
        </Link>

        <p className="text-muted-foreground mb-2 px-2 text-[11px] font-semibold tracking-wider uppercase">
          Administration
        </p>

        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
