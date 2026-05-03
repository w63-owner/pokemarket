import { createAdminClient } from "@/lib/supabase/admin";
import { DisputesAdminView } from "./disputes-view";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

export type InternalDisputeRow = {
  id: string;
  transaction_id: string;
  opened_by_username: string | null;
  reason: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
  buyer_username: string | null;
  seller_username: string | null;
  listing_title: string | null;
  total_amount: number | null;
};

export type StripeDisputeRow = {
  id: string;
  stripe_dispute_id: string;
  stripe_charge_id: string;
  transaction_id: string | null;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  outcome: string | null;
  evidence_due_by: string | null;
  evidence_submitted_at: string | null;
  created_at: string;
  buyer_username: string | null;
  seller_username: string | null;
  listing_title: string | null;
};

export default async function AdminDisputesPage() {
  let internalDisputes: InternalDisputeRow[] = [];
  let stripeDisputes: StripeDisputeRow[] = [];

  try {
    const admin = createAdminClient();

    // ── Internal C2C disputes (table from migration 00007).
    //
    // The disputes table only has FKs back to transactions and profiles, so
    // we hand-resolve the buyer/seller/listing names with a follow-up batch
    // query rather than relying on PostgREST embeddings (which would require
    // dedicated FK definitions that may not exist yet).
    const { data: rawInternal } = await admin
      .from("disputes")
      .select(
        "id, transaction_id, opened_by, reason, description, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    const internalRows = rawInternal ?? [];

    const { data: rawStripe } = await admin
      .from("stripe_disputes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    const stripeRows = rawStripe ?? [];

    const txIds = Array.from(
      new Set(
        [
          ...internalRows.map((d) => d.transaction_id),
          ...stripeRows
            .map((d) => d.transaction_id)
            .filter((v): v is string => !!v),
        ].filter(Boolean),
      ),
    );

    const userIds = Array.from(
      new Set(internalRows.map((d) => d.opened_by).filter(Boolean)),
    );

    const txById = new Map<
      string,
      {
        buyer_id: string;
        seller_id: string;
        listing_title: string | null;
        total_amount: number;
      }
    >();
    if (txIds.length > 0) {
      const { data: txs } = await admin
        .from("transactions")
        .select("id, buyer_id, seller_id, listing_title, total_amount")
        .in("id", txIds);
      for (const tx of txs ?? []) {
        txById.set(tx.id, {
          buyer_id: tx.buyer_id,
          seller_id: tx.seller_id,
          listing_title: tx.listing_title ?? null,
          total_amount: Number(tx.total_amount),
        });
      }
    }

    const allProfileIds = Array.from(
      new Set(
        [
          ...userIds,
          ...txById
            .values()
            .toArray()
            .flatMap((tx) => [tx.buyer_id, tx.seller_id]),
        ].filter(Boolean),
      ),
    );

    const usernameById = new Map<string, string>();
    if (allProfileIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, username")
        .in("id", allProfileIds);
      for (const p of profiles ?? []) {
        usernameById.set(p.id, p.username);
      }
    }

    internalDisputes = internalRows.map((d) => {
      const tx = txById.get(d.transaction_id);
      return {
        id: d.id,
        transaction_id: d.transaction_id,
        opened_by_username: usernameById.get(d.opened_by ?? "") ?? null,
        reason: d.reason,
        description: d.description,
        status: d.status,
        created_at: d.created_at,
        buyer_username: tx ? (usernameById.get(tx.buyer_id) ?? null) : null,
        seller_username: tx ? (usernameById.get(tx.seller_id) ?? null) : null,
        listing_title: tx?.listing_title ?? null,
        total_amount: tx?.total_amount ?? null,
      };
    });

    stripeDisputes = stripeRows.map((d) => {
      const tx = d.transaction_id ? txById.get(d.transaction_id) : undefined;
      return {
        id: d.id,
        stripe_dispute_id: d.stripe_dispute_id,
        stripe_charge_id: d.stripe_charge_id,
        transaction_id: d.transaction_id,
        amount: Number(d.amount),
        currency: d.currency,
        reason: d.reason,
        status: d.status,
        outcome: d.outcome,
        evidence_due_by: d.evidence_due_by,
        evidence_submitted_at: d.evidence_submitted_at,
        created_at: d.created_at,
        buyer_username: tx ? (usernameById.get(tx.buyer_id) ?? null) : null,
        seller_username: tx ? (usernameById.get(tx.seller_id) ?? null) : null,
        listing_title: tx?.listing_title ?? null,
      };
    });
  } catch (err) {
    // Don't crash the admin shell if Supabase is briefly unreachable —
    // surface an empty state instead.
    console.error("AdminDisputesPage: failed to load disputes", err);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Gestion des litiges
        </h1>
        <p className="text-muted-foreground text-sm">
          Litiges internes acheteur-vendeur et chargebacks bancaires Stripe.
        </p>
      </div>

      <DisputesAdminView
        internalDisputes={internalDisputes}
        stripeDisputes={stripeDisputes}
      />
    </div>
  );
}
