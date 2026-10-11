import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { stripeCustomerIsOwnedBy } from "./owned-customer";

describe("stripeCustomerIsOwnedBy", () => {
  it("accepts the customer this user created", () => {
    const customer = {
      id: "cus_owner",
      metadata: { supabase_user_id: "user-1" },
    } as unknown as Stripe.Customer;

    expect(stripeCustomerIsOwnedBy(customer, "user-1")).toBe(true);
  });

  it("rejects a customer id copied from another profile", () => {
    const customer = {
      id: "cus_victim",
      metadata: { supabase_user_id: "victim" },
    } as unknown as Stripe.Customer;

    expect(stripeCustomerIsOwnedBy(customer, "user-1")).toBe(false);
  });

  it("rejects a customer with no owner metadata", () => {
    const customer = {
      id: "cus_blank",
      metadata: {},
    } as unknown as Stripe.Customer;

    expect(stripeCustomerIsOwnedBy(customer, "user-1")).toBe(false);
  });

  it("rejects a deleted customer", () => {
    const customer = {
      id: "cus_gone",
      deleted: true,
    } as Stripe.DeletedCustomer;

    expect(stripeCustomerIsOwnedBy(customer, "user-1")).toBe(false);
  });
});
