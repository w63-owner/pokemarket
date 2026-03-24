"use client";

import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import {
  staggerContainer,
  fadeInUp,
  fadeInScale,
  slideInRight,
  safeVariants,
  safeInitial,
} from "@/lib/motion";
import type { Variants } from "framer-motion";

type AnimationPreset = "fadeUp" | "fadeScale" | "slideRight" | "custom";

interface AnimatedListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  preset?: AnimationPreset;
  customVariants?: Variants;
  staggerDelay?: number;
  className?: string;
  trackPresence?: boolean;
}

const presetMap: Record<Exclude<AnimationPreset, "custom">, Variants> = {
  fadeUp: fadeInUp,
  fadeScale: fadeInScale,
  slideRight: slideInRight,
};

export function AnimatedList<T>({
  items,
  keyExtractor,
  renderItem,
  preset = "fadeUp",
  customVariants,
  staggerDelay = 0.05,
  className,
  trackPresence = false,
}: AnimatedListProps<T>) {
  const prefersReducedMotion = useReducedMotion();

  const itemVariants =
    preset === "custom" && customVariants
      ? customVariants
      : presetMap[preset as Exclude<AnimationPreset, "custom">];

  const container = staggerContainer(staggerDelay);

  const content = items.map((item, index) => (
    <m.div
      key={keyExtractor(item)}
      variants={safeVariants(itemVariants, prefersReducedMotion)}
    >
      {renderItem(item, index)}
    </m.div>
  ));

  return (
    <m.div
      variants={safeVariants(container, prefersReducedMotion)}
      initial={safeInitial(prefersReducedMotion)}
      animate="visible"
      className={className}
    >
      {trackPresence ? (
        <AnimatePresence mode="popLayout">{content}</AnimatePresence>
      ) : (
        content
      )}
    </m.div>
  );
}
