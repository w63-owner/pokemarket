import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { MotiView } from "moti";
import {
  formatRelativeDate,
  type ConversationPreview,
} from "@pokemarket/shared";
import { Skeleton, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  duration,
  fadeInUp,
  staggerDelay,
  useReducedMotionSafe,
} from "@/lib/motion";

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

interface ConversationListItemProps {
  conversation: ConversationPreview;
  currentUserId: string;
  index: number;
  isOnline?: boolean;
}

export function ConversationListItem({
  conversation,
  currentUserId,
  index,
  isOnline = false,
}: ConversationListItemProps) {
  const { other_user, listing, last_message, unread_count } = conversation;
  const hasUnread = unread_count > 0;
  const preview = formatMessagePreview(last_message, currentUserId);
  const reduceMotion = useReducedMotionSafe();

  return (
    <MotiView
      from={reduceMotion ? fadeInUp.animate : { opacity: 0, translateY: 6 }}
      animate={fadeInUp.animate}
      transition={{
        type: "timing",
        duration: duration.fast,
        delay: staggerDelay(index, 25, 10),
      }}
    >
      <Pressable
        onPress={() => router.push(`/inbox/${conversation.id}`)}
        className={cn(
          "flex-row items-center gap-3 px-4 py-3 active:bg-muted/60",
          hasUnread && "bg-muted/30",
        )}
      >
        <View className="relative">
          <View className="size-12 overflow-hidden rounded-md border border-border bg-muted">
            {listing.cover_image_url ? (
              <Image
                source={{ uri: listing.cover_image_url }}
                style={{ width: 48, height: 48 }}
                contentFit="cover"
                transition={150}
              />
            ) : null}
          </View>
          {hasUnread ? (
            <View className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary" />
          ) : null}
        </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text
              numberOfLines={1}
              className={cn(
                "flex-1 text-sm",
                hasUnread ? "font-semibold" : "font-medium",
              )}
            >
              {listing.title}
            </Text>
            {last_message?.created_at ? (
              <Text className="shrink-0 text-[11px] text-muted-foreground">
                {formatRelativeDate(last_message.created_at)}
              </Text>
            ) : null}
          </View>

          <View className="mt-0.5 flex-row items-center gap-1.5">
            {isOnline ? (
              <View className="size-1.5 rounded-full bg-emerald-500" />
            ) : null}
            <Text
              numberOfLines={1}
              className={cn(
                "flex-1 text-[13px]",
                hasUnread
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {isOnline ? "En ligne · " : ""}
              Avec {other_user.username}
              {preview ? ` · ${preview}` : ""}
            </Text>
          </View>

          {hasUnread ? (
            <View className="mt-1 flex-row items-center justify-end">
              <View className="h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5">
                <Text className="text-[10px] font-bold text-primary-foreground">
                  {unread_count > 99 ? "99+" : unread_count}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </Pressable>
    </MotiView>
  );
}

export function ConversationListItemSkeleton() {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Skeleton className="size-12 rounded-md" />
      <View className="flex-1 gap-2">
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-10" />
        </View>
        <Skeleton className="h-3 w-48" />
      </View>
    </View>
  );
}
