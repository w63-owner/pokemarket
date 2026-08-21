export type FeedFilters = {
  q?: string;
  set?: string;
  rarity?: string;
  condition?: string;
  is_graded?: boolean;
  grade_min?: number;
  grade_max?: number;
  price_min?: number;
  price_max?: number;
  card_number?: string;
  series?: string;
  sort?: string;
};

export const queryKeys = {
  featureFlags: {
    all: ["feature-flags"] as const,
  },
  listings: {
    all: ["listings"] as const,
    feed: (filters: FeedFilters, viewerId?: string | null) =>
      ["listings", "feed", filters, viewerId ?? null] as const,
    detail: (id: string) => ["listings", "detail", id] as const,
    mine: () => ["listings", "mine"] as const,
    seller: (sellerId: string) => ["listings", "seller", sellerId] as const,
  },
  conversations: {
    all: ["conversations"] as const,
    list: (filters?: { search?: string; archived?: boolean }) =>
      filters
        ? (["conversations", "list", filters] as const)
        : (["conversations", "list"] as const),
    detail: (id: string) => ["conversations", "detail", id] as const,
    messages: (id: string) => ["conversations", "messages", id] as const,
    unreadCount: () => ["conversations", "unreadCount"] as const,
    // Caches 1-hour signed URLs minted by Supabase Storage for image
    // messages stored in the private `message_attachments` bucket.
    messageAttachment: (storagePath: string) =>
      ["conversations", "messageAttachment", storagePath] as const,
  },
  offers: {
    all: ["offers"] as const,
    received: () => ["offers", "received"] as const,
    sent: () => ["offers", "sent"] as const,
    byListing: (listingId: string) => ["offers", "listing", listingId] as const,
    activeByConversation: (conversationId: string) =>
      ["offers", "active", conversationId] as const,
  },
  profile: {
    me: () => ["profile", "me"] as const,
    public: (username: string) => ["profile", "public", username] as const,
  },
  reviews: {
    bySeller: (sellerId: string) => ["reviews", "seller", sellerId] as const,
  },
  sellers: {
    followStatus: (sellerId: string) =>
      ["sellers", "followStatus", sellerId] as const,
    reputation: (sellerId: string) =>
      ["sellers", "reputation", sellerId] as const,
  },
  favorites: {
    listings: () => ["favorites", "listings"] as const,
    listingIds: () => ["favorites", "listingIds"] as const,
    sellers: () => ["favorites", "sellers"] as const,
    searches: () => ["favorites", "searches"] as const,
    searchNewCounts: () => ["favorites", "searchNewCounts"] as const,
  },
  transactions: {
    all: ["transactions"] as const,
    purchases: () => ["transactions", "purchases"] as const,
    sales: () => ["transactions", "sales"] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
    // Mobile reads purchases through a buyer-RLS-scoped projection that
    // differs from the seller view used by `detail`. Keeping two distinct
    // cache buckets prevents an unintended cross-contamination of the
    // sales-side cache when the same id is opened from both surfaces.
    purchaseDetail: (id: string) =>
      ["transactions", "purchaseDetail", id] as const,
    byListing: (listingId: string) =>
      ["transactions", "byListing", listingId] as const,
  },
  wallet: {
    balance: () => ["wallet", "balance"] as const,
    movements: () => ["wallet", "movements"] as const,
    payouts: () => ["wallet", "payouts"] as const,
  },
  paymentMethods: {
    list: () => ["paymentMethods", "list"] as const,
  },
  shipping: {
    matrix: () => ["shipping", "matrix"] as const,
  },
  tcgdex: {
    series: () => ["tcgdex", "series"] as const,
    sets: () => ["tcgdex", "sets"] as const,
    cards: (query: string) => ["tcgdex", "cards", query] as const,
  },
  cardMarket: {
    search: (query: string) => ["card-market", "search", query] as const,
    detail: (cardKey: string) => ["card-market", "detail", cardKey] as const,
    top: () => ["card-market", "top"] as const,
  },
  pokeMarketSales: {
    summary: (
      cardKey: string,
      filters: {
        condition: string | null;
        gradeNote: number | null;
        gradingCompany: string | null;
        isGraded: boolean;
        variant: "normal" | "holo";
      },
    ) => ["poke-market-sales", cardKey, filters] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    preferences: () => ["notifications", "preferences"] as const,
  },
  priceHistory: (
    cardKey: string,
    variant: "normal" | "holo",
    period: "30d" | "90d" | "1y" | "all",
  ) => ["priceHistory", cardKey, variant, period] as const,
  priceRecommendation: (
    cardKey: string,
    condition: string,
    language: string,
    isGraded: boolean,
  ) => ["priceRecommendation", cardKey, condition, language, isGraded] as const,
} as const;
