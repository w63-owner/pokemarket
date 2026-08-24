import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, BellOff, Flag, ShieldBan } from "lucide-react-native";
import { queryKeys } from "@deckdealr/shared";
import {
  blockUser,
  reportConversation,
  setConversationSettings,
} from "@/lib/api/conversations";
import { Sheet, Text, toast } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

export function ConversationOptionsSheet({
  open,
  onClose,
  conversationId,
  otherUserId,
  isArchived,
  isMuted,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  otherUserId: string;
  isArchived: boolean;
  isMuted: boolean;
}) {
  const foreground = useThemeColor("foreground");
  const destructive = useThemeColor("destructive");
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.list(),
    });

  const run = async (
    action: () => Promise<void>,
    success: string,
    afterSuccess?: () => void,
  ) => {
    try {
      await action();
      await invalidate();
      toast.success(success);
      onClose();
      afterSuccess?.();
    } catch {
      toast.error("Action impossible pour le moment");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <View className="gap-1 pb-2">
        <Option
          icon={<BellOff size={20} color={foreground} />}
          label={isMuted ? "Réactiver les notifications" : "Mettre en sourdine"}
          onPress={() =>
            void run(
              () =>
                setConversationSettings(conversationId, {
                  mutedUntil: isMuted
                    ? null
                    : new Date(
                        Date.now() + 10 * 365 * 24 * 60 * 60 * 1_000,
                      ).toISOString(),
                }),
              "Préférences mises à jour",
            )
          }
        />
        <Option
          icon={<Archive size={20} color={foreground} />}
          label={isArchived ? "Désarchiver" : "Archiver"}
          onPress={() =>
            void run(
              () =>
                setConversationSettings(conversationId, {
                  archived: !isArchived,
                }),
              "Conversation mise à jour",
              () => router.replace("/(tabs)/inbox"),
            )
          }
        />
        <Option
          icon={<Flag size={20} color={foreground} />}
          label="Signaler la conversation"
          onPress={() =>
            void run(
              () => reportConversation(conversationId, "inappropriate"),
              "Signalement transmis à la modération",
            )
          }
        />
        <Option
          icon={<ShieldBan size={20} color={destructive} />}
          label="Bloquer cet utilisateur"
          destructive
          onPress={() =>
            void run(
              () => blockUser(otherUserId),
              "Utilisateur bloqué",
              () => router.replace("/(tabs)/inbox"),
            )
          }
        />
      </View>
    </Sheet>
  );
}

function Option({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl px-2 py-3 active:bg-muted/60"
    >
      {icon}
      <Text
        className={destructive ? "text-base text-destructive" : "text-base"}
      >
        {label}
      </Text>
    </Pressable>
  );
}
