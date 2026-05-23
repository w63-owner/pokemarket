import type { FeedFilters } from "../query-keys";

export type FeedParams = FeedFilters & {
  cursor_created_at?: string;
  cursor_id?: string;
  cursor_price?: number;
  limit?: number;
};

export type PaymentProvider = "stripe" | "mangopay";

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
 * Mobile checkout: the backend tells the client which provider to use and
 * returns the data needed to complete the payment natively (PaymentSheet on
 * iOS/Android) or in a WebView (Mangopay 3DS).
 *
 * The mobile client should call /api/checkout?client=mobile to get this shape
 * back instead of CheckoutResponse.
 */
export type MobileCheckoutResponse =
  | {
      provider: "stripe";
      mode: "payment_intent";
      client_secret: string;
      payment_intent_id: string;
      ephemeral_key?: string;
      customer_id?: string;
      transaction_id: string;
    }
  | {
      provider: "mangopay";
      mode: "card_direct";
      payin_id: string;
      secure_mode_url: string | null;
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
 * Onboarding (Stripe Connect ou Mangopay KYC) flow.
 * Backend renvoie une URL hébergée que le client ouvre en WebView (mobile)
 * ou en redirect plein écran (web).
 */
export type OnboardingResponse = {
  provider: PaymentProvider;
  url: string;
  return_url: string;
};

/**
 * Mobile-only: register an Expo push token alongside the user.
 */
export type RegisterExpoPushTokenRequest = {
  expo_push_token: string;
  device_id: string;
  platform: "ios" | "android";
};
