import { memo, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Image } from "expo-image";
import { MotiView } from "moti";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { Check, CheckCheck, Clock, ImageOff } from "lucide-react-native";
import type { Message } from "@pokemarket/shared";
import { queryKeys } from "@pokemarket/shared";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { spring, useReducedMotionSafe } from "@/lib/motion";
import { getMessageAttachmentSignedUrl } from "@/lib/api/conversations";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isPending?: boolean;
  onVisible?: (messageId: string) => void;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renders an `image` message: fetches a 1-hour signed URL for the storage
 * path stored in `message.content`, caches it via React Query (the URL
 * remains valid long enough for the user to scroll back through hours of
 * history without re-fetching). Falls back to a tiny "missing" tile if
 * the file got expired or removed.
 */
function ImageMessageContent({
  storagePath,
  isOwn,
}: {
  storagePath: string;
  isOwn: boolean;
}) {
  const { data: signedUrl, isLoading } = useQuery({
    queryKey: queryKeys.conversations.messageAttachment(storagePath),
    queryFn: () => getMessageAttachmentSignedUrl(storagePath),
    enabled: !!storagePath,
    staleTime: 50 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <View
        className="items-center justify-center rounded-xl bg-black/5"
        style={{ width: 200, height: 240 }}
      >
        <ActivityIndicator color={isOwn ? "#fff" : "#64748b"} />
      </View>
    );
  }

  if (!signedUrl) {
    return (
      <View
        className="items-center justify-center gap-2 rounded-xl bg-black/5"
        style={{ width: 200, height: 240 }}
      >
        <ImageOff size={28} color="#94a3b8" />
        <Text variant="caption">Image indisponible</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: signedUrl }}
      style={{ width: 220, height: 280, borderRadius: 12 }}
      contentFit="cover"
      transition={150}
      accessibilityLabel="Image envoyée"
    />
  );
}

function MessageBubbleComponent({
  message,
  isOwn,
  isPending,
  onVisible,
}: MessageBubbleProps) {
  // Equivalent of useInView in RN: we treat any message we render as
  // "visible" once mounted. The thread is an inverted FlashList, so only
  // messages near the bottom are mounted.
  useEffect(() => {
    if (!isOwn && !message.read_at) onVisible?.(message.id);
  }, [isOwn, message.id, message.read_at, onVisible]);

  const reduceMotion = useReducedMotionSafe();
  const isImage = message.message_type === "image";

  return (
    // Reanimated layout transition lets bubbles re-flow smoothly when a
    // sibling height changes (e.g. an image finishes loading and grows
    // past the loading placeholder). The MotiView nested inside still
    // owns the entrance animation.
    <Animated.View
      layout={reduceMotion ? undefined : LinearTransition.springify()}
      style={{
        width: "100%",
        flexDirection: "row",
        justifyContent: isOwn ? "flex-end" : "flex-start",
      }}
    >
      <MotiView
        from={
          reduceMotion
            ? { opacity: isPending ? 0.6 : 1, translateY: 0 }
            : { opacity: 0, translateY: 6 }
        }
        animate={{ opacity: isPending ? 0.6 : 1, translateY: 0 }}
        transition={spring.stiff}
      >
        <View
          className={cn(
            "max-w-[88%] rounded-2xl",
            isImage ? "p-1.5" : "px-3.5 py-2",
            isOwn ? "rounded-br-md bg-primary" : "rounded-bl-md bg-muted",
          )}
        >
          {isImage && message.content ? (
            <ImageMessageContent storagePath={message.content} isOwn={isOwn} />
          ) : (
            <Text
              className={cn(
                "text-sm leading-snug",
                isOwn ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {message.content}
            </Text>
          )}

          <View
            className={cn(
              "flex-row items-center justify-end gap-1",
              isImage ? "mt-1 px-1.5 pb-0.5" : "mt-0.5",
            )}
          >
            <Text
              className={cn(
                "text-[10px]",
                isOwn
                  ? "text-primary-foreground/60"
                  : "text-muted-foreground/70",
              )}
            >
              {formatTime(message.created_at ?? new Date().toISOString())}
            </Text>
            {isOwn ? (
              isPending ? (
                <Clock size={12} color="rgba(255,255,255,0.7)" />
              ) : message.read_at ? (
                <CheckCheck size={12} color="rgba(255,255,255,0.9)" />
              ) : (
                <Check size={12} color="rgba(255,255,255,0.7)" />
              )
            ) : null}
          </View>
        </View>
      </MotiView>
    </Animated.View>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
