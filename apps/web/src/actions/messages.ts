"use server";

import { createClient } from "@/lib/supabase/server";
import { messageSchema } from "@/lib/validations";
import { sendPushNotification } from "@/lib/push/send";
import * as Sentry from "@sentry/nextjs";
import type { Message } from "@/types";

export type SendMessageResult =
  | { success: true; message: Message }
  | { success: false; error: string };

export async function sendMessageAction(
  conversationId: string,
  content: string,
): Promise<SendMessageResult> {
  const parsed = messageSchema.safeParse({ content });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Contenu invalide",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Non authentifié" };
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) {
    return { success: false, error: "Conversation introuvable" };
  }

  const isParticipant =
    conversation.buyer_id === user.id || conversation.seller_id === user.id;
  if (!isParticipant) {
    return { success: false, error: "Accès non autorisé" };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: parsed.data.content,
      message_type: "text",
    })
    .select()
    .single();

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Échec de l'envoi du message" };
  }

  const recipientId =
    conversation.buyer_id === user.id
      ? conversation.seller_id
      : conversation.buyer_id;

  try {
    await sendPushNotification(
      recipientId,
      "Nouveau message",
      parsed.data.content,
      `/messages/${conversationId}`,
    );
  } catch (err) {
    Sentry.captureException(err);
  }

  return { success: true, message: data as Message };
}
