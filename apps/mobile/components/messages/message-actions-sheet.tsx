import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy, Reply } from "lucide-react-native";
import type { Message } from "@pokemarket/shared";
import { Sheet, Text, toast } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useThemeColor } from "@/lib/theme-colors";

interface MessageActionsSheetProps {
  /** The message the user long-pressed, or null when the sheet is closed. */
  message: Message | null;
  onClose: () => void;
  onReply: (message: Message) => void;
}

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

function ActionRow({ icon, label, onPress }: ActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl px-2 py-3 active:bg-muted/60"
    >
      {icon}
      <Text className="text-base text-foreground">{label}</Text>
    </Pressable>
  );
}

export function MessageActionsSheet({
  message,
  onClose,
  onReply,
}: MessageActionsSheetProps) {
  const fg = useThemeColor("foreground");
  const isText = !!message && message.message_type === "text";

  const handleCopy = async () => {
    if (!message?.content) return;
    await Clipboard.setStringAsync(message.content);
    haptic("tap");
    toast.success("Copié");
    onClose();
  };

  const handleReply = () => {
    if (!message) return;
    haptic("tap");
    onReply(message);
    onClose();
  };

  return (
    <Sheet open={!!message} onOpenChange={(o) => !o && onClose()}>
      <View className="gap-1 pb-2">
        <ActionRow
          icon={<Reply size={20} color={fg} />}
          label="Répondre"
          onPress={handleReply}
        />
        {isText ? (
          <ActionRow
            icon={<Copy size={20} color={fg} />}
            label="Copier le texte"
            onPress={handleCopy}
          />
        ) : null}
      </View>
    </Sheet>
  );
}
