import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit-log";
import { adminActionRateLimit, applyRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Body schema. We accept Stripe's official refund reasons + a free-form
 * internal note that gets stored in the audit log AND on the Stripe refund
 * metadata so finance can correlate later.
 */
const refundSchema = z.object({
  transaction_id: z.string().uuid(),
  /**
   * Amount in EUR. Omit for a full refund of the remaining unrefunded
   * portion. Must not exceed (total_amount - already refunded).
   */
  amount: z.number().positive().max(100_000).optional(),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]),
  internal_note: z
    .string()
    .min(10, "Note interne trop courte (10+ caracteres)")
    .max(2000),
});

/**
 * POST /api/admin/refund
 *
 * Issues a refund on a transaction's Stripe charge. The actual database
 * mutations (transactions.refunded_amount, wallet debit, status update,
 * notifications) are NOT done here — they happen in the
 * `charge.refunded` webhook handler so refunds initiated outside this
 * route (e.g. from the Stripe dashboard) follow the same code path.
 *
 * That single-source-of-truth design means a network blip between
 * `stripe.refunds.create` and our DB mutate cannot leave us inconsistent.
 *
 * Idempotency:
 *   We send `Idempotency-Key: refund-{tx}-{ts}` so a network retry from
 *   the admin's browser within 24h lands the same Stripe refund instead
 *   of creating a duplicate.
 */
export async function POST(request: Request) {
  try {
    const guard = await requireAdmin();
    if (guard instanceof NextResponse) return guard;
    const { user } = guard;

    const rateLimitRes = await applyRateLimit(adminActionRateLimit, user.id);
    if (rateLimitRes) return rateLimitRes;

    const body = await request.json();
    const validation = refundSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validation.error.flatten() },
        { status: 400 },
      );
    }
    const { transaction_id, amount, reason, internal_note } = validation.data;

    const admin = createAdminClient();

    const { data: transaction, error: txError } = await admin
      .from("transactions")
      .select(
        "id, status, total_amount, refunded_amount, stripe_payment_intent_id, stripe_charge_id",
      )
      .eq("id", transaction_id)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: "Transaction introuvable" },
        { status: 404 },
      );
    }

    if (
      !["PAID", "SHIPPED", "COMPLETED", "DISPUTED"].includes(
        transaction.status ?? "",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Cette transaction n'est pas dans un état remboursable (PAID/SHIPPED/COMPLETED/DISPUTED).",
        },
        { status: 400 },
      );
    }

    const alreadyRefunded = Number(transaction.refunded_amount ?? 0);
    const total = Number(transaction.total_amount ?? 0);
    const remaining = round2(total - alreadyRefunded);

    if (remaining <= 0) {
      return NextResponse.json(
        { error: "Cette transaction est déjà entièrement remboursée." },
        { status: 400 },
      );
    }

    const requestedAmount = amount ?? remaining;
    if (requestedAmount > remaining + 0.01) {
      return NextResponse.json(
        {
          error: `Montant trop élevé. Reste remboursable : ${remaining.toFixed(2)} €`,
        },
        { status: 400 },
      );
    }

    if (!transaction.stripe_payment_intent_id) {
      return NextResponse.json(
        {
          error:
            "Cette transaction n'a pas de Payment Intent Stripe — refund impossible automatiquement (procéder manuellement depuis le dashboard).",
        },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const idempotencyKey = `refund-${transaction.id}-${Date.now()}`;

    const refund = await stripe.refunds.create(
      {
        payment_intent: transaction.stripe_payment_intent_id,
        amount: Math.round(requestedAmount * 100),
        reason,
        metadata: {
          transaction_id: transaction.id,
          admin_id: user.id,
          internal_note: internal_note.slice(0, 500),
        },
      },
      { idempotencyKey },
    );

    // Audit log AFTER Stripe call so we don't log refunds that didn't happen.
    // Best-effort — wrapped internally with try/catch.
    await logAdminAction({
      adminId: user.id,
      actionType: "stripe_refund_create",
      resourceType: "transaction",
      resourceId: transaction.id,
      payload: {
        stripe_refund_id: refund.id,
        stripe_payment_intent_id: transaction.stripe_payment_intent_id,
        amount_eur: requestedAmount,
        reason,
        internal_note,
        is_full_refund: requestedAmount === remaining,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      success: true,
      stripe_refund_id: refund.id,
      stripe_refund_status: refund.status,
      amount_refunded: requestedAmount,
      message:
        "Remboursement créé. Le statut final sera reflété par le webhook `charge.refunded`.",
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin/refund] Error:", err);

    if (isStripeError(err)) {
      return NextResponse.json(
        {
          error:
            err.message ?? "Erreur Stripe lors de la création du remboursement",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isStripeError(
  err: unknown,
): err is { type: string; code?: string; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    typeof (err as Record<string, unknown>).type === "string"
  );
}
