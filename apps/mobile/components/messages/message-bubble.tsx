import { memo, useEffect } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { MotiView } from "moti";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  ImageOff,
} from "lucide-react-native";
import type { Message } from "@pokemarket/shared";
import { formatTime, queryKeys } from "@pokemarket/shared";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { spring, useReducedMotionSafe } from "@/lib/motion";
import { getMessageAttachmentSignedUrl } from "@/lib/api/conversations";
import { getReplySnapshot } from "@/hooks/use-conversation-thread";
import { useThemeColors } from "@/lib/theme-colors";
import { QuotedMessage } from "./quoted-message";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isPending?: boolean;
  isFailed?: boolean;
  /** Bottom-most bubble of a same-sender group → keeps the tail + timestamp. */
  isLastInGroup?: boolean;
  currentUserId: string;
  otherUsername: string;
  onVisible?: (messageId: string) => void;
  onRetry?: (message: Message) => void;
  onLongPress?: (message: Message) => void;
  onImagePress?: (storagePath: string) => void;
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
  const colors = useThemeColors();

  if (isLoading) {
    return (
      <View
        className="items-center justify-center rounded-xl bg-black/5"
        style={{ width: 200, height: 240 }}
      >
        <ActivityIndicator
          color={isOwn ? colors.primaryForeground : colors.mutedForeground}
        />
      </View>
    );
  }

  if (!signedUrl) {
    return (
      <View
        className="items-center justify-center gap-2 rounded-xl bg-black/5"
        style={{ width: 200, height: 240 }}
      >
        <ImageOff size={28} color={colors.mutedForeground} />
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
  isFailed,
  isLastInGroup = true,
  currentUserId,
  otherUsername,
  onVisible,
  onRetry,
  onLongPress,
  onImagePress,
}: MessageBubbleProps) {
  // Equivalent of useInView in RN: we treat any message we render as
  // "visible" once mounted. The thread is an inverted FlashList, so only
  // messages near the bottom are mounted.
  useEffect(() => {
    if (!isOwn && !message.read_at) onVisible?.(message.id);
  }, [isOwn, message.id, message.read_at, onVisible]);

  const reduceMotion = useReducedMotionSafe();
  const isImage = message.message_type === "image";
  const reply = getReplySnapshot(message);

  // The tail (reduced corner) only appears on the last bubble of a group;
  // mid-group bubbles stay fully rounded so a burst reads as one unit.
  const tail = isOwn
    ? isLastInGroup
      ? "rounded-br-md"
      : ""
    : isLastInGroup
      ? "rounded-bl-md"
      : "";

  const handlePress = () => {
    if (isFailed) {
      onRetry?.(message);
    } else if (isImage && message.content) {
      onImagePress?.(message.content);
    }
  };

  const isInteractive = isFailed || (isImage && !!message.content);

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
        // The max-width constraint lives here (not on the inner bubble):
        // this MotiView is the direct flex child of the row above, whose
        // width is an explicit 100%, so the percentage resolves correctly.
        // Putting it on the inner View (whose parent — this MotiView — is
        // auto-width) leaves Yoga with an indeterminate constraint and
        // collapses the bubble, wrapping text mid-word ("Bonjo / ur").
        style={{ maxWidth: "80%" }}
        from={
          reduceMotion
            ? { opacity: isPending ? 0.6 : 1, translateY: 0 }
            : { opacity: 0, translateY: 6 }
        }
        animate={{ opacity: isPending ? 0.6 : 1, translateY: 0 }}
        transition={spring.stiff}
      >
        <Pressable
          onPress={isInteractive ? handlePress : undefined}
          onLongPress={onLongPress ? () => onLongPress(message) : undefined}
          delayLongPress={250}
          className={cn(
            "rounded-2xl",
            isImage ? "p-1.5" : "px-3.5 py-2",
            isOwn ? "bg-primary" : "bg-muted",
            tail,
          )}
        >
          {reply ? (
            <QuotedMessage
              reply={reply}
              currentUserId={currentUserId}
              otherUsername={otherUsername}
              onPrimary={isOwn}
            />
          ) : null}

          {isImage && message.content ? (
            <ImageMessageContent storagePath={message.content} isOwn={isOwn} />
          ) : (
            <Text
              selectable
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
              isFailed ? (
                <AlertCircle size={12} color="rgba(255,255,255,0.95)" />
              ) : isPending ? (
                <Clock size={12} color="rgba(255,255,255,0.7)" />
              ) : message.read_at ? (
                <CheckCheck size={12} color="rgba(255,255,255,0.95)" />
              ) : (
                <Check size={12} color="rgba(255,255,255,0.7)" />
              )
            ) : null}
          </View>

          {isFailed ? (
            <Text className="mt-0.5 text-right text-[10px] text-primary-foreground/90">
              Échec · appuyez pour réessayer
            </Text>
          ) : null}
        </Pressable>
      </MotiView>
    </Animated.View>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
