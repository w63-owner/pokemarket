import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { messageSchema } from "@/lib/validations";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { sendPushNotification } from "@/lib/push/send";
import type { Message } from "@/types";
import type { Json } from "@pokemarket/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { user } = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = messageSchema.safeParse({ content: body.content });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Contenu invalide" },
        { status: 400 },
      );
    }

    const conversationId = body.conversation_id as string | undefined;
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversation_id requis" },
        { status: 400 },
      );
    }

    // Optional quoted-message snapshot. We persist a denormalised copy in
    // `metadata.reply_to` so clients can render the quote without a join.
    const replyTo = (() => {
      const raw = body.reply_to as Record<string, unknown> | undefined;
      if (!raw || typeof raw.id !== "string") return null;
      return {
        id: raw.id,
        content: typeof raw.content === "string" ? raw.content : "",
        sender_id: typeof raw.sender_id === "string" ? raw.sender_id : "",
        message_type:
          typeof raw.message_type === "string" ? raw.message_type : "text",
      };
    })();

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

    const metadata: Record<string, Json> = {};
    if (body.client_id && typeof body.client_id === "string") {
      metadata.client_id = body.client_id;
    }
    if (replyTo) {
      metadata.reply_to = replyTo;
    }

    const { data: message, error: msgError } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: parsed.data.content,
        message_type: "text",
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      })
      .select()
      .single();

    if (msgError) throw msgError;

    const recipientId =
      conversation.buyer_id === user.id
        ? conversation.seller_id
        : conversation.buyer_id;

    sendPushNotification(
      recipientId,
      "Nouveau message",
      parsed.data.content,
      `/messages/${conversationId}`,
      { category: "messages" },
    ).catch((err) => Sentry.captureException(err));

    return NextResponse.json({ message: message as Message });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[messages/send] Failed:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
