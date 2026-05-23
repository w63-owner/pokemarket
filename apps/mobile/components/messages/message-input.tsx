import { useCallback, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { ImagePlus, Send } from "lucide-react-native";
import { MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LIMITS } from "@pokemarket/shared";
import { cn } from "@/lib/cn";
import { haptics } from "@/lib/haptics";

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState("");
  const insets = useSafeAreaInsets();

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    haptics.light();
    onSend(trimmed);
    setValue("");
  }, [canSend, onSend, trimmed]);

  return (
    <View
      className="border-t border-border bg-background"
      style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }}
    >
      <View className="flex-row items-end gap-2 px-3 py-2">
        <Pressable
          disabled={disabled}
          hitSlop={6}
          className={cn(
            "h-9 w-9 items-center justify-center rounded-full",
            disabled && "opacity-50",
          )}
        >
          <ImagePlus size={20} color="#64748b" />
        </Pressable>

        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Votre message..."
          placeholderTextColor="#94a3b8"
          multiline
          maxLength={LIMITS.MAX_MESSAGE_LENGTH}
          editable={!disabled}
          className={cn(
            "max-h-28 min-h-9 flex-1 rounded-2xl border border-border bg-muted/30 px-3.5 py-2 text-sm text-foreground",
            disabled && "opacity-50",
          )}
          style={{ paddingTop: 8, paddingBottom: 8 }}
        />

        <MotiView
          animate={{ scale: canSend ? 1 : 0.95 }}
          transition={{ type: "timing", duration: 120 }}
        >
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            hitSlop={6}
            className={cn(
              "h-9 w-9 items-center justify-center rounded-full bg-primary",
              !canSend && "opacity-50",
            )}
          >
            <Send size={16} color="#fff" />
          </Pressable>
        </MotiView>
      </View>
    </View>
  );
}
