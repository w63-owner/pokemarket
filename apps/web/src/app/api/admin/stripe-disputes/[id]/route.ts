import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { logAdminAction } from "@/lib/admin/audit-log";
import { requireAdmin } from "@/lib/admin/auth";
import { adminActionRateLimit, applyRateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const evidenceSchema = z.object({
  action: z.literal("submit_evidence"),
  product_description: z.string().min(10).max(20_000),
  uncategorized_text: z.string().min(10).max(20_000),
  shipping_tracking_number: z.string().max(200).optional(),
  customer_email_address: z.string().email().optional(),
  shipping_documentation: z
    .string()
    .regex(/^file_/)
    .optional(),
  customer_communication: z
    .string()
    .regex(/^file_/)
    .optional(),
  submit: z.boolean().default(false),
});

const acceptSchema = z.object({ action: z.literal("accept") });
const actionSchema = z.discriminatedUnion("action", [
  evidenceSchema,
  acceptSchema,
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (guard instanceof NextResponse) return guard;

    const rateLimit = await applyRateLimit(adminActionRateLimit, guard.user.id);
    if (rateLimit) return rateLimit;

    const validation = actionSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: "Données invalides", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const admin = createAdminClient();
    const { data: dispute, error } = await admin
      .from("stripe_disputes")
      .select("id, stripe_dispute_id, status, evidence_due_by")
      .eq("id", id)
      .single();

    if (error || !dispute) {
      return NextResponse.json(
        { error: "Litige introuvable" },
        { status: 404 },
      );
    }
    if (
      !["warning_needs_response", "needs_response"].includes(dispute.status)
    ) {
      return NextResponse.json(
        { error: "Ce litige n'accepte plus d'action." },
        { status: 409 },
      );
    }

    const stripe = getStripe("operations");
    let stripeStatus: string;
    let actionType: string;
    let payload: Json;

    if (validation.data.action === "accept") {
      const updated = await stripe.disputes.close(dispute.stripe_dispute_id);
      stripeStatus = updated.status;
      actionType = "stripe_dispute_accept";
      payload = { previous_status: dispute.status };
    } else {
      const { submit, action: _action, ...evidence } = validation.data;
      const updated = await stripe.disputes.update(dispute.stripe_dispute_id, {
        evidence,
        submit,
        metadata: { pokemarket_dispute_id: dispute.id },
      });
      stripeStatus = updated.status;
      actionType = submit
        ? "stripe_dispute_evidence_submit"
        : "stripe_dispute_evidence_stage";
      payload = {
        evidence_fields: Object.keys(evidence),
        submit,
        previous_status: dispute.status,
      };
    }

    await logAdminAction({
      adminId: guard.user.id,
      actionType,
      resourceType: "stripe_dispute",
      resourceId: dispute.id,
      payload,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ success: true, status: stripeStatus });
  } catch (cause) {
    Sentry.captureException(cause);
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Erreur Stripe lors du traitement du litige",
      },
      { status: 500 },
    );
  }
}
