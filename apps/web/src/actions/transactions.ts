"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TransactionActionResult =
  | { success: true }
  | { success: false; error: string };

interface ConfirmReceptionInput {
  transactionId: string;
  rating: number;
  comment: string | null;
  conversationId: string;
}

/**
 * Confirms buyer reception of an order.
 *
 * Runs entirely server-side so that:
 *  - The RPC `release_escrow_funds` executes with the buyer's verified session
 *    (auth.uid() is set from the cookie, satisfying the RPC's ownership check).
 *  - `revalidatePath` can be called to bust the Next.js cache for the wallet
 *    and orders pages without an extra client-side round-trip.
 *
 * The RPC atomically:
 *   1. Locks the transaction row (FOR UPDATE)
 *   2. Validates buyer ownership + SHIPPED status
 *   3. Sets status → COMPLETED
 *   4. Moves seller_net from pending_balance → available_balance
 *
 * Review insertion and system message are done here (outside the RPC) because
 * they are non-financial and can tolerate a separate statement.
 */
export async function confirmReceptionAction(
  input: ConfirmReceptionInput,
): Promise<TransactionActionResult> {
  const { transactionId, rating, comment, conversationId } = input;

  if (!transactionId || !conversationId) {
    return { success: false, error: "Paramètres invalides" };
  }

  if (rating < 1 || rating > 5) {
    return { success: false, error: "La note doit être comprise entre 1 et 5" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Non authentifié" };
  }

  // ── 1. Pre-fetch seller_id for the review ─────────────────────────────────
  // This also acts as an early ownership guard before hitting the RPC.
  const { data: tx, error: fetchError } = await supabase
    .from("transactions")
    .select("seller_id")
    .eq("id", transactionId)
    .eq("buyer_id", user.id)
    .eq("status", "SHIPPED")
    .single();

  if (fetchError || !tx) {
    return {
      success: false,
      error: "Transaction introuvable ou action non autorisée",
    };
  }

  // ── 2. Atomic escrow release via RPC ──────────────────────────────────────
  // The RPC performs a SELECT FOR UPDATE, status transition, and wallet update
  // in a single DB transaction. auth.uid() inside the RPC equals user.id here
  // because the server Supabase client forwards the session cookie.
  const { data: released, error: rpcError } = await supabase.rpc(
    "release_escrow_funds",
    { p_transaction_id: transactionId, p_buyer_id: user.id },
  );

  if (rpcError) {
    if (rpcError.code === "42501") {
      return {
        success: false,
        error:
          "Action non autorisée : seul l'acheteur peut confirmer la réception",
      };
    }
    if (rpcError.code === "P0001") {
      return {
        success: false,
        error: "Cette commande ne peut pas être finalisée dans son état actuel",
      };
    }
    console.error("[confirmReception] RPC error:", rpcError);
    return {
      success: false,
      error: "Erreur lors de la finalisation de la commande",
    };
  }

  if (!released) {
    return { success: false, error: "Échec de la libération de l'escrow" };
  }

  // ── 3. Insert review ──────────────────────────────────────────────────────
  const { error: reviewError } = await supabase.from("reviews").insert({
    transaction_id: transactionId,
    reviewer_id: user.id,
    reviewee_id: tx.seller_id,
    rating,
    ...(comment && { comment }),
  });

  if (reviewError) {
    // Review failure is non-blocking: the escrow is already released.
    // Log and continue so the buyer isn't stuck.
    console.error("[confirmReception] review insert failed:", reviewError);
  }

  // ── 4. System message in conversation ─────────────────────────────────────
  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: "Vente finalisée",
    message_type: "sale_completed",
    metadata: { rating, ...(comment && { comment }) },
  });

  if (msgError) {
    console.error("[confirmReception] message insert failed:", msgError);
  }

  // ── 5. Bust Next.js server cache ──────────────────────────────────────────
  // The wallet page renders pending/available balances as a Server Component;
  // revalidate so the seller sees the updated available_balance immediately.
  revalidatePath("/wallet");
  // Order history lists and detail pages reflect the new COMPLETED status.
  revalidatePath("/orders");
  revalidatePath(`/orders/${transactionId}`);

  return { success: true };
}
