import { View } from "react-native";
import { ImageIcon } from "lucide-react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ReplySnapshot } from "@/hooks/use-conversation-thread";

interface QuotedMessageProps {
  reply: ReplySnapshot;
  currentUserId: string;
  otherUsername: string;
  /**
   * When rendered inside the current user's (primary-coloured) bubble we
   * flip to light-on-dark styling; elsewhere we use muted-on-surface.
   */
  onPrimary?: boolean;
}

function previewText(reply: ReplySnapshot): string {
  if (reply.message_type === "image") return "Photo";
  return reply.content || "Message";
}

/**
 * The quoted-message block shown above a reply (both inside the rendered
 * bubble and in the compose bar). Reads from the denormalised snapshot so
 * it never needs the original message to still be loaded.
 */
export function QuotedMessage({
  reply,
  currentUserId,
  otherUsername,
  onPrimary,
}: QuotedMessageProps) {
  const senderLabel =
    reply.sender_id === currentUserId ? "Vous" : otherUsername;
  const isImage = reply.message_type === "image";

  return (
    <View
      className={cn(
        "mb-1 flex-row gap-2 overflow-hidden rounded-lg border-l-2 py-1 pl-2 pr-2.5",
        onPrimary
          ? "border-l-primary-foreground/70 bg-black/15"
          : "border-l-primary bg-black/5",
      )}
    >
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className={cn(
            "text-xs font-semibold",
            onPrimary ? "text-primary-foreground" : "text-primary",
          )}
        >
          {senderLabel}
        </Text>
        <View className="flex-row items-center gap-1">
          {isImage ? (
            <ImageIcon
              size={12}
              color={onPrimary ? "rgba(255,255,255,0.8)" : "#9ca3af"}
            />
          ) : null}
          <Text
            numberOfLines={1}
            className={cn(
              "flex-1 text-xs",
              onPrimary
                ? "text-primary-foreground/80"
                : "text-muted-foreground",
            )}
          >
            {previewText(reply)}
          </Text>
        </View>
      </View>
    </View>
  );
}
