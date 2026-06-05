import type { Metadata } from "next";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { reconcileCheckoutSession } from "@/lib/stripe/reconcile";

const SuccessClient = dynamic(() =>
  import("./success-client").then((mod) => mod.SuccessClient),
);

export const metadata: Metadata = {
  title: "Commande confirmée",
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrderSuccessPage({
  params,
  searchParams,
}: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: transaction } = await supabase
    .from("transactions")
    .select(
      "id, listing_id, listing_title, total_amount, status, stripe_checkout_session_id",
    )
    .eq("id", id)
    .eq("buyer_id", user.id)
    .single();

  if (!transaction) notFound();

  let resolvedStatus = transaction.status ?? "PENDING_PAYMENT";

  if (resolvedStatus === "PENDING_PAYMENT") {
    const stripeSessionId =
      (typeof query.session_id === "string" ? query.session_id : null) ??
      transaction.stripe_checkout_session_id;

    if (stripeSessionId) {
      const result = await reconcileCheckoutSession(
        transaction.id,
        stripeSessionId,
      );

      if (result === "PAID" || result === "ALREADY_PROCESSED") {
        resolvedStatus = "PAID";
      }
    }
  }

  // The conversation is created (or reused) by `finalizePaidTransaction`, so
  // by the time we render a PAID order the thread exists. We look it up to
  // offer a direct "go to the conversation" CTA — the next step for the buyer.
  let conversationId: string | null = null;
  if (transaction.listing_id) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("listing_id", transaction.listing_id)
      .eq("buyer_id", user.id)
      .maybeSingle();
    conversationId = conversation?.id ?? null;
  }

  return (
    <SuccessClient
      transaction={{
        id: transaction.id,
        listing_title: transaction.listing_title,
        total_amount: transaction.total_amount,
        status: resolvedStatus,
      }}
      conversationId={conversationId}
    />
  );
}
