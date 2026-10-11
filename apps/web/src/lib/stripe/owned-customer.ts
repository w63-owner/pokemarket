import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { stripeIdempotencyKeys } from "@/lib/stripe/idempotency";
import { getStripe } from "@/lib/stripe/server";

/**
 * A stored customer id is usable only when Stripe says this user created it.
 * Profiles are writable by their owner, so the column alone is not proof.
 */
export function stripeCustomerIsOwnedBy(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  userId: string,
): customer is Stripe.Customer {
  if ("deleted" in customer && customer.deleted) return false;
  return customer.metadata?.supabase_user_id === userId;
}

function isMissingStripeCustomer(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "resource_missing"
  );
}

async function clearStoredCustomerId(
  userId: string,
  storedId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ stripe_customer_id: null })
    .eq("id", userId)
    .eq("stripe_customer_id", storedId);

  if (error) throw error;
}

/**
 * Returns the caller's Stripe customer, or null after dropping an id that
 * belongs to someone else (or no longer exists).
 */
export async function loadOwnedStripeCustomer(
  userId: string,
): Promise<Stripe.Customer | null> {
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  const storedId = profile?.stripe_customer_id;
  if (!storedId) return null;

  const stripe = getStripe();
  try {
    const customer = await stripe.customers.retrieve(storedId);
    if (stripeCustomerIsOwnedBy(customer, userId)) return customer;
  } catch (retrieveError) {
    if (!isMissingStripeCustomer(retrieveError)) throw retrieveError;
  }

  await clearStoredCustomerId(userId, storedId);
  return null;
}

/**
 * Returns a Stripe customer whose metadata is bound to this user, creating
 * one when the profile has no owned customer yet.
 */
export async function getOrCreateStripeCustomer(input: {
  userId: string;
  email?: string | null;
  username?: string | null;
}): Promise<Stripe.Customer> {
  const existing = await loadOwnedStripeCustomer(input.userId);
  if (existing) return existing;

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("username")
    .eq("id", input.userId)
    .single();

  if (profileError) throw profileError;

  const stripe = getStripe();
  const created = await stripe.customers.create(
    {
      email: input.email ?? undefined,
      name: input.username ?? profile?.username ?? undefined,
      metadata: { supabase_user_id: input.userId },
    },
    { idempotencyKey: stripeIdempotencyKeys.customer(input.userId) },
  );

  const { data: saved, error: saveError } = await admin
    .from("profiles")
    .update({ stripe_customer_id: created.id })
    .eq("id", input.userId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id")
    .maybeSingle();

  if (saveError) throw saveError;
  if (saved?.stripe_customer_id === created.id) return created;

  const rebound = await loadOwnedStripeCustomer(input.userId);
  if (rebound) return rebound;

  throw new Error("Unable to bind Stripe customer");
}
