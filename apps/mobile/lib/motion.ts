import { useEffect, useState } from "react";
import { AccessibilityInfo, type ViewProps } from "react-native";
import type { MotiTransitionProp } from "moti";

/**
 * Narrow Moti-compatible transform shape (Moti accepts a strict subset
 * of `ViewStyle`, e.g. it forbids string values for radii). We expose
 * just the keys we actually animate — scale + translate — to keep
 * `animate` typings happy and predictable.
 */
type MotiTransformStyle = {
  transform: Array<
    { scale: number } | { translateX: number } | { translateY: number }
  >;
};

/**
 * Mobile motion system mirroring `apps/web/src/lib/motion.ts`.
 *
 * Goals:
 *   1. Same exported names + same numerical values as the web (springs,
 *      durations) so components staying iso between platforms read the
 *      same transition vocabulary.
 *   2. Adapt the data shape to Moti's `from / animate / exit / transition`
 *      contract — Moti renders Reanimated worklets under the hood, so the
 *      transition objects are plain JSON that Reanimated can interpret.
 *   3. Centralize the reduced-motion escape hatch so individual
 *      components don't reimplement the `AccessibilityInfo` lifecycle.
 *
 * NOTE on units: Moti expresses durations in milliseconds (Framer uses
 * seconds). We keep the same *names* as the web (`fast`, `normal`, …)
 * but convert under the hood.
 */

// ─── Spring presets ───────────────────────────────────────────────────────────

export const spring = {
  gentle: { type: "spring", stiffness: 120, damping: 14, mass: 1 } as const,
  snappy: { type: "spring", stiffness: 400, damping: 30, mass: 1 } as const,
  bouncy: { type: "spring", stiffness: 400, damping: 10, mass: 1 } as const,
  stiff: { type: "spring", stiffness: 600, damping: 40, mass: 1 } as const,
} as const;

// ─── Duration presets (in ms — Moti convention) ───────────────────────────────

export const duration = {
  instant: 100,
  fast: 200,
  normal: 350,
  slow: 500,
  dramatic: 800,
} as const;

// ─── Easings (Bezier compatible with Reanimated.Easing.bezier) ────────────────
//
// We expose the same control points as the web; the consumer of these
// can plug them into `Easing.bezier(...x, y...)` when crafting a custom
// timing. In most cases Moti's default easing is good enough so we
// only reference these for the `pageTransition` / fade variants.

export const ease = {
  smooth: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  decelerate: [0, 0, 0.2, 1] as [number, number, number, number],
  accelerate: [0.4, 0, 1, 1] as [number, number, number, number],
  springLike: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
};

// ─── Variant shape ────────────────────────────────────────────────────────────

export type MotionVariant = {
  from: Record<string, number>;
  animate: Record<string, number>;
  exit?: Record<string, number>;
  transition?: MotiTransitionProp;
};

// ─── Fade variants ────────────────────────────────────────────────────────────

export const fadeIn: MotionVariant = {
  from: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { type: "timing", duration: duration.normal },
};

export const fadeInUp: MotionVariant = {
  from: { opacity: 0, translateY: 24 },
  animate: { opacity: 1, translateY: 0 },
  exit: { opacity: 0, translateY: -12 },
  transition: { type: "timing", duration: duration.normal },
};

export const fadeInDown: MotionVariant = {
  from: { opacity: 0, translateY: -24 },
  animate: { opacity: 1, translateY: 0 },
  exit: { opacity: 0, translateY: 24 },
  transition: { type: "timing", duration: duration.normal },
};

export const fadeInScale: MotionVariant = {
  from: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { type: "timing", duration: duration.normal },
};

// ─── Slide variants ───────────────────────────────────────────────────────────

export const slideInRight: MotionVariant = {
  from: { opacity: 0, translateX: 60 },
  animate: { opacity: 1, translateX: 0 },
  exit: { opacity: 0, translateX: -30 },
  transition: { type: "timing", duration: duration.normal },
};

export const slideInLeft: MotionVariant = {
  from: { opacity: 0, translateX: -60 },
  animate: { opacity: 1, translateX: 0 },
  exit: { opacity: 0, translateX: 30 },
  transition: { type: "timing", duration: duration.normal },
};

// ─── Scale variants ───────────────────────────────────────────────────────────

export const scaleIn: MotionVariant = {
  from: { opacity: 0, scale: 0 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0 },
  transition: spring.bouncy,
};

export const popIn: MotionVariant = {
  from: { opacity: 0, scale: 0.5 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8 },
  transition: spring.bouncy,
};

// ─── Page transition variant ──────────────────────────────────────────────────

export const pageTransition: MotionVariant = {
  from: { opacity: 0, translateY: 12 },
  animate: { opacity: 1, translateY: 0 },
  exit: { opacity: 0, translateY: -8 },
  transition: { type: "timing", duration: duration.normal },
};

