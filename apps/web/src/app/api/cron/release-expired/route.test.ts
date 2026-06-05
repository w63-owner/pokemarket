/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

// Fix C: le cron réconcilie auprès de Stripe avant d'expirer une transaction.
// On contrôle le statut renvoyé par reconcile pour piloter les scénarios.
let reconcileSessionImpl: (
  txId: string,
  sessionId: string,
) => Promise<any> = async () => "PENDING_PAYMENT";
let reconcilePIImpl: (txId: string, piId: string) => Promise<any> = async () =>
  "PENDING_PAYMENT";
vi.mock("@/lib/stripe/reconcile", () => ({
  reconcileCheckoutSession: vi.fn((txId: string, sessionId: string) =>
    reconcileSessionImpl(txId, sessionId),
  ),
  reconcilePaymentIntent: vi.fn((txId: string, piId: string) =>
    reconcilePIImpl(txId, piId),
  ),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "./route";

beforeEach(() => {
  process.env.CRON_SECRET = "test_secret";
  reconcileSessionImpl = async () => "PENDING_PAYMENT";
  reconcilePIImpl = async () => "PENDING_PAYMENT";
});

const HOUR = 60 * 60 * 1000;

function authedReq() {
  return new Request("http://localhost/api/cron/release-expired", {
    method: "GET",
    headers: { authorization: "Bearer test_secret" },
  });
}

describe("cron/release-expired — auth", () => {
  it("rejects without bearer secret", async () => {
    mockClient = createMockDb({}).client;
    const res = await GET(
      new Request("http://localhost/api/cron/release-expired"),
    );
    expect(res.status).toBe(401);
  });
});

describe("cron/release-expired — QA", () => {
  it("PENDING_PAYMENT past expiration → EXPIRED + listing ACTIVE", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [],
    });
    mockClient = db.client;
    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.released).toBe(1);
    expect(db.state.transactions[0].status).toBe("EXPIRED");
    expect(db.state.listings[0].status).toBe("ACTIVE");
  });

  it("with ACCEPTED offer present → listing reverts to RESERVED, not ACTIVE", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [{ id: "o1", listing_id: "L1", status: "ACCEPTED" }],
    });
    mockClient = db.client;
    await GET(authedReq());
    expect(db.state.listings[0].status).toBe("RESERVED");
  });

  it("does not release transactions still within expiration window", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          expiration_date: new Date(Date.now() + HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [],
    });
    mockClient = db.client;
    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.released).toBe(0);
    expect(db.state.transactions[0].status).toBe("PENDING_PAYMENT");
    expect(db.state.listings[0].status).toBe("LOCKED");
  });

  it("does not touch listing if it is no longer LOCKED (race-safe)", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      // Listing already SOLD by another concurrent path
      listings: [{ id: "L1", status: "SOLD" }],
      offers: [],
    });
    mockClient = db.client;
    await GET(authedReq());
    // tx is marked EXPIRED, but listing keeps SOLD (the eq("status","LOCKED")
    // guard means the update affected 0 rows)
    expect(db.state.transactions[0].status).toBe("EXPIRED");
    expect(db.state.listings[0].status).toBe("SOLD");
  });

  it("returns {released: 0} when no expired transactions exist", async () => {
    const db = createMockDb({});
    mockClient = db.client;
    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.released).toBe(0);
  });
});

describe("cron/release-expired — STRESS", () => {
  it("releases 50 expired transactions in one run", async () => {
    const transactions = Array.from({ length: 50 }, (_, i) => ({
      id: `tx${i}`,
      listing_id: `L${i}`,
      status: "PENDING_PAYMENT",
      expiration_date: new Date(Date.now() - HOUR).toISOString(),
    }));
    const listings = Array.from({ length: 50 }, (_, i) => ({
      id: `L${i}`,
      status: "LOCKED",
    }));
    const db = createMockDb({ transactions, listings, offers: [] });
    mockClient = db.client;
    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.released).toBe(50);
    expect(db.state.transactions.every((t) => t.status === "EXPIRED")).toBe(
      true,
    );
    expect(db.state.listings.every((l) => l.status === "ACTIVE")).toBe(true);
  });
});

// ── Fix C: avant d'expirer une transaction PENDING_PAYMENT périmée, le cron
//    réconcilie auprès de Stripe. Si Stripe confirme le paiement → recovered,
//    pas expirée. Sur erreur Stripe → on n'expire pas ce tour-ci. ─────────────
describe("cron/release-expired — Fix C: réconciliation avant expiration", () => {
  it("transaction périmée que Stripe dit PAYÉE → recovered>=1, released=0, NON expirée, listing NON relisté", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          stripe_checkout_session_id: "cs_paid_1",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [],
    });
    mockClient = db.client;
    // reconcile finalise réellement la transaction (comme en prod) et renvoie PAID.
    reconcileSessionImpl = async (txId) => {
      const tx = db.state.transactions.find((t) => t.id === txId);
      if (tx) tx.status = "PAID";
      return "PAID";
    };

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recovered).toBeGreaterThanOrEqual(1);
    expect(json.released).toBe(0);
    // La transaction n'a PAS été expirée.
    expect(db.state.transactions[0].status).not.toBe("EXPIRED");
    expect(db.state.transactions[0].status).toBe("PAID");
    // Le listing n'a PAS été relisté (reste LOCKED → SOLD géré par finalize).
    expect(db.state.listings[0].status).toBe("LOCKED");
  });

  it("transaction périmée réellement impayée (reconcile → PENDING_PAYMENT) → released>=1, EXPIRED, listing ACTIVE", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          stripe_checkout_session_id: "cs_unpaid_1",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [],
    });
    mockClient = db.client;
    reconcileSessionImpl = async () => "PENDING_PAYMENT";

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.released).toBeGreaterThanOrEqual(1);
    expect(json.recovered).toBe(0);
    expect(db.state.transactions[0].status).toBe("EXPIRED");
    expect(db.state.listings[0].status).toBe("ACTIVE");
  });

  it("erreur Stripe pendant reconcile → la transaction n'est PAS expirée ce tour-ci, pas de 500 global", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          stripe_checkout_session_id: "cs_err_1",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [],
    });
    mockClient = db.client;
    reconcileSessionImpl = async () => {
      throw new Error("[chaos] Stripe down");
    };

    const res = await GET(authedReq());
    // Pas de 500 global : l'erreur est avalée par tx, on continue prudemment.
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.released).toBe(0);
    expect(json.recovered).toBe(0);
    expect(db.state.transactions[0].status).toBe("PENDING_PAYMENT");
    expect(db.state.listings[0].status).toBe("LOCKED");
  });

  it("réconcilie via PaymentIntent (flux mobile) quand seul stripe_payment_intent_id est présent", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          stripe_payment_intent_id: "pi_paid_1",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [],
    });
    mockClient = db.client;
    reconcilePIImpl = async (txId) => {
      const tx = db.state.transactions.find((t) => t.id === txId);
      if (tx) tx.status = "PAID";
      return "PAID";
    };

    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.recovered).toBeGreaterThanOrEqual(1);
    expect(json.released).toBe(0);
    expect(db.state.transactions[0].status).toBe("PAID");
    expect(db.state.listings[0].status).toBe("LOCKED");
  });
});
