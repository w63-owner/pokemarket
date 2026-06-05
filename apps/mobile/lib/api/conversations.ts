import {
  LIMITS,
  type ConversationPreview,
  type Message,
} from "@pokemarket/shared";
import { api } from "@/lib/api/client";
import { getCurrentUserId, requireUserId } from "@/lib/auth/current-user";
import {
  uploadImageFromUri,
  contentTypeToExt,
} from "@/lib/storage/upload-image";
import { supabase } from "@/lib/supabase";

const MESSAGE_ATTACHMENTS_BUCKET = "message_attachments";

export interface ConversationDetail {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  listing: {
    id: string;
    title: string;
    cover_image_url: string | null;
    display_price: number;
    status: string;
  };
  other_user: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  is_buyer: boolean;
}

export interface MessagesPage {
  messages: Message[];
  nextCursor: { created_at: string; id: string } | null;
}

export async function fetchConversations(): Promise<ConversationPreview[]> {
  const userId = await requireUserId();

  const { data, error } = await supabase.rpc("get_inbox", {
    p_user_id: userId,
  });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((row) => ({
    id: row.id,
    listing_id: row.listing_id,
    buyer_id: row.buyer_id,
    seller_id: row.seller_id,
    created_at: row.created_at,
    listing: {
      id: row.listing_id,
      title: row.listing_title,
      cover_image_url: row.listing_cover_image_url,
      display_price: Number(row.listing_display_price ?? 0),
      status: row.listing_status ?? "ACTIVE",
    },
    other_user: {
      id: row.other_user_id,
      username: row.other_user_username,
      avatar_url: row.other_user_avatar_url,
    },
    last_message: row.last_message_created_at
      ? {
          content: row.last_message_content,
          message_type: row.last_message_type ?? "text",
          created_at: row.last_message_created_at,
          sender_id: row.last_message_sender_id!,
        }
      : null,
    unread_count: Number(row.unread_count ?? 0),
  })) as ConversationPreview[];
}

export async function fetchOrCreateConversation(
  listingId: string,
): Promise<string> {
  const userId = await requireUserId();

  const { data, error } = await supabase.rpc("upsert_conversation", {
    p_listing_id: listingId,
    p_buyer_id: userId,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Impossible de créer la conversation");

  return data;
}

export async function fetchConversationDetail(
  conversationId: string,
): Promise<ConversationDetail> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("conversations")
    .select(
      `
      *,
      listing:listings!listing_id (
        id,
        title,
        cover_image_url,
        display_price,
        status
      ),
      buyer:profiles!buyer_id (
        id,
        username,
        avatar_url
      ),
      seller:profiles!seller_id (
        id,
        username,
        avatar_url
      )
    `,
    )
    .eq("id", conversationId)
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conversation introuvable");

  const isBuyer = data.buyer_id === userId;
  const otherUser = isBuyer ? data.seller : data.buyer;

  return {
    id: data.id,
    listing_id: data.listing_id,
    buyer_id: data.buyer_id,
    seller_id: data.seller_id,
    listing: {
      id: data.listing.id,
      title: data.listing.title,
      cover_image_url: data.listing.cover_image_url,
      display_price: data.listing.display_price ?? 0,
      status: data.listing.status ?? "ACTIVE",
    },
    other_user: otherUser,
    is_buyer: isBuyer,
  };
}

export async function fetchMessages(
  conversationId: string,
  cursor?: { created_at: string; id: string },
): Promise<MessagesPage> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIMITS.MESSAGES_PER_PAGE);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const messages = (data ?? []) as Message[];
  const nextCursor =
    messages.length === LIMITS.MESSAGES_PER_PAGE
      ? {
          created_at: messages[messages.length - 1].created_at!,
          id: messages[messages.length - 1].id,
        }
      : null;

  return { messages, nextCursor };
}

export async function fetchUnreadCount(): Promise<number> {
  const userId = getCurrentUserId();
  if (!userId) return 0;

  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .is("read_at", null)
    .neq("sender_id", userId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markMessagesAsRead(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .in("id", messageIds)
    .is("read_at", null);

  if (error) throw new Error(error.message);
}

export interface ReplyToPayload {
  id: string;
  content: string;
  sender_id: string;
  message_type: string;
}

export async function sendMessage(
  conversationId: string,
  content: string,
  clientId?: string,
  replyTo?: ReplyToPayload | null,
): Promise<Message> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Message vide");
  if (trimmed.length > LIMITS.MAX_MESSAGE_LENGTH) {
    throw new Error("Message trop long");
  }

  const result = await api.post<{ message: Message }>("/api/messages/send", {
    conversation_id: conversationId,
    content: trimmed,
    ...(clientId ? { client_id: clientId } : {}),
    ...(replyTo
      ? {
          reply_to: {
            id: replyTo.id,
            content: replyTo.content,
            sender_id: replyTo.sender_id,
            message_type: replyTo.message_type,
          },
        }
      : {}),
  });
  return result.message;
}

// ────────────────────────────────────────────────────────────────────────────
// Image messages
// ────────────────────────────────────────────────────────────────────────────

/**
 * Upload an image from a local `file://` URI into the private
 * `message_attachments` bucket, then insert a `message_type: "image"` row.
 * Uses native multipart upload to avoid base64 memory overhead.
 */
export async function sendImageMessage(
  conversationId: string,
  payload: {
    uri: string;
    contentType: "image/jpeg" | "image/webp" | "image/png";
  },
): Promise<Message> {
  const userId = await requireUserId();

  const ext = contentTypeToExt(payload.contentType);
  const fileName = `${conversationId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  await uploadImageFromUri({
    uri: payload.uri,
    contentType: payload.contentType,
    bucket: MESSAGE_ATTACHMENTS_BUCKET,
    storagePath: fileName,
  });

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      content: fileName,
      message_type: "image",
    })
    .select()
    .single();

  if (error) {
    await supabase.storage
      .from(MESSAGE_ATTACHMENTS_BUCKET)
      .remove([fileName])
      .catch(() => {});
    throw new Error(error.message);
  }

  return data as Message;
}

/**
 * Mint a 1-hour signed URL for an attachment. Used by `MessageBubble` (via
 * a React Query) to render image messages stored in the private bucket.
 * Falls back to `null` rather than throwing so a missing/expired file
 * just renders a placeholder instead of crashing the thread.
 */
export async function getMessageAttachmentSignedUrl(
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) return null;
  return data?.signedUrl ?? null;
}
