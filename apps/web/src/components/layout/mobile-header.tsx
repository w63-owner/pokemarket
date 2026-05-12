"use client";

import type { ReactNode } from "react";
import { SmartBackButton } from "@/components/ui/smart-back-button";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
  title: string;
  fallbackUrl?: string;
  rightAction?: ReactNode;
  transparent?: boolean;
  className?: string;
}

export function MobileHeader({
  title,
  fallbackUrl = "/",
  rightAction,
  transparent = false,
  className,
}: MobileHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 pt-[env(safe-area-inset-top)] lg:hidden",
        transparent
          ? "pointer-events-none"
          : "border-border bg-background/80 border-b backdrop-blur-lg",
        className,
      )}
    >
      <div className="grid h-14 grid-cols-[auto_1fr_auto] items-center gap-2 px-2">
        <div className="pointer-events-auto">
          <SmartBackButton
            fallbackUrl={fallbackUrl}
            variant={transparent ? "overlay" : "ghost"}
          />
        </div>

        <h1
          className={cn(
            "truncate text-center text-base font-semibold",
            transparent && "sr-only",
          )}
        >
          {title}
        </h1>

        <div className="pointer-events-auto flex min-w-11 items-center justify-end">
          {rightAction}
        </div>
      </div>
    </header>
  );
}
