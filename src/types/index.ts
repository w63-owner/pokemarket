import type { Database } from "./database";

// Shorthand row types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Wallet = Database["public"]["Tables"]["wallets"]["Row"];
export type Listing = Database["public"]["Tables"]["listings"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type Offer = Database["public"]["Tables"]["offers"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type Dispute = Database["public"]["Tables"]["disputes"]["Row"];
export type FavoriteListing =
  Database["public"]["Tables"]["favorite_listings"]["Row"];
export type FavoriteSeller =
  Database["public"]["Tables"]["favorite_sellers"]["Row"];
export type SavedSearch = Database["public"]["Tables"]["saved_searches"]["Row"];
export type ShippingRate =
  Database["public"]["Tables"]["shipping_matrix"]["Row"];
export type TcgdexCard = Database["public"]["Tables"]["tcgdex_cards"]["Row"];
export type TcgdexSet = Database["public"]["Tables"]["tcgdex_sets"]["Row"];
export type TcgdexSeries = Database["public"]["Tables"]["tcgdex_series"]["Row"];
export type OcrAttempt = Database["public"]["Tables"]["ocr_attempts"]["Row"];

// Insert types
export type ListingInsert = Database["public"]["Tables"]["listings"]["Insert"];
export type TransactionInsert =
  Database["public"]["Tables"]["transactions"]["Insert"];
export type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
export type OfferInsert = Database["public"]["Tables"]["offers"]["Insert"];
export type ReviewInsert = Database["public"]["Tables"]["reviews"]["Insert"];

// Joined / enriched types
export type ListingWithSeller = Listing & {
  seller: Pick<Profile, "username" | "avatar_url">;
};

export type ConversationPreview = Conversation & {
  listing: Pick<
    Listing,
    "id" | "title" | "cover_image_url" | "display_price" | "status"
  >;
  other_user: Pick<Profile, "id" | "username" | "avatar_url">;
  last_message: Pick<
    Message,
    "content" | "message_type" | "created_at" | "sender_id"
  > | null;
  unread_count: number;
};

export type OfferWithContext = Offer & {
  listing: Pick<Listing, "id" | "title" | "cover_image_url" | "display_price">;
  buyer: Pick<Profile, "id" | "username" | "avatar_url">;
};

export type SentOfferWithContext = Offer & {
  listing: Pick<
    Listing,
    "id" | "title" | "cover_image_url" | "display_price"
  > & {
    seller: Pick<Profile, "id" | "username" | "avatar_url">;
  };
};

export type TransactionWithDetails = Transaction & {
  listing: Pick<Listing, "id" | "title" | "cover_image_url">;
  buyer: Pick<Profile, "id" | "username">;
  seller: Pick<Profile, "id" | "username">;
};

export type ProfileWithStats = Profile & {
  avg_rating: number | null;
  review_count: number;
  listing_count: number;
};

// Feed item from the RPC
export type FeedItem =
  Database["public"]["Functions"]["search_listings_feed"]["Returns"][number];
