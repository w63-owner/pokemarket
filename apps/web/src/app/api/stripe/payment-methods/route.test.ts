import { beforeEach, describe, expect, it, vi } from "vitest";

let currentUser: { id: string; email?: string } | null = {
  id: "user-1",
  email: "buyer@example.com",
};
let profile = {
  stripe_customer_id: "cus_owner",
  username: "buyer",
};

const listPaymentMethods = vi.fn();
const retrievePaymentMethod = vi.fn();
const detachPaymentMethod = vi.fn();
const retrieveCustomer = vi.fn();
const updateCustomer = vi.fn();
const createCustomer = vi.fn();
const createSetupIntent = vi.fn();
const createCustomerSession = vi.fn();

const supabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({ data: profile, error: null })),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
  })),
};

vi.mock("@/lib/auth/api", () => ({
  getRequestUserClient: async () => ({
    user: currentUser,
    supabase: currentUser ? supabase : null,
  }),
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

import { GET, PATCH, POST } from "./route";

const endpoint = "https://thedeckdealr.test/api/stripe/payment-methods";

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { id: "user-1", email: "buyer@example.com" };
  profile = { stripe_customer_id: "cus_owner", username: "buyer" };

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
    deleted: false,
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
});
