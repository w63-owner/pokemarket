import type { FeedFilters } from "../query-keys";

export type FeedParams = FeedFilters & {
  cursor_created_at?: string;
  cursor_id?: string;
  cursor_price?: number;
  limit?: number;
};

export type PaymentProvider = "stripe";

export type CheckoutRequest = {
  listing_id: string;
  shipping_country: string;
  shipping_address_line: string;
  shipping_address_city: string;
  shipping_address_postcode: string;
};

/**
 * Web checkout (current production shape): backend creates a Stripe Checkout
 * Session and returns the hosted-page URL the browser redirects to.
 */
export type CheckoutResponse = {
  url: string;
  transaction_id: string;
};

/**
 * Mobile checkout data for Stripe PaymentSheet on iOS and Android.
 *
 * The mobile client should call /api/checkout?client=mobile to get this shape
 * back instead of CheckoutResponse.
 */
export type MobileCheckoutResponse = {
  provider: "stripe";
  mode: "payment_intent";
  client_secret: string;
  payment_intent_id: string;
  ephemeral_key?: string;
  customer_id?: string;
  transaction_id: string;
};

export type OcrRequest = {
  image_url: string;
};

export type OcrParsed = {
  name: string | null;
  card_number: string | null;
  language: string | null;
};

export type OcrCandidate = {
  card_key: string;
  card_id: string;
  name: string;
  set_id: string | null;
  set_name: string | null;
  series_name: string | null;
  local_id: string | null;
  set_official_count: number | null;
  hp: number | null;
  rarity: string | null;
  illustrator: string | null;
  language: string;
  image_url: string | null;
  confidence: number;
};

export type OcrResponse = {
  parsed: OcrParsed;
  candidates: OcrCandidate[];
};

export type PushNotificationRequest = {
  user_id: string;
  title: string;
  body: string;
  url?: string;
};

/**
 * Stripe Connect onboarding flow.
 * Identity choices are required only while creating the connected account.
 * Subsequent calls can omit them to renew an onboarding session.
 */
export type StripeConnectEntityType = "individual" | "company";

export type StripeConnectOnboardingRequest = {
  client: "web" | "mobile";
  country?: string;
  entity_type?: StripeConnectEntityType;
};

export type OnboardingResponse = {
  provider: PaymentProvider;
  account_id: string;
  url?: string;
};

export type StripeConnectAccountSessionResponse = {
  client_secret: string;
};

export type StripeConnectStatusResponse = {
  kyc_status: "UNVERIFIED" | "PENDING" | "REQUIRED" | "VERIFIED" | "REJECTED";
  has_account: boolean;
  transfers_status: "active" | "pending" | "restricted" | "unsupported" | null;
  payouts_status: "active" | "pending" | "restricted" | "unsupported" | null;
};

export type PayoutPolicy = {
  minimum_payout_minor: number;
  risk_reserve_minor: number;
  payout_delay_days: number;
  schedule_interval: "manual";
};

/**
 * Mobile-only: register an Expo push token alongside the user.
 */
export type RegisterExpoPushTokenRequest = {
  expo_push_token: string;
  device_id: string;
  platform: "ios" | "android";
};
