import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe/server";

export const CONNECT_ACCOUNT_INCLUDE = [
  "configuration.recipient",
  "defaults",
  "identity",
  "requirements",
] satisfies Stripe.V2.Core.AccountRetrieveParams.Include[];

export type StripeRecipientAccount = Stripe.V2.Core.Account;
export type StripeRecipientCapabilityStatus =
  | "active"
  | "pending"
  | "restricted"
  | "unsupported";

export async function retrieveStripeRecipientAccount(
  accountId: string,
): Promise<StripeRecipientAccount> {
  return getStripe("connect").v2.core.accounts.retrieve(accountId, {
    include: CONNECT_ACCOUNT_INCLUDE,
  });
}

export function getStripeRecipientCapability(account: StripeRecipientAccount) {
  return account.configuration?.recipient?.capabilities?.stripe_balance
    ?.stripe_transfers;
}

export function getStripePayoutCapability(account: StripeRecipientAccount) {
  return account.configuration?.recipient?.capabilities?.stripe_balance
    ?.payouts;
}
