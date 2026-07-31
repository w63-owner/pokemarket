/**
 * Product capabilities that can be disabled remotely.
 *
 * Keep keys stable after creating the matching flags in PostHog. Renaming a
 * key creates a different flag and temporarily falls back to the default.
 */
export const FEATURE_FLAGS = {
  MESSAGING: "messaging",
  HOME_SEARCH: "home-search",
  SELLING: "selling",
  FAVORITES: "favorites",
  CHECKOUT: "checkout",
  PRICE_CHECKING: "price-checking",
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export const FEATURE_FLAG_KEYS = Object.values(FEATURE_FLAGS) as FeatureFlag[];

/**
 * Availability flags fail open when PostHog is not configured or temporarily
 * unavailable. Security and payment authorization must never depend on these
 * values.
 */
export const FEATURE_FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  [FEATURE_FLAGS.MESSAGING]: true,
  [FEATURE_FLAGS.HOME_SEARCH]: true,
  [FEATURE_FLAGS.SELLING]: true,
  [FEATURE_FLAGS.FAVORITES]: true,
  [FEATURE_FLAGS.CHECKOUT]: true,
  [FEATURE_FLAGS.PRICE_CHECKING]: true,
};

export type FeatureFlagsSnapshot = {
  flags: Record<FeatureFlag, boolean>;
  fetchedAt: string;
};
