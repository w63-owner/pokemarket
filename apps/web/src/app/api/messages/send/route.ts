import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  FEATURE_FLAGS,
  sendMessageRequestSchema,
  type Json,
  type SendMessageResponse,
} from "@deckdealr/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";
import { sendPushNotification } from "@/lib/push/send";
import { isFeatureEnabled } from "@/lib/feature-flags/server";
import { applyRateLimit, messageSendRateLimit } from "@/lib/rate-limit";
import type { Message } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = performance.now();
  let messageType: "text" | "image" | "unknown" = "unknown";

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
    const parsed = sendMessageRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Message invalide" },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const conversationId = payload.conversation_id;
    messageType = payload.type;

    const rateLimitResponse = await applyRateLimit(
      messageSendRateLimit,
      `${user.id}:${conversationId}`,
    );
    if (rateLimitResponse) return rateLimitResponse;

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

    const { data: block, error: blockError } = await admin
      .from("user_blocks")
      .select("blocker_id")
      .or(
        `and(blocker_id.eq.${conversation.buyer_id},blocked_id.eq.${conversation.seller_id}),and(blocker_id.eq.${conversation.seller_id},blocked_id.eq.${conversation.buyer_id})`,
      )
      .limit(1)
      .maybeSingle();
    if (blockError) throw blockError;
    if (block) {
      return NextResponse.json(
        { error: "Cette conversation est bloquée" },
        { status: 403 },
      );
    }

    if (
      payload.type === "image" &&
      !payload.storage_path.startsWith(`${conversationId}/`)
    ) {
      return NextResponse.json(
        { error: "La pièce jointe ne correspond pas à la conversation" },
        { status: 400 },
      );
    }

    let replyTo: Json | undefined;
    if (payload.reply_to) {
      const { data: quotedMessage } = await admin
        .from("messages")
        .select("id, content, sender_id, message_type")
        .eq("id", payload.reply_to.id)
        .eq("conversation_id", conversationId)
        .maybeSingle();

      if (!quotedMessage) {
        return NextResponse.json(
          { error: "Le message cité n'appartient pas à cette conversation" },
          { status: 400 },
        );
      }
      replyTo = {
        id: quotedMessage.id,
        content: (quotedMessage.content ?? "").slice(0, 200),
        sender_id: quotedMessage.sender_id,
        message_type: quotedMessage.message_type,
      };
    }

    const metadata: Record<string, Json> = {
      client_id: payload.client_id,
      ...(replyTo ? { reply_to: replyTo } : {}),
    };
    const content =
      payload.type === "text" ? payload.content : payload.storage_path;

    const { data: insertedMessage, error: msgError } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: payload.type,
        metadata,
      })
      .select()
      .single();

    let message = insertedMessage;
    if (msgError?.code === "23505") {
      const { data: existingMessage, error: existingError } = await admin
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("sender_id", user.id)
        .contains("metadata", { client_id: payload.client_id })
        .maybeSingle();
      if (existingError || !existingMessage) throw msgError;
      message = existingMessage;
    } else if (msgError || !message) {
      throw msgError ?? new Error("Message insert returned no row");
    }

    const recipientId =
      conversation.buyer_id === user.id
        ? conversation.seller_id
        : conversation.buyer_id;

    if (!msgError) {
      sendPushNotification(
        recipientId,
        "Nouveau message",
        payload.type === "image" ? "📷 Photo" : payload.content,
        `/messages/${conversationId}`,
        { category: "messages", conversationId },
      ).catch((err) => Sentry.captureException(err));
    }

    return NextResponse.json<SendMessageResponse>({
      message: message as Message,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        component: "messaging",
        operation: "send",
        message_type: messageType,
      },
    });
    console.error("[messages/send] Failed:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  } finally {
    const duration = Math.round(performance.now() - startedAt);
    Sentry.setMeasurement("messaging.send_latency", duration, "millisecond");
    Sentry.setContext("messaging_send", {
      message_type: messageType,
      duration_ms: duration,
    });
  }
}
