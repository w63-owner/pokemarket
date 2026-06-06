import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { sendPushNotification } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Push notification for image messages.
 *
 * Unlike text messages (which are inserted by `/api/messages/send`, where the
 * push is fired inline), image messages are uploaded + inserted directly from
 * the mobile client against Supabase Storage/RLS — so there's no server hook to
 * trigger a push. This lightweight endpoint closes that gap: the client calls
 * it fire-and-forget right after a successful image insert. The recipient is
 * resolved server-side from the conversation, so the client can't target an
 * arbitrary user; the only authority granted is "notify the other participant
 * of a conversation you belong to", which a participant could already do by
 * sending a text message.
 */
export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const conversationId =
      body && typeof body.conversation_id === "string"
        ? body.conversation_id
        : undefined;
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversation_id requis" },
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
