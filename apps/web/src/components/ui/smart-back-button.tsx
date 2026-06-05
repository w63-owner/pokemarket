"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigationHistory } from "@/hooks/use-navigation-history";
import { cn } from "@/lib/utils";

interface SmartBackButtonProps {
  fallbackUrl?: string;
  /** When set, always navigate here (e.g. auth `?next=` — avoids redirect loops). */
  returnTo?: string;
  label?: string;
  variant?: "ghost" | "secondary" | "overlay";
  className?: string;
}

export function SmartBackButton({
  fallbackUrl = "/",
  returnTo,
  label,
  variant = "ghost",
  className,
}: SmartBackButtonProps) {
  const router = useRouter();
  const { hasHistory } = useNavigationHistory();

  function handleBack() {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    if (hasHistory) {
      router.back();
    } else {
      router.push(fallbackUrl);
    }
  }

  if (variant === "overlay") {
    return (
      <button
        onClick={handleBack}
        aria-label={label ?? "Retour"}
        className={cn(
          "flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors active:bg-black/60",
          className,
        )}
      >
        <ArrowLeft className="size-5" />
      </button>
    );
  }

  return (
    <Button
      variant={variant}
      size={label ? "default" : "icon"}
      onClick={handleBack}
      aria-label={label ?? "Retour"}
      className={cn("min-h-11 min-w-11", className)}
    >
      <ArrowLeft className="size-5" />
      {label && <span>{label}</span>}
    </Button>
  );
}
