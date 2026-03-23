"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
    <motion.div
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
        <div className="relative shrink-0">
          <Avatar size="lg">
            {other_user.avatar_url ? (
              <AvatarImage
                src={other_user.avatar_url}
                alt={other_user.username}
              />
            ) : null}
            <AvatarFallback>
              {other_user.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {listing.cover_image_url && (
            <div className="border-background absolute -right-1 -bottom-1 size-5 overflow-hidden rounded-sm border-2 shadow-sm">
              <Image
                src={listing.cover_image_url}
                alt={listing.title}
                width={20}
                height={20}
                className="size-full object-cover"
              />
            </div>
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
              {other_user.username}
            </span>
            {last_message && (
              <span className="text-muted-foreground shrink-0 text-[11px]">
                {formatRelativeDate(last_message.created_at)}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p
              className={cn(
                "truncate text-[13px]",
                hasUnread
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {preview}
            </p>
            {hasUnread && (
              <span className="bg-brand-primary flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white">
                {unread_count > 99 ? "99+" : unread_count}
              </span>
            )}
          </div>

          <p className="text-muted-foreground/70 mt-0.5 truncate text-[11px]">
            {listing.title}
          </p>
        </div>
      </Link>
    </motion.div>
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
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
