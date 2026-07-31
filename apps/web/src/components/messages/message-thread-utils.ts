import { isSameDay } from "@pokemarket/shared";
import type { Message } from "@/types";

const SYSTEM_TYPES = new Set([
  "system",
  "offer",
  "offer_accepted",
  "offer_rejected",
  "offer_cancelled",
  "offer_cancelled_by_buyer",
  "payment_completed",
  "order_shipped",
  "sale_completed",
]);

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface ReplySnapshot {
  [key: string]: string;
  id: string;
  content: string;
  sender_id: string;
  message_type: string;
}

export function getReplySnapshot(message: Message): ReplySnapshot | null {
  const metadata = message.metadata as Record<string, unknown> | null;
  const reply = metadata?.reply_to as Partial<ReplySnapshot> | undefined;

  if (
    !reply ||
    typeof reply.id !== "string" ||
    typeof reply.content !== "string" ||
    typeof reply.sender_id !== "string" ||
    typeof reply.message_type !== "string"
  ) {
    return null;
  }

  return reply as ReplySnapshot;
}

export function toReplySnapshot(message: Message): ReplySnapshot {
  return {
    id: message.id,
    content: message.content ?? "",
    sender_id: message.sender_id,
    message_type: message.message_type ?? "text",
  };
}

export function createMessageClientId(): string {
  return crypto.randomUUID();
}

export function messagesGroup(a?: Message, b?: Message): boolean {
  if (!a || !b || a.sender_id !== b.sender_id) return false;
  if (
    SYSTEM_TYPES.has(a.message_type ?? "") ||
    SYSTEM_TYPES.has(b.message_type ?? "")
  ) {
    return false;
  }
  if (!a.created_at || !b.created_at) return true;
  if (!isSameDay(a.created_at, b.created_at)) return false;

  return (
    Math.abs(
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ) <= GROUP_WINDOW_MS
  );
}
