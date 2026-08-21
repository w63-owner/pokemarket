import { z } from "zod";

import type { FeedFilters } from "../query-keys";
import type { Message } from "../types";
import type {
  CardmarketVariant,
  TcgdexCardmarketPricing,
} from "../lib/cardmarket";

export const cardSearchParamsSchema = z.object({
  q: z.string().trim().min(2).max(80),
});

export const cardKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^fr-[A-Za-z0-9][A-Za-z0-9._-]*$/);

export type CardSearchResult = {
  card_key: string;
  name: string;
  set_id: string | null;
  set_name: string | null;
  series_id: string | null;
  series_name: string | null;
  local_id: string | null;
  set_official_count: number | null;
  rarity: string | null;
  language: string;
  image_url: string | null;
};

export type CardSearchResponse = {
  results: CardSearchResult[];
};

export type CardMarketDetail = CardSearchResult & {
  illustrator: string | null;
  available_variants: CardmarketVariant[];
  pricing: TcgdexCardmarketPricing | null;
};

export type CardMarketDetailResponse = {
  card: CardMarketDetail;
};

export type PokeMarketRecentSale = {
  condition: string | null;
  grade_note: number | null;
  grading_company: string | null;
  is_graded: boolean;
  price: number;
  sold_at: string;
  variant: CardmarketVariant | null;
};

export type PokeMarketSalesFilters = {
  condition: string | null;
  grade_note: number | null;
  grading_company: string | null;
  is_graded: boolean;
  variant: CardmarketVariant;
};

export type PokeMarketSalesResponse = {
  median_price: number | null;
  average_price: number | null;
  sales_volume: number;
  last_sold_at: string | null;
  recent_sales: PokeMarketRecentSale[];
  has_sufficient_volume: boolean;
  minimum_volume: number;
  currency: "EUR";
  filters: PokeMarketSalesFilters;
};

export type CardMarketTopEntry = CardSearchResult & {
  rank: number;
  variant: CardmarketVariant;
  price: number;
  currency: string;
  snapshot_date: string;
  price_updated_at: string;
};

export type CardMarketTopResponse = {
  entries: CardMarketTopEntry[];
  snapshot_date: string | null;
};

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

export type PriceRecommendation = {
  sellerPrice: number;
  displayPrice: number;
  source: "pokemarket" | "cardmarket";
  sampleSize: number | null;
};

export type PriceHistoryPeriod = "30d" | "90d" | "1y" | "all";

export type PriceHistoryPoint = {
  date: string;
  price: number;
};

export type PriceHistoryResponse = {
  chartData: PriceHistoryPoint[];
  stats: {
    range: [number, number] | null;
    observations: number;
    volatility: number;
  };
  availablePeriods: PriceHistoryPeriod[];
  currency: string;
  historyStatus: "empty" | "single" | "ready";
  period: PriceHistoryPeriod;
  recommendation: PriceRecommendation | null;
  source: "CARDMARKET_TCGDEX";
  variant: CardmarketVariant;
};

export type PushNotificationRequest = {
  user_id: string;
  title: string;
  body: string;
  url?: string;
};

export type MessageReplySnapshot = {
  id: string;
  content: string;
  sender_id: string;
  message_type: string;
};

type SendMessageBase = {
  conversation_id: string;
  client_id: string;
  reply_to?: MessageReplySnapshot | null;
};

export type SendTextMessageRequest = SendMessageBase & {
  type: "text";
  content: string;
};

export type SendImageMessageRequest = SendMessageBase & {
  type: "image";
  storage_path: string;
};

export type SendMessageRequest =
  | SendTextMessageRequest
  | SendImageMessageRequest;

export type SendMessageResponse = {
  message: Message;
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
