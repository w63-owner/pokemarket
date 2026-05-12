import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { MotiView, AnimatePresence } from "moti";
import { Camera, FolderOpen, Trash2 } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  removeListingImage,
  uploadListingImage,
  type UploadedListingImage,
} from "@/lib/api/listings";
import { CameraCapture, type CapturedImage } from "./camera-capture";

const COMPRESSED_MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

type SlotKind = "cover" | "back";

type SlotState = {
  publicUrl: string | null;
  storagePath: string | null;
  uploading: boolean;
};

const EMPTY_SLOT: SlotState = {
  publicUrl: null,
  storagePath: null,
  uploading: false,
};

type Props = {
  onImagesChange?: (images: {
    cover: UploadedListingImage | null;
    back: UploadedListingImage | null;
  }) => void;
  initialCover?: UploadedListingImage | null;
  initialBack?: UploadedListingImage | null;
};

async function compressFromUri(uri: string): Promise<{
  base64: string;
  width: number;
  height: number;
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
  return {
    base64: result.base64,
    width: result.width,
    height: result.height,
  };
}

function ImageSlot({
  label,
  state,
  disabled,
  onOpenCamera,
  onPickFromGallery,
  onRemove,
}: {
  label: string;
  state: SlotState;
  disabled: boolean;
  onOpenCamera: () => void;
  onPickFromGallery: () => void;
  onRemove: () => void;
}) {
  const [layout, setLayout] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setLayout({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  }, []);

  const hasImage = !!state.publicUrl;
  const isInteractive = !disabled && !state.uploading;

  return (
    <View className="flex-1 gap-2">
      <Text className="text-sm font-medium">{label}</Text>

      <View
        onLayout={handleLayout}
        style={{ aspectRatio: 3 / 4 }}
        className={cn(
          "w-full overflow-hidden rounded-2xl border-2 border-dashed",
          hasImage
            ? "border-transparent"
            : "border-muted-foreground/25 bg-muted/30",
          disabled && "opacity-50",
        )}
      >
        <AnimatePresence>
          {state.uploading ? (
            <MotiView
              key="uploading"
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ flex: 1 }}
              className="items-center justify-center gap-2"
            >
              <ActivityIndicator color="#E63946" />
              <Text variant="caption">Compression & upload…</Text>
            </MotiView>
          ) : hasImage ? (
            <MotiView
              key="preview"
              from={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "timing", duration: 180 }}
              style={{ flex: 1, position: "relative" }}
            >
              <Image
                source={{ uri: state.publicUrl ?? undefined }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={150}
              />
              <Pressable
                onPress={onRemove}
                hitSlop={8}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 32,
                  height: 32,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                  backgroundColor: "rgba(0,0,0,0.55)",
                }}
              >
                <Trash2 size={16} color="#fff" />
              </Pressable>
              <Pressable
                onPress={onOpenCamera}
                hitSlop={8}
                style={{
                  position: "absolute",
                  bottom: 8,
                  alignSelf: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: "rgba(0,0,0,0.6)",
                }}
              >
                <Text className="text-xs font-medium text-white">
                  Remplacer
                </Text>
              </Pressable>
            </MotiView>
          ) : (
            <MotiView
              key="empty"
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ flex: 1 }}
              className="items-center justify-center gap-2 px-2"
            >
              <Pressable
                onPress={onOpenCamera}
                disabled={!isInteractive}
                hitSlop={8}
                className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 active:bg-primary/25"
              >
                <Camera size={26} color="#E63946" />
              </Pressable>
              <Text className="text-sm font-medium">Prendre en photo</Text>
              <Pressable
                onPress={onPickFromGallery}
                disabled={!isInteractive}
                hitSlop={8}
                className="mt-1 flex-row items-center gap-1.5"
              >
                <FolderOpen size={14} color="#64748b" />
                <Text variant="caption">Choisir un fichier</Text>
              </Pressable>
            </MotiView>
          )}
        </AnimatePresence>
      </View>

      {layout.width > 0 ? null : null}
    </View>
  );
}

