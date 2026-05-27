import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Camera, Loader2 } from "lucide-react-native";
import { MotiView } from "moti";

import { requireUserId } from "@/lib/auth/current-user";
import { base64ToArrayBuffer } from "@/lib/storage/base64";
import { supabase } from "@/lib/supabase";
import { Text, toast } from "@/components/ui";
import { duration } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

const AVATAR_BUCKET = "avatars";
const TARGET_DIM = 512;
const COMPRESS_QUALITY = 0.85;

type Props = {
  currentUrl: string | null | undefined;
  fallback: string;
  size?: number;
  onUploaded: (publicUrl: string) => void;
};

/**
 * Tap-to-change avatar. Uses Expo image picker (square aspect, library
 * source) + image-manipulator to downscale to 512×512 JPEG before
 * uploading to the public `avatars/{userId}/avatar.jpg` storage path.
 *
 * Mobile uses JPEG instead of WEBP because `expo-image-manipulator`
 * does not output WEBP and JPEG is the common denominator on iOS/Android.
 */
export function AvatarUploader({
  currentUrl,
  fallback,
  size = 96,
  onUploaded,
}: Props) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const muted = useThemeColor("mutedForeground");

  const displayUri = previewUri || currentUrl || null;

  const handlePick = useCallback(async () => {
    if (uploading) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error(
        "Accès refusé",
        "Autorisez l'accès aux photos dans les réglages.",
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    setUploading(true);
    setPreviewUri(asset.uri);

    try {
      // Downscale + re-encode JPEG, returning base64 so we can ship the
      // bytes through Supabase Storage without a `Blob` (RN's Blob is
      // unreliable on `file://` URIs).
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: TARGET_DIM, height: TARGET_DIM } }],
        {
          compress: COMPRESS_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );

      if (!manipulated.base64) {
        throw new Error("Échec de la conversion JPEG");
      }

      const userId = await requireUserId();

      const fileName = `${userId}/avatar.jpg`;
      const buffer = base64ToArrayBuffer(manipulated.base64);

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(fileName, buffer, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(fileName);

      // Cache-bust so RN Image and Expo Image refetch the new bytes.
      const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;
      onUploaded(cacheBustedUrl);
      setPreviewUri(cacheBustedUrl);
      toast.success("Photo de profil mise à jour");
    } catch (err) {
      setPreviewUri(null);
      const message = err instanceof Error ? err.message : "Échec de l'upload";
      toast.error("Échec de l'upload", message);
    } finally {
      setUploading(false);
    }
  }, [uploading, onUploaded]);

  return (
    <Pressable
      onPress={handlePick}
      disabled={uploading}
      className="self-center"
      hitSlop={8}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
        }}
        className="items-center justify-center bg-muted"
      >
        {displayUri ? (
          <Image
            source={{ uri: displayUri }}
            style={{ width: size, height: size }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Text className="text-3xl font-semibold text-foreground">
            {fallback.slice(0, 2).toUpperCase()}
          </Text>
        )}

        {uploading ? (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: "timing", duration: duration.fast }}
            className="absolute inset-0 items-center justify-center bg-black/50"
          >
            <Loader2 size={28} color="#fff" />
          </MotiView>
        ) : (
          <View
            pointerEvents="none"
            className="absolute bottom-0 right-0 h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-primary"
          >
            <Camera size={16} color="#fff" />
          </View>
        )}
      </View>
      {!displayUri && !uploading ? (
        <Text
          variant="caption"
          className="mt-2 text-center"
          style={{ color: muted }}
        >
          Touchez pour ajouter une photo
        </Text>
      ) : null}
    </Pressable>
  );
}
