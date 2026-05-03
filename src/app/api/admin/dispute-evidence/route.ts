import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { adminMutationRateLimit, applyRateLimit } from "@/lib/rate-limit";
import { disputeEvidenceSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dispute-evidence
 *
 * Submit (or save as draft) evidence for a Stripe chargeback.
 *
 * Stripe accepts incremental evidence updates without locking — we only
 * lock the submission when `submit: true`. Once submitted Stripe begins
 * its review and `evidence_details.submission_count` is incremented; the
 * `charge.dispute.updated` webhook reflects this back into our DB.
 *
 * We do NOT pre-validate that all required fields for the dispute reason
 * are present — Stripe's own response handles that and surfaces precise
 * errors. We just forward what the admin submitted.
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
    const validation = disputeEvidenceSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Données invalides",
          details: validation.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { stripe_dispute_id, evidence, submit } = validation.data;

    const adminDb = createAdminClient();

    // Sanity check the dispute exists in our DB to avoid passing arbitrary
    // IDs to Stripe — preventing accidental cross-account writes.
    const { data: dispute, error: dispError } = await adminDb
      .from("stripe_disputes")
      .select("id, stripe_dispute_id, status")
      .eq("stripe_dispute_id", stripe_dispute_id)
      .maybeSingle();

    if (dispError) {
      Sentry.captureException(dispError);
      return NextResponse.json(
        { error: "Erreur DB lors de la lecture du litige" },
        { status: 500 },
      );
    }
    if (!dispute) {
      return NextResponse.json(
        { error: "Litige Stripe inconnu" },
        { status: 404 },
      );
    }

    if (dispute.status === "won" || dispute.status === "lost") {
      return NextResponse.json(
        { error: `Litige déjà clôturé (${dispute.status})` },
        { status: 400 },
      );
    }

    const stripe = getStripe();

    const updated = await stripe.disputes.update(stripe_dispute_id, {
      evidence,
      submit,
      metadata: {
        admin_id: adminUserId,
        submitted: submit ? "true" : "false",
      },
    });

    if (submit) {
      await adminDb
        .from("stripe_disputes")
        .update({ evidence_submitted_at: new Date().toISOString() })
        .eq("stripe_dispute_id", stripe_dispute_id);
    }

    await adminDb.from("admin_audit_log").insert({
      admin_id: adminUserId,
      action: submit ? "dispute_evidence.submit" : "dispute_evidence.save",
      target_type: "stripe_dispute",
      target_id: stripe_dispute_id,
      metadata: {
        evidence_keys: Object.keys(evidence),
        stripe_status: updated.status,
      },
    });

    return NextResponse.json({
      success: true,
      stripe_dispute_id,
      status: updated.status,
      submitted: submit,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[admin-dispute-evidence] Error:", err);

    if (isStripeError(err)) {
      return NextResponse.json(
        { error: err.message ?? "Erreur Stripe" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
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
