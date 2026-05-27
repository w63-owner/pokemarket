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
import { haptic } from "@/lib/haptics";
import { spring } from "@/lib/motion";
import { toast } from "@/components/ui";
import { useThemeColors } from "@/lib/theme-colors";

const COMPRESSED_MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

interface MessageInputProps {
  onSend: (content: string) => void;
  onSendImage?: (payload: {
    uri: string;
    contentType: "image/jpeg";
  }) => Promise<void> | void;
  disabled?: boolean;
}

async function compressFromUri(uri: string): Promise<{ uri: string }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: COMPRESSED_MAX_DIMENSION } }],
    {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  return { uri: result.uri };
}

export function MessageInput({
  onSend,
  onSendImage,
  disabled,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
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
    haptic("tap");
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
        uri: compressed.uri,
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
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <ImagePlus size={20} color={colors.mutedForeground} />
          )}
        </Pressable>

        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Votre message..."
          placeholderTextColor={colors.mutedForeground}
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
            <Send size={16} color={colors.primaryForeground} />
          </Pressable>
        </MotiView>
      </View>
    </View>
  );
}
