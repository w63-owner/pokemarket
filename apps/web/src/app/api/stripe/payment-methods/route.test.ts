import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string; email?: string } | null = {
  id: "user-1",
  email: "buyer@example.com",
};
let mockClient: ReturnType<typeof createMockDb>["client"];
let db: ReturnType<typeof createMockDb>;

const listPaymentMethods = vi.fn();
const retrievePaymentMethod = vi.fn();
const detachPaymentMethod = vi.fn();
const retrieveCustomer = vi.fn();
const updateCustomer = vi.fn();
const createCustomer = vi.fn();
const createSetupIntent = vi.fn();
const createCustomerSession = vi.fn();

vi.mock("@/lib/auth/api", () => ({
  getRequestUserClient: async () => ({
    user: currentUser,
    supabase: currentUser ? { from: vi.fn() } : null,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    paymentMethods: {
      list: listPaymentMethods,
      retrieve: retrievePaymentMethod,
      detach: detachPaymentMethod,
    },
    customers: {
      retrieve: retrieveCustomer,
      update: updateCustomer,
      create: createCustomer,
    },
    setupIntents: { create: createSetupIntent },
    customerSessions: { create: createCustomerSession },
  }),
}));

vi.mock("@/lib/env", () => ({
  getAppUrl: () => "https://thedeckdealr.test",
}));

vi.mock("@/lib/stripe/idempotency", () => ({
  stripeIdempotencyKeys: {
    customer: (userId: string) => `customer:${userId}`,
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { DELETE, GET, PATCH, POST } from "./route";

const endpoint = "https://thedeckdealr.test/api/stripe/payment-methods";

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { id: "user-1", email: "buyer@example.com" };
  db = createMockDb({
    profiles: [
      {
        id: "user-1",
        stripe_customer_id: "cus_owner",
        username: "buyer",
      },
    ],
  });
  mockClient = db.client;

  listPaymentMethods.mockResolvedValue({
    data: [
      {
        id: "pm_default",
        type: "card",
        card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
      },
    ],
  });
  retrieveCustomer.mockResolvedValue({
    id: "cus_owner",
    deleted: false,
    metadata: { supabase_user_id: "user-1" },
    invoice_settings: { default_payment_method: "pm_default" },
  });
  retrievePaymentMethod.mockResolvedValue({
    id: "pm_default",
    customer: "cus_owner",
  });
  updateCustomer.mockResolvedValue({});
  detachPaymentMethod.mockResolvedValue({});
  createSetupIntent.mockResolvedValue({ client_secret: "seti_secret" });
  createCustomerSession.mockResolvedValue({
    client_secret: "cuss_secret",
  });
});

describe("/api/stripe/payment-methods", () => {
  it("accepts the request auth helper and marks the default card", async () => {
    const response = await GET(new Request(endpoint));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      payment_methods: [
        expect.objectContaining({ id: "pm_default", is_default: true }),
      ],
    });
  });

  it("rejects unauthenticated requests", async () => {
    currentUser = null;

    const response = await GET(new Request(endpoint));

    expect(response.status).toBe(401);
    expect(listPaymentMethods).not.toHaveBeenCalled();
  });

  it("returns the complete mobile PaymentSheet contract", async () => {
    const response = await POST(new Request(endpoint, { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      client_secret: "seti_secret",
      customer_id: "cus_owner",
      customer_session_client_secret: "cuss_secret",
    });
  });

  it("cannot set another customer's payment method as default", async () => {
    retrievePaymentMethod.mockResolvedValue({
      id: "pm_other",
      customer: "cus_other",
    });

    const response = await PATCH(
      new Request(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payment_method_id: "pm_other" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(updateCustomer).not.toHaveBeenCalled();
  });

  it("does not list or detach cards when the profile points at another customer", async () => {
    db.state.profiles[0].stripe_customer_id = "cus_victim";
    retrieveCustomer.mockResolvedValue({
      id: "cus_victim",
      deleted: false,
      metadata: { supabase_user_id: "victim-user" },
      invoice_settings: { default_payment_method: "pm_victim" },
    });

    const listed = await GET(new Request(endpoint));
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({ payment_methods: [] });
    expect(listPaymentMethods).not.toHaveBeenCalled();
    expect(db.state.profiles[0].stripe_customer_id).toBeNull();

    db.state.profiles[0].stripe_customer_id = "cus_victim";
    const removed = await DELETE(new Request(`${endpoint}?id=pm_victim`));
    expect(removed.status).toBe(404);
    expect(detachPaymentMethod).not.toHaveBeenCalled();
  });
});
