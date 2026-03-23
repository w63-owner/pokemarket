import { createClient } from "@/lib/supabase/client";
import { LIMITS } from "@/lib/constants";
import type { ConversationPreview, Message } from "@/types";

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
  nextCursor: string | null;
}

export async function fetchConversations(): Promise<ConversationPreview[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const { data: conversations, error } = await supabase
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
      ),
      messages (
        id,
        content,
        message_type,
        created_at,
        sender_id,
        read_at
      )
    `,
    )
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("created_at", { referencedTable: "messages", ascending: false });

  if (error) throw error;
  if (!conversations) return [];

  return conversations
    .map((conv) => {
      const messages = conv.messages ?? [];
      const lastMessage = messages[0] ?? null;
      const isBuyer = conv.buyer_id === user.id;
      const otherUser = isBuyer ? conv.seller : conv.buyer;

      const unreadCount = messages.filter(
        (m: { read_at: string | null; sender_id: string }) =>
          m.read_at === null && m.sender_id !== user.id,
      ).length;

      return {
        id: conv.id,
        listing_id: conv.listing_id,
        buyer_id: conv.buyer_id,
        seller_id: conv.seller_id,
        created_at: conv.created_at,
        listing: conv.listing,
        other_user: otherUser,
        last_message: lastMessage
          ? {
              content: lastMessage.content,
              message_type: lastMessage.message_type,
              created_at: lastMessage.created_at,
              sender_id: lastMessage.sender_id,
            }
          : null,
        unread_count: unreadCount,
      } as ConversationPreview;
    })
    .sort((a, b) => {
      const dateA = a.last_message?.created_at ?? a.created_at;
      const dateB = b.last_message?.created_at ?? b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
}

export async function fetchOrCreateConversation(
  listingId: string,
): Promise<string> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const { data: listing } = await supabase
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .single();

  if (!listing) throw new Error("Annonce introuvable");
  if (listing.seller_id === user.id)
    throw new Error("Vous ne pouvez pas vous envoyer un message");

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", user.id)
    .eq("seller_id", listing.seller_id)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      listing_id: listingId,
      buyer_id: user.id,
      seller_id: listing.seller_id,
    })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

export async function fetchConversationDetail(
  conversationId: string,
): Promise<ConversationDetail> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

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

  if (error) throw error;
  if (!data) throw new Error("Conversation introuvable");

  const isBuyer = data.buyer_id === user.id;
  const otherUser = isBuyer ? data.seller : data.buyer;

  return {
    id: data.id,
    listing_id: data.listing_id,
    buyer_id: data.buyer_id,
    seller_id: data.seller_id,
    listing: data.listing,
    other_user: otherUser,
    is_buyer: isBuyer,
  };
}

export async function fetchMessages(
  conversationId: string,
  cursor?: string,
): Promise<MessagesPage> {
  const supabase = createClient();

  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(LIMITS.MESSAGES_PER_PAGE);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const messages = (data ?? []) as Message[];
  const nextCursor =
    messages.length === LIMITS.MESSAGES_PER_PAGE
      ? messages[messages.length - 1].created_at
      : null;

  return { messages, nextCursor };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  type: string = "text",
): Promise<Message> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      message_type: type,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Message;
}

export async function fetchUnreadCount(): Promise<number> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .is("read_at", null)
    .neq("sender_id", user.id);

  if (error) throw error;
  return count ?? 0;
}

export async function markMessagesAsRead(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  const supabase = createClient();

  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .in("id", messageIds)
    .is("read_at", null);

  if (error) throw error;
}
