import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto-complete SHIPPED transactions after 14 days.
 *
 * If the buyer hasn't confirmed reception within 14 days of shipping,
 * we automatically release the escrow to the seller. This protects
 * sellers from inactive/disappeared buyers while giving buyers
 * ample time to report issues.
 *
 * The buyer receives a warning at day 12 (via reception-reminders cron)
 * before this kicks in.
 */
const AUTO_COMPLETE_AFTER_DAYS = 14;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUTO_COMPLETE_AFTER_DAYS);

    // Find all SHIPPED transactions where shipped_at is older than 14 days
    const { data: txs, error: fetchError } = await admin
      .from("transactions")
      .select("id, buyer_id, seller_id, listing_id, listing_title")
      .eq("status", "SHIPPED")
      .lt("shipped_at", cutoffDate.toISOString());

    if (fetchError) throw fetchError;

    if (!txs || txs.length === 0) {
      return NextResponse.json({ auto_completed: 0 });
    }

    let completed = 0;
    const errors: string[] = [];

    for (const tx of txs) {
      try {
        // Call the RPC with service_role (auth.uid() = NULL → allowed)
        const { data: released, error: rpcError } = await admin.rpc(
          "release_escrow_funds",
          { p_transaction_id: tx.id, p_buyer_id: tx.buyer_id },
        );

        if (rpcError) {
          // Skip if already completed (race condition) or other issue
          if (rpcError.code === "P0001") {
            // Status mismatch — likely already completed
            continue;
          }
          throw rpcError;
        }

        if (!released) {
          errors.push(`tx=${tx.id}: release_escrow_funds returned false`);
          continue;
        }

        // `transactions` has no direct conversation FK, so resolve the
        // buyer/seller conversation for this listing via the (listing, buyer,
        // seller) tuple that uniquely identifies it, then drop a system card.
        const { data: conversation } = await admin
          .from("conversations")
          .select("id")
          .eq("listing_id", tx.listing_id)
          .eq("buyer_id", tx.buyer_id)
          .eq("seller_id", tx.seller_id)
          .maybeSingle();

        if (conversation?.id) {
          await admin.from("messages").insert({
            conversation_id: conversation.id,
            sender_id: tx.buyer_id, // System message attributed to buyer
            content: "Vente finalisée automatiquement (14 jours écoulés)",
            message_type: "sale_completed",
            metadata: { auto_completed: true, days: AUTO_COMPLETE_AFTER_DAYS },
          });
        }

        // Notify seller: funds released
        await sendPushNotification(
          tx.seller_id,
          "Vente finalisée ! 🎉",
          `Le paiement pour ${tx.listing_title ?? "votre carte"} a été libéré automatiquement après 14 jours.`,
          "/wallet",
          { category: "commerce" },
        ).catch((err) => {
          Sentry.captureException(err);
        });

        // Notify buyer: transaction auto-completed
        await sendPushNotification(
          tx.buyer_id,
          "Commande finalisée automatiquement",
          `Votre commande ${tx.listing_title ?? ""} a été marquée comme reçue après 14 jours.`,
          `/orders/${tx.id}`,
          { category: "commerce" },
        ).catch((err) => {
          Sentry.captureException(err);
        });

        completed++;
      } catch (err) {
        Sentry.captureException(err);
        errors.push(
          `tx=${tx.id}: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    }

    return NextResponse.json({
      auto_completed: completed,
      total_eligible: txs.length,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[cron/auto-complete-shipped] Failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
