import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { FEATURE_FLAGS } from "@pokemarket/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { sendPushNotification } from "@/lib/push/send";
import { isFeatureEnabled } from "@/lib/feature-flags/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Push notification for image messages.
 *
 * Image messages are uploaded and inserted directly by web/mobile clients
 * against Storage and database RLS, so there is no server hook to trigger a
 * push. The endpoint only notifies after verifying that the referenced image
 * message exists, belongs to the conversation and was authored by the caller.
 */
export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    if (!(await isFeatureEnabled(FEATURE_FLAGS.MESSAGING))) {
      return NextResponse.json(
        { error: "La messagerie est temporairement indisponible" },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    const conversationId =
      body && typeof body.conversation_id === "string"
        ? body.conversation_id
        : undefined;
    const messageId =
      body && typeof body.message_id === "string" ? body.message_id : undefined;
    if (!conversationId || !messageId) {
      return NextResponse.json(
        { error: "conversation_id et message_id requis" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: conversation, error: convError } = await admin
      .from("conversations")
      .select("id, buyer_id, seller_id")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversation introuvable" },
        { status: 404 },
      );
    }

    const isParticipant =
      conversation.buyer_id === user.id || conversation.seller_id === user.id;
    if (!isParticipant) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 },
      );
    }

    const { data: message, error: messageError } = await admin
      .from("messages")
      .select("id")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .eq("sender_id", user.id)
      .eq("message_type", "image")
      .maybeSingle();

    if (messageError || !message) {
      return NextResponse.json(
        { error: "Message image introuvable" },
        { status: 404 },
      );
    }

    const recipientId =
      conversation.buyer_id === user.id
        ? conversation.seller_id
        : conversation.buyer_id;

    await sendPushNotification(
      recipientId,
      "Nouveau message",
      "📷 Photo",
      `/messages/${conversationId}`,
      { category: "messages" },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[messages/notify-image] Failed:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
