"use client";

import { m, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { pageTransition, safeVariants, safeInitial } from "@/lib/motion";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <m.div
      variants={safeVariants(pageTransition, prefersReducedMotion)}
      initial={safeInitial(prefersReducedMotion)}
      animate="visible"
      className={className}
    >
      {children}
    </m.div>
  );
}