// ─── Stagger helper (mobile-flavoured) ────────────────────────────────────────
//
// Framer Motion's web `staggerContainer` relies on `staggerChildren`,
// which Moti does not support. The mobile equivalent is to compute a
// per-item delay (in ms) capped to the first N items so endless lists
// don't pay an entrance cost on every scroll page.
//
// Usage: `staggerDelay(index, 50, 10)` — first 10 items get 0..450ms,
// subsequent items animate immediately.

export function staggerDelay(index: number, step = 50, cap = 10): number {
  if (index <= 0) return 0;
  const safeIndex = Math.min(index, cap);
  return safeIndex * step;
}

/**
 * Convenience: returns a Moti transition with a built-in stagger delay.
 * Use when you only need to extend an existing preset with a delay.
 */
export function withStaggerDelay(
  transition: MotiTransitionProp,
  index: number,
  step = 50,
  cap = 10,
): MotiTransitionProp {
  return {
    ...(transition as object),
    delay: staggerDelay(index, step, cap),
  } as MotiTransitionProp;
}

// ─── Micro-interaction helpers ────────────────────────────────────────────────
//
// Web exposes `whileTap` / `whileHover` props because Framer Motion
// drives the lifecycle. On RN we get the press state from `Pressable`
// children render-prop, so the canonical pattern is:
//
//   <Pressable>
//     {({ pressed }) => (
//       <MotiView animate={tapScale.animate(pressed)} transition={tapScale.transition}>
//         …
//       </MotiView>
//     )}
//   </Pressable>
//
// Helpers below produce the corresponding `animate` payload — the
// scale ratios match the web 1:1.

export const tapScale = {
  animate: (pressed: boolean): MotiTransformStyle => ({
    transform: [{ scale: pressed ? 0.97 : 1 }],
  }),
  scale: (pressed: boolean) => (pressed ? 0.97 : 1),
  transition: spring.snappy,
} as const;

export const tapScaleSmall = {
  animate: (pressed: boolean): MotiTransformStyle => ({
    transform: [{ scale: pressed ? 0.85 : 1 }],
  }),
  scale: (pressed: boolean) => (pressed ? 0.85 : 1),
  transition: spring.snappy,
} as const;

/**
 * Web-equivalent `hoverLift` translates by -4px on hover. On RN we
 * recycle this preset for the pressed state of cards that benefit
 * from a slight visual lift (e.g. profile rows, list cells).
 */
export const hoverLift = {
  animate: (active: boolean): MotiTransformStyle => ({
    transform: [{ translateY: active ? -4 : 0 }],
  }),
  transition: { type: "timing", duration: duration.fast } as const,
} as const;

export const hoverScale = {
  animate: (active: boolean): MotiTransformStyle => ({
    transform: [{ scale: active ? 1.05 : 1 }],
  }),
  transition: spring.snappy,
} as const;

// ─── Reduced motion ───────────────────────────────────────────────────────────

/**
 * Hook returning whether the user has enabled "Reduce Motion" at the
 * OS level (iOS Settings → Accessibility, Android → Animator scale).
 *
 * Listens to live changes so toggling the system setting takes effect
 * on the next render without a hard restart.
 */
export function useReducedMotionSafe(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduceMotion(value);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value: boolean) => setReduceMotion(value),
    );

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}

/**
 * Returns the variant unchanged when motion is allowed, or a single
 * "instant" variant (from === animate) when Reduce Motion is on, so
 * the component still mounts in its final state without animation.
 */
export function safeVariant(
  variant: MotionVariant,
  reduceMotion: boolean,
): MotionVariant {
  if (!reduceMotion) return variant;
  return {
    from: variant.animate,
    animate: variant.animate,
    exit: variant.animate,
    transition: { type: "timing", duration: 0 },
  };
}

/**
 * Returns the `from` payload to use as a Moti `from` prop. Mirrors the
 * web `safeInitial` helper — `false` disables the entrance animation,
 * the named variant key triggers it. On mobile we just collapse to the
 * `animate` payload to skip the entrance entirely.
 */
export function safeFrom(
  variant: MotionVariant,
  reduceMotion: boolean,
): MotionVariant["from"] {
  return reduceMotion ? variant.animate : variant.from;
}

// ─── Convenience prop builder ─────────────────────────────────────────────────

/**
 * Returns the `{ from, animate, exit, transition }` props you can spread
 * onto a `<MotiView>` — with optional delay and reduce-motion safety
 * baked in.
 */
export function motionProps(
  variant: MotionVariant,
  options: {
    reduceMotion?: boolean;
    delay?: number;
    transition?: MotiTransitionProp;
  } = {},
): Pick<ViewProps, never> & MotionVariant {
  const { reduceMotion = false, delay, transition } = options;
  const v = safeVariant(variant, reduceMotion);
  const baseTransition = (transition ?? v.transition ?? {}) as object;
  return {
    from: v.from,
    animate: v.animate,
    exit: v.exit,
    transition:
      delay != null
        ? ({ ...baseTransition, delay } as MotiTransitionProp)
        : (baseTransition as MotiTransitionProp),
  };
}
