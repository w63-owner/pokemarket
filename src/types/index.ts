import type { Database } from "./database";

// ─── TCGdex JSONB interfaces ─────────────────────────────

export type CardAttack = {
  cost: string[];
  name: string;
  effect?: string;
  damage?: string | number;
};

export type CardWeakness = {
  type: string;
  value: string;
};

export type CardVariants = {
  normal: boolean;
  reverse: boolean;
  holo: boolean;
  firstEdition: boolean;
  wPromo?: boolean;
};

export type CardLegal = {
  standard: boolean;
  expanded: boolean;
};

export type CardItem = {
  name: string;
  effect: string;
};

export type SetCardCount = {
  total: number;
  official: number;
  reverse?: number;
  holo?: number;
  firstEd?: number;
  normal?: number;
};

export type CardPricing = {
  cardmarket?: Record<string, number | string>;
  tcgplayer?: Record<string, unknown>;
};

// ─── Shorthand row types ─────────────────────────────────

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

export type TcgdexCardTyped = Omit<
  TcgdexCard,
  | "attacks"
  | "weaknesses"
  | "variants"
  | "legal"
  | "types"
  | "dex_id"
  | "item"
  | "pricing"
> & {
  attacks: CardAttack[] | null;
  weaknesses: CardWeakness[] | null;
  variants: CardVariants | null;
  legal: CardLegal | null;
  types: string[] | null;
  dex_id: number[] | null;
  item: CardItem | null;
  pricing: CardPricing | null;
};

export type TcgdexSetTyped = Omit<TcgdexSet, "card_count" | "legal"> & {
  card_count: SetCardCount | null;
  legal: CardLegal | null;
};

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
