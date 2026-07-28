import { createClient } from "@supabase/supabase-js";
import type { Database } from "@pokemarket/shared";
import { config } from "dotenv";
import { resolve } from "path";
import Stripe from "stripe";

import { STRIPE_API_VERSION } from "../src/lib/env";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const paymentsKey = required("STRIPE_PAYMENTS_API_KEY");
const operationsKey = required("STRIPE_OPERATIONS_API_KEY");
const allowLive = process.argv.includes("--allow-live");

if (
  !allowLive &&
  (paymentsKey.startsWith("rk_live_") || operationsKey.startsWith("rk_live_"))
) {
  throw new Error(
    "Live Stripe reconciliation requires the explicit --allow-live flag",
  );
}

async function main(): Promise<void> {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stripeOptions: Stripe.StripeConfig = {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  };
  const paymentsStripe = new Stripe(paymentsKey, stripeOptions);
  const operationsStripe = new Stripe(operationsKey, stripeOptions);
  const issues: string[] = [];

  const [
    transactionsResult,
    journalsResult,
    entriesResult,
    transfersResult,
    alertsResult,
    risksResult,
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, status, total_amount, refunded_amount_minor, stripe_charge_id, stripe_payment_intent_id",
      )
      .in("status", ["PAID", "SHIPPED", "COMPLETED", "DISPUTED", "REFUNDED"]),
    supabase
      .from("ledger_transactions")
      .select(
        "id, transaction_id, journal_type, stripe_charge_id, stripe_payment_intent_id, stripe_transfer_id",
      ),
    supabase
      .from("ledger_entries")
      .select("ledger_transaction_id, amount_minor"),
    supabase
      .from("seller_transfers")
      .select(
        "transaction_id, amount_minor, source_charge_id, stripe_account_id, stripe_transfer_id, transfer_group",
      ),
    supabase
      .from("financial_reconciliation_alerts")
      .select("alert_type, entity_id, expected_minor, actual_minor"),
    supabase
      .from("seller_risk_accounts")
      .select("seller_id, debt_minor, payouts_blocked")
      .or("debt_minor.gt.0,payouts_blocked.eq.true"),
  ]);

  for (const result of [
    transactionsResult,
    journalsResult,
    entriesResult,
    transfersResult,
    alertsResult,
    risksResult,
  ]) {
    if (result.error) throw result.error;
  }

  for (const alert of alertsResult.data ?? []) {
    issues.push(
      `DB alert ${alert.alert_type ?? "unknown"} on ${alert.entity_id ?? "unknown"}: expected=${alert.expected_minor ?? "n/a"} actual=${alert.actual_minor ?? "n/a"}`,
    );
  }
  for (const risk of risksResult.data ?? []) {
    issues.push(
      `Seller ${risk.seller_id} remains blocked or indebted: debt=${risk.debt_minor}`,
    );
  }

  const entriesByJournal = new Map<string, number>();
  for (const entry of entriesResult.data ?? []) {
    entriesByJournal.set(
      entry.ledger_transaction_id,
      (entriesByJournal.get(entry.ledger_transaction_id) ?? 0) +
        entry.amount_minor,
    );
  }

  const journalsByTransaction = new Map<
    string,
    NonNullable<typeof journalsResult.data>
  >();
  for (const journal of journalsResult.data ?? []) {
    if (!journal.transaction_id) continue;
    const journals = journalsByTransaction.get(journal.transaction_id) ?? [];
    journals.push(journal);
    journalsByTransaction.set(journal.transaction_id, journals);
    if ((entriesByJournal.get(journal.id) ?? 0) !== 0) {
      issues.push(`Ledger journal ${journal.id} is not balanced`);
    }
  }

  for (const transaction of transactionsResult.data ?? []) {
    const journals = journalsByTransaction.get(transaction.id) ?? [];
    const paymentJournal = journals.find(
      (journal) => journal.journal_type === "payment_captured",
    );
    if (!paymentJournal) {
      issues.push(
        `Transaction ${transaction.id} has no payment_captured journal`,
      );
    }
    if (!transaction.stripe_charge_id) {
      issues.push(`Transaction ${transaction.id} has no Stripe charge`);
      continue;
    }

    try {
      const charge = await paymentsStripe.charges.retrieve(
        transaction.stripe_charge_id,
      );
      const expectedMinor = Math.round(transaction.total_amount * 100);
      if (!charge.paid || charge.amount !== expectedMinor) {
        issues.push(
          `Charge ${charge.id} mismatch: paid=${charge.paid} amount=${charge.amount} expected=${expectedMinor}`,
        );
      }
      if (charge.amount_refunded !== transaction.refunded_amount_minor) {
        issues.push(
          `Charge ${charge.id} refund mismatch: Stripe=${charge.amount_refunded} DB=${transaction.refunded_amount_minor}`,
        );
      }
      if (charge.metadata.transaction_id !== transaction.id) {
        issues.push(`Charge ${charge.id} has incorrect transaction metadata`);
      }
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (
        transaction.stripe_payment_intent_id &&
        paymentIntentId !== transaction.stripe_payment_intent_id
      ) {
        issues.push(
          `Charge ${charge.id} PaymentIntent differs from the database`,
        );
      }
    } catch (cause) {
      issues.push(
        `Unable to retrieve charge ${transaction.stripe_charge_id}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  for (const transfer of transfersResult.data ?? []) {
    if (!transfer.stripe_transfer_id) continue;
    try {
      const stripeTransfer = await operationsStripe.transfers.retrieve(
        transfer.stripe_transfer_id,
      );
      const destinationId =
        typeof stripeTransfer.destination === "string"
          ? stripeTransfer.destination
          : stripeTransfer.destination?.id;
      const sourceChargeId =
        typeof stripeTransfer.source_transaction === "string"
          ? stripeTransfer.source_transaction
          : stripeTransfer.source_transaction?.id;
      if (
        stripeTransfer.amount !== transfer.amount_minor ||
        destinationId !== transfer.stripe_account_id ||
        sourceChargeId !== transfer.source_charge_id ||
        stripeTransfer.transfer_group !== transfer.transfer_group ||
        stripeTransfer.metadata.transaction_id !== transfer.transaction_id
      ) {
        issues.push(`Transfer ${stripeTransfer.id} differs from the database`);
      }
    } catch (cause) {
      issues.push(
        `Unable to retrieve transfer ${transfer.stripe_transfer_id}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  const summary = {
    checkedTransactions: transactionsResult.data?.length ?? 0,
    checkedTransfers:
      transfersResult.data?.filter((transfer) => transfer.stripe_transfer_id)
        .length ?? 0,
    issues,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (issues.length > 0) process.exitCode = 1;
}

void main().catch((cause: unknown) => {
  process.stderr.write(
    `${cause instanceof Error ? cause.message : String(cause)}\n`,
  );
  process.exitCode = 1;
});
