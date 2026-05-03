import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { adminMutationRateLimit, applyRateLimit } from "@/lib/rate-limit";
import { refundRequestSchema, type RefundReason } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFUNDABLE_STATUSES = new Set([
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "DISPUTED",
]);

/**
 * POST /api/admin/refund
 *
 * Issue a (full or partial) refund for a paid transaction.
 *
 * Design notes:
 *   - We DO NOT mutate the local DB here. The matching `charge.refunded`
 *     webhook is the single source of truth for wallet debits and
 *     transaction.status transitions. This route only:
 *       1) validates the request
 *       2) calls stripe.refunds.create with an idempotency key
 *       3) writes an admin_audit_log row for traceability
 *   - We bound the requested amount against the cumulative
 *     refunded_amount stored on the transaction so admins can't
 *     accidentally over-refund.
 *   - Idempotency key derives from transaction_id + amount + admin so
 *     accidental double-clicks return the same Stripe refund object.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const adminUserId = auth.ctx.user.id;

    const rateLimitResponse = await applyRateLimit(
      adminMutationRateLimit,
      adminUserId,
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => null);
    const validation = refundRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Données invalides",
          details: validation.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { transaction_id, amount, reason, internal_note } = validation.data;

    const adminDb = createAdminClient();

    const { data: transaction, error: txError } = await adminDb
      .from("transactions")
      .select(
        "id, status, total_amount, refunded_amount, stripe_payment_intent_id, stripe_charge_id, buyer_id, seller_id",
      )
      .eq("id", transaction_id)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: "Transaction introuvable" },
        { status: 404 },
      );
    }

    if (!REFUNDABLE_STATUSES.has(transaction.status ?? "")) {
      return NextResponse.json(
        {
          error: `Transaction non remboursable (statut actuel: ${transaction.status})`,
        },
        { status: 400 },
      );
    }

    if (!transaction.stripe_payment_intent_id) {
      return NextResponse.json(
        {
          error:
            "Cette transaction n'a pas de payment_intent Stripe associé — impossible de la rembourser via l'API.",
        },
        { status: 400 },
      );
    }

    const totalAmount = Number(transaction.total_amount);
    const alreadyRefunded = Number(transaction.refunded_amount ?? 0);
    const remainingRefundable = round2(totalAmount - alreadyRefunded);
    const refundAmount = amount ?? remainingRefundable;

    if (refundAmount <= 0) {
      return NextResponse.json(
        { error: "Plus rien à rembourser sur cette transaction." },
        { status: 400 },
      );
    }

    if (refundAmount > remainingRefundable + 0.005) {
      return NextResponse.json(
        {
          error: `Montant trop élevé (max ${remainingRefundable.toFixed(2)} €)`,
        },
        { status: 400 },
      );
    }

    const amountInCents = Math.round(refundAmount * 100);

    const stripe = getStripe();
    const idempotencyKey = `refund-${transaction.id}-${amountInCents}-${adminUserId}`;

    const refund = await stripe.refunds.create(
      {
        payment_intent: transaction.stripe_payment_intent_id,
        amount: amountInCents,
        reason: stripeRefundReason(reason),
        metadata: {
          transaction_id: transaction.id,
          admin_id: adminUserId,
          internal_note: truncate(internal_note, 450),
        },
      },
      { idempotencyKey },
    );

    await adminDb.from("admin_audit_log").insert({
      admin_id: adminUserId,
      action: "refund.create",
      target_type: "transaction",
      target_id: transaction.id,
      metadata: {
        amount_eur: refundAmount,
        reason,
        internal_note,
        stripe_refund_id: refund.id,
        stripe_payment_intent_id: transaction.stripe_payment_intent_id,
      },
    });

    return NextResponse.json({
      success: true,
      refund_id: refund.id,
      status: refund.status,
      amount: refundAmount,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin-refund] Error:", err);

    if (isStripeError(err)) {
      return NextResponse.json(
        { error: err.message ?? "Erreur Stripe lors du remboursement" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}

function stripeRefundReason(
  reason: RefundReason,
): "duplicate" | "fraudulent" | "requested_by_customer" {
  return reason;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
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
