import type { Transition, Variants } from "framer-motion";

// ─── Spring presets ───────────────────────────────────────────────────────────

export const spring = {
  gentle: { type: "spring", stiffness: 120, damping: 14 } as Transition,
  snappy: { type: "spring", stiffness: 400, damping: 30 } as Transition,
  bouncy: { type: "spring", stiffness: 400, damping: 10 } as Transition,
  stiff: { type: "spring", stiffness: 600, damping: 40 } as Transition,
} as const;

export const ease = {
  smooth: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  decelerate: [0, 0, 0.2, 1] as [number, number, number, number],
  accelerate: [0.4, 0, 1, 1] as [number, number, number, number],
  springLike: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
};

// ─── Duration presets ─────────────────────────────────────────────────────────

export const duration = {
  instant: 0.1,
  fast: 0.2,
  normal: 0.35,
  slow: 0.5,
  dramatic: 0.8,
} as const;

// ─── Fade variants ────────────────────────────────────────────────────────────

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.normal } },
  exit: { opacity: 0, transition: { duration: duration.fast } },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: ease.decelerate },
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: { duration: duration.fast, ease: ease.accelerate },
  },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: ease.decelerate },
  },
  exit: {
    opacity: 0,
    y: 24,
    transition: { duration: duration.fast, ease: ease.accelerate },
  },
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.normal, ease: ease.decelerate },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: duration.fast, ease: ease.accelerate },
  },
};

// ─── Slide variants ───────────────────────────────────────────────────────────

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.normal, ease: ease.decelerate },
  },
  exit: {
    opacity: 0,
    x: -30,
    transition: { duration: duration.fast, ease: ease.accelerate },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.normal, ease: ease.decelerate },
  },
  exit: {
    opacity: 0,
    x: 30,
    transition: { duration: duration.fast, ease: ease.accelerate },
  },
};

// ─── Scale variants ───────────────────────────────────────────────────────────

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: spring.bouncy,
  },
  exit: {
    opacity: 0,
    scale: 0,
    transition: { duration: duration.fast },
  },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: spring.bouncy,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: { duration: duration.fast },
  },
};

// ─── Stagger containers ──────────────────────────────────────────────────────

export function staggerContainer(staggerDelay = 0.05): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: staggerDelay },
    },
  };
}

export function staggerContainerSlow(staggerDelay = 0.1): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: staggerDelay, delayChildren: 0.1 },
    },
  };
}

// ─── Page transition variants ─────────────────────────────────────────────────

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: ease.decelerate },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: duration.fast, ease: ease.accelerate },
  },
};

// ─── Micro-interaction helpers ────────────────────────────────────────────────

export const tapScale = {
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
};

export const tapScaleSmall = {
  whileTap: { scale: 0.85 },
  transition: spring.snappy,
};

export const hoverLift = {
  whileHover: { y: -4, transition: { duration: duration.fast } },
};

export const hoverScale = {
  whileHover: { scale: 1.05 },
  transition: spring.snappy,
};

// ─── Reduced motion safe wrapper ──────────────────────────────────────────────

export function safeVariants(
  variants: Variants,
  prefersReducedMotion: boolean | null,
): Variants | undefined {
  return prefersReducedMotion ? undefined : variants;
}

export function safeInitial(
  prefersReducedMotion: boolean | null,
): false | "hidden" {
  return prefersReducedMotion ? false : "hidden";
}
