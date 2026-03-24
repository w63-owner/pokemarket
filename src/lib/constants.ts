export const MARKETPLACE_PERCENT_FEE = 0.05;
export const MARKETPLACE_FIXED_FEE = 0.7;

export const CARD_CONDITIONS = [
  "MINT",
  "NEAR_MINT",
  "EXCELLENT",
  "GOOD",
  "LIGHT_PLAYED",
  "PLAYED",
  "POOR",
] as const;

export type CardCondition = (typeof CARD_CONDITIONS)[number];

export const CONDITION_LABELS: Record<CardCondition, string> = {
  MINT: "Mint",
  NEAR_MINT: "Near Mint",
  EXCELLENT: "Excellent",
  GOOD: "Good",
  LIGHT_PLAYED: "Light Played",
  PLAYED: "Played",
  POOR: "Poor",
};

export const GRADING_COMPANIES = [
  "PSA",
  "PCA",
  "BGS",
  "CGC",
  "SGC",
  "ACE",
  "OTHER",
] as const;

export type GradingCompany = (typeof GRADING_COMPANIES)[number];

export const WEIGHT_CLASSES = ["XS", "S", "M", "L", "XL"] as const;

export type WeightClass = (typeof WEIGHT_CLASSES)[number];

export const WEIGHT_CLASS_LABELS: Record<WeightClass, string> = {
  XS: "Extra Small (1 carte sans protection)",
  S: "Small (1-2 cartes avec toploader)",
  M: "Medium (3-10 cartes)",
  L: "Large (11-50 cartes)",
  XL: "Extra Large (50+ cartes / boîte)",
};

export const SHIPPING_COUNTRIES = [
  "FR",
  "BE",
  "ES",
  "CH",
  "LU",
  "DE",
  "IT",
] as const;

export type ShippingCountry = (typeof SHIPPING_COUNTRIES)[number];

export const COUNTRY_LABELS: Record<ShippingCountry, string> = {
  FR: "France",
  BE: "Belgique",
  ES: "Espagne",
  CH: "Suisse",
  LU: "Luxembourg",
  DE: "Allemagne",
  IT: "Italie",
};

export const LISTING_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "LOCKED",
  "RESERVED",
  "SOLD",
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const TRANSACTION_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "SHIPPED",
  "COMPLETED",
  "DISPUTED",
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const OFFER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const LIMITS = {
  MAX_OFFERS_PER_DAY: 10,
  MIN_OFFER_PERCENT: 0.7,
  MAX_MESSAGE_LENGTH: 2000,
  TITLE_MIN_LENGTH: 3,
  TITLE_MAX_LENGTH: 140,
  CHECKOUT_LOCK_MINUTES: 30,
  MESSAGES_PER_PAGE: 50,
  FEED_PAGE_SIZE: 20,
  MAX_FEED_PAGE_SIZE: 50,
  MAX_IMAGE_SIZE_MB: 5,
  IMAGE_MAX_WIDTH: 1200,
  AVATAR_SIZE: 200,
} as const;

export const REPORT_REASONS = [
  "counterfeit",
  "scam",
  "inappropriate",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  counterfeit: "Contrefaçon",
  scam: "Arnaque",
  inappropriate: "Contenu inapproprié",
  other: "Autre",
};

export const DISPUTE_REASONS = [
  "DAMAGED_CARD",
  "WRONG_CARD",
  "EMPTY_PACKAGE",
  "OTHER",
] as const;

export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const KYC_STATUSES = [
  "UNVERIFIED",
  "PENDING",
  "REQUIRED",
  "VERIFIED",
  "REJECTED",
] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];

export const MESSAGE_TYPES = ["text", "offer", "system", "image"] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export const SYSTEM_MESSAGE_TYPES = [
  "offer_accepted",
  "offer_cancelled_by_buyer",
  "payment_completed",
  "order_shipped",
  "sale_completed",
] as const;

export type SystemMessageType = (typeof SYSTEM_MESSAGE_TYPES)[number];

export const SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récentes" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
] as const;

export const RARITY_OPTIONS = [
  { value: "Common", label: "Commune" },
  { value: "Uncommon", label: "Peu commune" },
  { value: "Rare", label: "Rare" },
  { value: "Ultra Rare", label: "Ultra Rare" },
  { value: "Illustration Rare", label: "Illustration Rare" },
  { value: "Special Art Rare", label: "Special Art Rare" },
  { value: "Secret Rare", label: "Secrète" },
] as const;

export const CARD_LANGUAGES = [
  { value: "FR", label: "Français" },
  { value: "JA", label: "Japonais" },
  { value: "EN", label: "Anglais" },
] as const;

export type CardLanguageCode = (typeof CARD_LANGUAGES)[number]["value"];

const CARD_LANGUAGE_VALUES = new Set<string>(
  CARD_LANGUAGES.map((l) => l.value),
);

/** Valid select value for listings, or "" if missing / legacy (not in FR|JA|EN). */
export function toCardLanguageSelectValue(
  raw: string | null | undefined,
): CardLanguageCode | "" {
  if (!raw) return "";
  const upper = raw.trim().toUpperCase();
  return CARD_LANGUAGE_VALUES.has(upper) ? (upper as CardLanguageCode) : "";
}
