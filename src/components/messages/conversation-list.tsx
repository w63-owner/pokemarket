"use client";

import Link from "next/link";
import Image from "next/image";
import { m } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatRelativeDate } from "@/lib/utils";
import type { ConversationPreview } from "@/types";

function formatMessagePreview(
  message: ConversationPreview["last_message"],
  currentUserId: string,
): string {
  if (!message) return "Aucun message";

  const isMe = message.sender_id === currentUserId;
  const prefix = isMe ? "Vous : " : "";

  switch (message.message_type) {
    case "offer":
      return isMe ? "Vous avez proposé une offre" : "Nouvelle offre proposée";
    case "offer_accepted":
      return isMe ? "Vous avez accepté l'offre" : "Offre acceptée !";
    case "offer_rejected":
      return isMe ? "Vous avez décliné l'offre" : "Offre déclinée";
    case "offer_cancelled":
      return isMe ? "Vous avez annulé l'offre" : "Offre annulée";
    case "payment_completed":
      return "Paiement effectué";
    case "order_shipped":
      return "Colis expédié";
    case "sale_completed":
      return "Vente finalisée";
    case "system":
      return message.content ?? "Message système";
    case "image":
      return `${prefix}📷 Photo`;
    default:
      return `${prefix}${message.content ?? ""}`;
  }
}

interface ConversationItemProps {
  conversation: ConversationPreview;
  currentUserId: string;
  index: number;
}

function ConversationItem({
  conversation,
  currentUserId,
  index,
}: ConversationItemProps) {
  const { other_user, listing, last_message, unread_count } = conversation;
  const hasUnread = unread_count > 0;
  const preview = formatMessagePreview(last_message, currentUserId);

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
    >
      <Link
        href={`/messages/${conversation.id}`}
        className={cn(
          "active:bg-muted/60 flex items-center gap-3 px-4 py-3 transition-colors",
          hasUnread && "bg-muted/30",
        )}
      >
        {/* Listing thumbnail as primary visual */}
        <div className="relative shrink-0">
          <div className="border-border size-12 overflow-hidden rounded-md border shadow-sm">
            {listing.cover_image_url ? (
              <Image
                src={listing.cover_image_url}
                alt={listing.title}
                width={48}
                height={48}
                className="size-full object-cover"
              />
            ) : (
              <div className="bg-muted size-full" />
            )}
          </div>
          {hasUnread && (
            <span className="bg-brand ring-background absolute -top-1 -right-1 size-2.5 rounded-full ring-2" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "truncate text-sm",
                hasUnread
                  ? "text-foreground font-semibold"
                  : "text-foreground font-medium",
              )}
            >
              {listing.title}
            </span>
            {last_message && (
              <span className="text-muted-foreground shrink-0 text-[11px]">
                {formatRelativeDate(last_message.created_at)}
              </span>
            )}
          </div>

          <p
            className={cn(
              "mt-0.5 truncate text-[13px]",
              hasUnread
                ? "text-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            Avec {other_user.username}
            {preview ? ` · ${preview}` : ""}
          </p>

          {hasUnread && (
            <div className="mt-1 flex items-center justify-end">
              <span className="bg-brand text-brand-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
                {unread_count > 99 ? "99+" : unread_count}
              </span>
            </div>
          )}
        </div>
      </Link>
    </m.div>
  );
}

interface ConversationListProps {
  conversations: ConversationPreview[];
  currentUserId: string;
}

export function ConversationList({
  conversations,
  currentUserId,
}: ConversationListProps) {
  return (
    <div className="divide-border divide-y">
      {conversations.map((conv, i) => (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          currentUserId={currentUserId}
          index={i}
        />
      ))}
    </div>
  );
}

export function ConversationListSkeleton() {
  return (
    <div className="divide-border divide-y">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-12 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}