export function ImageUploader({
  onImagesChange,
  initialCover,
  initialBack,
}: Props) {
  const [cover, setCover] = useState<SlotState>(
    initialCover
      ? {
          publicUrl: initialCover.publicUrl,
          storagePath: initialCover.storagePath,
          uploading: false,
        }
      : EMPTY_SLOT,
  );
  const [back, setBack] = useState<SlotState>(
    initialBack
      ? {
          publicUrl: initialBack.publicUrl,
          storagePath: initialBack.storagePath,
          uploading: false,
        }
      : EMPTY_SLOT,
  );
  const [cameraTarget, setCameraTarget] = useState<SlotKind | null>(null);

  // Keep parent in sync once on mount when initial values were provided.
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    onImagesChange?.({
      cover: cover.publicUrl
        ? { publicUrl: cover.publicUrl, storagePath: cover.storagePath ?? "" }
        : null,
      back: back.publicUrl
        ? { publicUrl: back.publicUrl, storagePath: back.storagePath ?? "" }
        : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notify = useCallback(
    (nextCover: SlotState, nextBack: SlotState) => {
      onImagesChange?.({
        cover:
          nextCover.publicUrl && nextCover.storagePath
            ? {
                publicUrl: nextCover.publicUrl,
                storagePath: nextCover.storagePath,
              }
            : null,
        back:
          nextBack.publicUrl && nextBack.storagePath
            ? {
                publicUrl: nextBack.publicUrl,
                storagePath: nextBack.storagePath,
              }
            : null,
      });
    },
    [onImagesChange],
  );

  const uploadAndSet = useCallback(
    async (
      kind: SlotKind,
      payload: {
        base64: string;
        contentType: "image/jpeg" | "image/webp" | "image/png";
      },
    ) => {
      const setter = kind === "cover" ? setCover : setBack;
      const current = kind === "cover" ? cover : back;

      setter((prev) => ({ ...prev, uploading: true }));

      try {
        const uploaded = await uploadListingImage({
          base64: payload.base64,
          contentType: payload.contentType,
          previousPath: current.storagePath,
        });
        const newState: SlotState = {
          publicUrl: uploaded.publicUrl,
          storagePath: uploaded.storagePath,
          uploading: false,
        };
        if (kind === "cover") {
          setCover(newState);
          notify(newState, back);
        } else {
          setBack(newState);
          notify(cover, newState);
        }
        toast.success("Image uploadée");
      } catch (err) {
        setter((prev) => ({ ...prev, uploading: false }));
        toast.error(
          err instanceof Error ? err.message : "Échec de l'upload",
        );
      }
    },
    [back, cover, notify],
  );

  const handleCameraCapture = useCallback(
    (img: CapturedImage) => {
      if (!cameraTarget) return;
      uploadAndSet(cameraTarget, {
        base64: img.base64,
        contentType: img.contentType,
      });
      setCameraTarget(null);
    },
    [cameraTarget, uploadAndSet],
  );

  const handlePickFromGallery = useCallback(
    async (kind: SlotKind) => {
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

      try {
        const compressed = await compressFromUri(asset.uri);
        uploadAndSet(kind, {
          base64: compressed.base64,
          contentType: "image/jpeg",
        });
      } catch {
        toast.error("Impossible de préparer cette image");
      }
    },
    [uploadAndSet],
  );

  const handleRemove = useCallback(
    async (kind: SlotKind) => {
      const current = kind === "cover" ? cover : back;
      if (current.storagePath) {
        await removeListingImage(current.storagePath);
      }
      const next = EMPTY_SLOT;
      if (kind === "cover") {
        setCover(next);
        notify(next, back);
      } else {
        setBack(next);
        notify(cover, next);
      }
    },
    [back, cover, notify],
  );

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold">Photos de la carte</Text>
        <Text variant="caption">Recto & verso obligatoires</Text>
      </View>

      <View className="flex-row gap-3">
        <ImageSlot
          label="Recto"
          state={cover}
          disabled={back.uploading}
          onOpenCamera={() => setCameraTarget("cover")}
          onPickFromGallery={() => handlePickFromGallery("cover")}
          onRemove={() => handleRemove("cover")}
        />
        <ImageSlot
          label="Verso"
          state={back}
          disabled={cover.uploading}
          onOpenCamera={() => setCameraTarget("back")}
          onPickFromGallery={() => handlePickFromGallery("back")}
          onRemove={() => handleRemove("back")}
        />
      </View>

      <CameraCapture
        open={cameraTarget !== null}
        onClose={() => setCameraTarget(null)}
        onCapture={handleCameraCapture}
      />
    </View>
  );
}
