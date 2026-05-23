import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { getRequestUserClient } from "@/lib/auth/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mobile parity wrapper around the `confirmReceptionAction` Server Action.
 *
 * Server Actions only accept the cookie-bound session, so the RN client
 * (which holds its session in AsyncStorage and authenticates via Bearer)
 * cannot invoke them directly. This route mirrors the action's logic
 * 1:1 and uses `getRequestUserClient` to obtain a Supabase client that
 * carries the buyer's JWT — required because `release_escrow_funds`
 * verifies `auth.uid()` server-side.
 */
const bodySchema = z.object({
  transactionId: z.string().uuid(),
  conversationId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getRequestUserClient(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Paramètres invalides" },
        { status: 400 },
      );
    }

    const { transactionId, conversationId, rating, comment } = parsed.data;

    // Pre-fetch the transaction to (a) verify ownership and SHIPPED state
    // before hitting the RPC, and (b) capture the seller_id needed for
    // the review insertion below. The same guard exists in the Server
    // Action — keep them in lock-step.
    const { data: tx, error: fetchError } = await supabase
      .from("transactions")
      .select("seller_id")
      .eq("id", transactionId)
      .eq("buyer_id", user.id)
      .eq("status", "SHIPPED")
      .single();

    if (fetchError || !tx) {
      return NextResponse.json(
        { error: "Transaction introuvable ou action non autorisée" },
        { status: 404 },
      );
    }

    const { data: released, error: rpcError } = await supabase.rpc(
      "release_escrow_funds",
      { p_transaction_id: transactionId, p_buyer_id: user.id },
    );

    if (rpcError) {
      if (rpcError.code === "42501") {
        return NextResponse.json(
          {
            error:
              "Action non autorisée : seul l'acheteur peut confirmer la réception",
          },
          { status: 403 },
        );
      }
      if (rpcError.code === "P0001") {
        return NextResponse.json(
          {
            error:
              "Cette commande ne peut pas être finalisée dans son état actuel",
          },
          { status: 409 },
        );
      }
      Sentry.captureException(rpcError);
      console.error("[confirm-reception] RPC error:", rpcError);
      return NextResponse.json(
        { error: "Erreur lors de la finalisation de la commande" },
        { status: 500 },
      );
    }

    if (!released) {
      return NextResponse.json(
        { error: "Échec de la libération de l'escrow" },
        { status: 500 },
      );
    }

    const { error: reviewError } = await supabase.from("reviews").insert({
      transaction_id: transactionId,
      reviewer_id: user.id,
      reviewee_id: tx.seller_id,
      rating,
      ...(comment && { comment }),
    });

    if (reviewError) {
      // Non-blocking: escrow is released, the buyer is unblocked.
      console.error("[confirm-reception] review insert failed:", reviewError);
    }

    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: "Vente finalisée",
      message_type: "sale_completed",
      metadata: { rating, ...(comment && { comment }) },
    });

    if (msgError) {
      console.error("[confirm-reception] message insert failed:", msgError);
    }

    // Bust the SSR caches consumed by the web app. Mobile clients
    // invalidate their own React Query keys client-side.
    revalidatePath("/wallet");
    revalidatePath("/orders");
    revalidatePath(`/orders/${transactionId}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[confirm-reception] Unexpected error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
