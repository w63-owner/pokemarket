import { memo, useEffect } from "react";
import { View } from "react-native";
import { MotiView } from "moti";
import { Check, CheckCheck, Clock } from "lucide-react-native";
import type { Message } from "@pokemarket/shared";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

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

  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: isPending ? 0.6 : 1, translateY: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      style={{
        width: "100%",
        flexDirection: "row",
        justifyContent: isOwn ? "flex-end" : "flex-start",
      }}
    >
      <View
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2",
          isOwn ? "rounded-br-md bg-primary" : "rounded-bl-md bg-muted",
        )}
      >
        <Text
          className={cn(
            "text-sm leading-snug",
            isOwn ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {message.content}
        </Text>

        <View className="mt-0.5 flex-row items-center justify-end gap-1">
          <Text
            className={cn(
              "text-[10px]",
              isOwn ? "text-primary-foreground/60" : "text-muted-foreground/70",
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
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
