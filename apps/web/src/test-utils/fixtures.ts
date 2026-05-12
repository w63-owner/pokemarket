import type { MockDbState } from "./db-mock";

const BUYER = "buyer-1";
const SELLER = "seller-1";
const LISTING = "listing-1";
const TX = "tx-1";

export function basicScenario(): Partial<MockDbState> {
  return {
    users: [
      { id: BUYER, email: "buyer@example.com" },
      { id: SELLER, email: "seller@example.com" },
    ],
    profiles: [
      { id: BUYER, username: "buyer-bob" },
      { id: SELLER, username: "seller-sue" },
    ],
    listings: [
      {
        id: LISTING,
        seller_id: SELLER,
        status: "LOCKED",
        title: "Charizard Base Set",
        cover_image_url: "https://img.example/charizard.png",
        display_price: 105.7,
        reserved_for: BUYER,
        reserved_price: 100,
      },
    ],
    wallets: [
      {
        user_id: SELLER,
        pending_balance: 0,
        available_balance: 0,
        version: 0,
      },
    ],
    transactions: [
      {
        id: TX,
        listing_id: LISTING,
        buyer_id: BUYER,
        seller_id: SELLER,
        status: "PENDING_PAYMENT",
        total_amount: 105.7,
        shipping_cost: 0,
        stripe_checkout_session_id: "cs_test_1",
        expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
    offers: [
      {
        id: "offer-pending-1",
        listing_id: LISTING,
        buyer_id: "buyer-2",
        status: "PENDING",
        amount: 90,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
    conversations: [
      {
        id: "conv-1",
        listing_id: LISTING,
        buyer_id: BUYER,
        seller_id: SELLER,
      },
    ],
    messages: [],
    stripe_webhooks_processed: [],
  };
}

export const IDS = { BUYER, SELLER, LISTING, TX };
