/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

// ── Fix D: la clé d'idempotence transfer/payout doit être UNIQUE par tentative
//    (crypto.randomUUID()), pas amount+jour. Sinon un 2e virement du même
//    montant le même jour serait avalé par la fenêtre d'idempotence Stripe
//    (no-op) alors que le wallet est zéroté → perte de fonds du vendeur. ───────

const transfersCreate = vi.fn(async (_params: any, _opts: any) => ({
  id: `tr_${Math.random().toString(36).slice(2)}`,
}));
const payoutsCreate = vi.fn(async (_params: any, _opts: any) => ({
  id: `po_${Math.random().toString(36).slice(2)}`,
}));
const accountsRetrieve = vi.fn(async () => ({
  charges_enabled: true,
  payouts_enabled: true,
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    transfers: { create: transfersCreate },
    payouts: { create: payoutsCreate },
    accounts: { retrieve: accountsRetrieve },
  }),
}));

let currentUser: { id: string; email?: string } | null = {
  id: "seller-1",
  email: "seller@example.com",
};
vi.mock("@/lib/auth/api", () => ({
  getRequestUser: vi.fn(async () => ({
    user: currentUser,
    source: "bearer" as const,
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(async () => null),
  payoutRateLimit: {} as any,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { POST } from "./route";

beforeEach(() => {
  currentUser = { id: "seller-1", email: "seller@example.com" };
  transfersCreate.mockClear();
  payoutsCreate.mockClear();
  accountsRetrieve.mockClear();
});

function req() {
  return new Request("http://localhost/api/stripe-connect/payout", {
    method: "POST",
  });
}

function payoutScenario(balance = 50) {
  return {
    profiles: [{ id: "seller-1", stripe_account_id: "acct_seller_1" }],
    wallets: [
      {
        user_id: "seller-1",
        available_balance: balance,
        currency: "eur",
        version: 0,
      },
    ],
  };
}

describe("payout — Fix D: clé d'idempotence unique par tentative", () => {
  it("deux virements successifs du MÊME montant → deux idempotencyKey DIFFÉRENTS pour transfers.create", async () => {
    const db = createMockDb(payoutScenario(50));
    mockClient = db.client;

    const res1 = await POST(req());
    expect(res1.status).toBe(200);

    // Le wallet est re-crédité du même montant entre les deux virements.
    db.state.wallets[0].available_balance = 50;

    const res2 = await POST(req());
    expect(res2.status).toBe(200);

    expect(transfersCreate).toHaveBeenCalledTimes(2);
    const key1 = transfersCreate.mock.calls[0][1].idempotencyKey;
    const key2 = transfersCreate.mock.calls[1][1].idempotencyKey;
    expect(key1).toBeTruthy();
    expect(key2).toBeTruthy();
    // Cœur du fix : sinon le 2e transfer serait un no-op et le vendeur
    // perdrait l'argent.
    expect(key1).not.toBe(key2);

    // Les clés payout suivent le même token unique → différentes elles aussi.
    const payoutKey1 = payoutsCreate.mock.calls[0][1].idempotencyKey;
    const payoutKey2 = payoutsCreate.mock.calls[1][1].idempotencyKey;
    expect(payoutKey1).not.toBe(payoutKey2);
  });

  it("verrou optimiste : un double-submit concurrent → un 200, un 409, transfers.create appelé une seule fois", async () => {
    const db = createMockDb(payoutScenario(50), { serializeWrites: true });
    mockClient = db.client;

    const [a, b] = await Promise.all([POST(req()), POST(req())]);
    const codes = [a.status, b.status];

    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(1);
    // Le perdant du verrou (available_balance déjà déduit) n'atteint JAMAIS Stripe.
    expect(transfersCreate).toHaveBeenCalledTimes(1);
    // Le wallet a été déduit exactement une fois.
    expect(db.state.wallets[0].available_balance).toBe(0);
  });

  it("solde nul → 400, aucun transfer Stripe", async () => {
    const db = createMockDb(payoutScenario(0));
    mockClient = db.client;
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(transfersCreate).not.toHaveBeenCalled();
  });
});
