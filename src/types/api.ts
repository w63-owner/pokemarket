import type { FeedFilters } from "@/lib/query-keys";

export type FeedParams = FeedFilters & {
  cursor_created_at?: string;
  cursor_id?: string;
  cursor_price?: number;
  limit?: number;
};

export type CheckoutRequest = {
  listing_id: string;
  shipping_country: string;
  shipping_address_line: string;
  shipping_address_city: string;
  shipping_address_postcode: string;
};

export type CheckoutResponse = {
  url: string;
  transaction_id: string;
};

export type OcrRequest = {
  image_url: string;
};

export type OcrParsed = {
  name: string | null;
  hp: number | null;
  set_code: string | null;
  set_name: string | null;
  card_number: string | null;
  language: string | null;
  rarity: string | null;
};

export type OcrCandidate = {
  card_key: string;
  card_id: string;
  name: string;
  set_id: string | null;
  set_name: string | null;
  hp: number | null;
  rarity: string | null;
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
