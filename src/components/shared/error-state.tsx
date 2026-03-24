"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { m, useReducedMotion } from "framer-motion";
import * as Sentry from "@sentry/nextjs";
import { cn } from "@/lib/utils";
import {
  fadeInUp,
  fadeInScale,
  staggerContainerSlow,
  safeVariants,
  safeInitial,
} from "@/lib/motion";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  className?: string;
}

export function ErrorState({
  error,
  reset,
  title = "Quelque chose s\u2019est mal passé",
  description = "Une erreur inattendue est survenue. Réessayez dans quelques instants.",
  className,
}: ErrorStateProps) {
  const prefersReducedMotion = useReducedMotion();
  const container = staggerContainerSlow(0.12);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <m.div
      variants={safeVariants(container, prefersReducedMotion)}
      initial={safeInitial(prefersReducedMotion)}
      animate="visible"
      className={cn(
        "flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-4 text-center",
        className,
      )}
    >
      <m.div
        variants={safeVariants(fadeInScale, prefersReducedMotion)}
        className="bg-destructive/10 text-destructive rounded-full p-4"
      >
        <AlertTriangle className="size-8" />
      </m.div>

      <m.div
        variants={safeVariants(fadeInUp, prefersReducedMotion)}
        className="max-w-sm space-y-1.5"
      >
        <h2 className="font-display text-foreground text-lg font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </m.div>

      <m.div variants={safeVariants(fadeInUp, prefersReducedMotion)}>
        <Button onClick={reset} variant="outline">
          Réessayer
        </Button>
      </m.div>

      {error.digest && (
        <m.p
          variants={safeVariants(fadeInUp, prefersReducedMotion)}
          className="text-muted-foreground/60 font-mono text-xs"
        >
          Réf. : {error.digest}
        </m.p>
      )}
    </m.div>
  );
}
