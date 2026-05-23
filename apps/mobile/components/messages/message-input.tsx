import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { ImagePlus, Send } from "lucide-react-native";
import { MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import { LIMITS } from "@pokemarket/shared";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { toast } from "@/components/ui";

const COMPRESSED_MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

interface MessageInputProps {
  onSend: (content: string) => void;
  onSendImage?: (payload: {
    base64: string;
    contentType: "image/jpeg";
  }) => Promise<void> | void;
  disabled?: boolean;
}

async function compressFromUri(uri: string): Promise<{
  base64: string;
}> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: COMPRESSED_MAX_DIMENSION } }],
    {
      base64: true,
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  if (!result.base64) throw new Error("Compression failed");
  return { base64: result.base64 };
}

export function MessageInput({
  onSend,
  onSendImage,
  disabled,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const insets = useSafeAreaInsets();
  // When the keyboard is open the system nav bar / home indicator sits
  // behind it, so we collapse the safe-area padding to keep the input
  // flush with the keyboard (otherwise the parent `KeyboardAvoidingView`
  // adds the full keyboard height *and* we reserve `insets.bottom` here,
  // producing a visible empty strip below the input).
  const { isVisible: isKeyboardVisible } = useKeyboardState();
  const bottomPadding = isKeyboardVisible
    ? 6
    : insets.bottom > 0
      ? insets.bottom
      : 8;

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !disabled && !isUploading;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(trimmed);
    setValue("");
  }, [canSend, onSend, trimmed]);

  // Tap on the ImagePlus button: gallery permission → pick → compress to
  // a 1600px-wide JPEG → hand the base64 payload off to the parent who
  // owns the storage upload + DB insert.
  const handlePickImage = useCallback(async () => {
    if (disabled || isUploading || !onSendImage) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error("Accès à la galerie refusé");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];

    setIsUploading(true);
    try {
      const compressed = await compressFromUri(asset.uri);
      await onSendImage({
        base64: compressed.base64,
        contentType: "image/jpeg",
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Impossible d'envoyer l'image",
      );
    } finally {
      setIsUploading(false);
    }
  }, [disabled, isUploading, onSendImage]);

  return (
    <View
      className="border-t border-border bg-background"
      style={{ paddingBottom: bottomPadding }}
    >
      <View className="flex-row items-end gap-2 px-3 py-2">
        <Pressable
          onPress={handlePickImage}
          disabled={disabled || isUploading || !onSendImage}
          hitSlop={6}
          accessibilityLabel="Envoyer une image"
          className={cn(
            "h-9 w-9 items-center justify-center rounded-full",
            (disabled || isUploading || !onSendImage) && "opacity-50",
          )}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#64748b" />
          ) : (
            <ImagePlus size={20} color="#64748b" />
          )}
        </Pressable>

        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Votre message..."
          placeholderTextColor="#94a3b8"
          multiline
          maxLength={LIMITS.MAX_MESSAGE_LENGTH}
          editable={!disabled && !isUploading}
          className={cn(
            "max-h-28 min-h-9 flex-1 rounded-2xl border border-border bg-muted/30 px-3.5 py-2 text-sm text-foreground",
            (disabled || isUploading) && "opacity-50",
          )}
          style={{ paddingTop: 8, paddingBottom: 8 }}
        />

        <MotiView
          animate={{ scale: canSend ? 1 : 0.95 }}
          transition={spring.snappy}
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
