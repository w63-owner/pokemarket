"use client";

import { type ReactNode } from "react";
import { m, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  fadeInUp,
  fadeInScale,
  staggerContainerSlow,
  safeVariants,
  safeInitial,
} from "@/lib/motion";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const prefersReducedMotion = useReducedMotion();
  const container = staggerContainerSlow(0.12);

  return (
    <m.div
      variants={safeVariants(container, prefersReducedMotion)}
      initial={safeInitial(prefersReducedMotion)}
      animate="visible"
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-20 text-center",
        className,
      )}
    >
      {icon && (
        <m.div
          variants={safeVariants(fadeInScale, prefersReducedMotion)}
          className="bg-muted text-muted-foreground rounded-full p-4"
        >
          {icon}
        </m.div>
      )}
      <m.div
        variants={safeVariants(fadeInUp, prefersReducedMotion)}
        className="max-w-xs space-y-1"
      >
        <p className="font-display text-foreground text-base font-semibold">
          {title}
        </p>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </m.div>
      {action && (
        <m.div variants={safeVariants(fadeInUp, prefersReducedMotion)}>
          {action.href ? (
            <Button render={<a href={action.href} />} variant="outline">
              {action.label}
            </Button>
          ) : (
            <Button variant="outline" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </m.div>
      )}
    </m.div>
  );
}
