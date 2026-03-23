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
  listings: {
    all: ["listings"] as const,
    feed: (filters: FeedFilters) => ["listings", "feed", filters] as const,
    detail: (id: string) => ["listings", "detail", id] as const,
    mine: () => ["listings", "mine"] as const,
    seller: (sellerId: string) => ["listings", "seller", sellerId] as const,
  },
  conversations: {
    all: ["conversations"] as const,
    list: () => ["conversations", "list"] as const,
    detail: (id: string) => ["conversations", "detail", id] as const,
    messages: (id: string) => ["conversations", "messages", id] as const,
    unreadCount: () => ["conversations", "unreadCount"] as const,
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
    byListing: (listingId: string) =>
      ["transactions", "byListing", listingId] as const,
  },
  wallet: {
    balance: () => ["wallet", "balance"] as const,
    movements: () => ["wallet", "movements"] as const,
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
  priceHistory: (
    cardKey: string,
    condition: string,
    language: string,
    isGraded: boolean,
  ) => ["priceHistory", cardKey, condition, language, isGraded] as const,
} as const;
