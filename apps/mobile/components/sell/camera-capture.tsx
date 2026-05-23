import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { MotiView, AnimatePresence } from "moti";
import { Aperture, SwitchCamera, X } from "lucide-react-native";
import { CameraOverlay, getOverlayCropRatios } from "./camera-overlay";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { duration } from "@/lib/motion";

export type CapturedImage = {
  uri: string;
  base64: string;
  width: number;
  height: number;
  contentType: "image/jpeg";
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (img: CapturedImage) => void;
};

const COMPRESSED_MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export function CameraCapture({ open, onClose, onCapture }: Props) {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [size, setSize] = useState<{ width: number; height: number }>(() => {
    const win = Dimensions.get("window");
    return { width: win.width, height: win.height };
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ width, height });
  }, []);

  const handleFlip = useCallback(() => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    setError(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
        exif: false,
      });
      if (!photo) throw new Error("Aucune photo capturée");

      // Map the overlay cutout (% of container) to the photo's intrinsic
      // pixel coordinates, accounting for object-fit: cover.
      const intrinsicW = photo.width;
      const intrinsicH = photo.height;
      const photoAspect = intrinsicW / intrinsicH;
      const containerAspect = size.width / size.height;
      const ratios = getOverlayCropRatios(size.width, size.height);

      let srcX: number;
      let srcY: number;
      let srcW: number;
      let srcH: number;

      if (photoAspect > containerAspect) {
        const visibleW = intrinsicH * containerAspect;
        const offsetX = (intrinsicW - visibleW) / 2;
        srcX = offsetX + ratios.x * visibleW;
        srcY = ratios.y * intrinsicH;
        srcW = ratios.width * visibleW;
        srcH = ratios.height * intrinsicH;
      } else {
        const visibleH = intrinsicW / containerAspect;
        const offsetY = (intrinsicH - visibleH) / 2;
        srcX = ratios.x * intrinsicW;
        srcY = offsetY + ratios.y * visibleH;
        srcW = ratios.width * intrinsicW;
        srcH = ratios.height * visibleH;
      }

      srcX = Math.max(0, Math.round(srcX));
      srcY = Math.max(0, Math.round(srcY));
      srcW = Math.min(Math.round(srcW), intrinsicW - srcX);
      srcH = Math.min(Math.round(srcH), intrinsicH - srcY);

      const actions: ImageManipulator.Action[] = [
        {
          crop: {
            originX: srcX,
            originY: srcY,
            width: srcW,
            height: srcH,
          },
        },
      ];

      // Downscale long-edge to COMPRESSED_MAX_DIMENSION to keep upload + OCR fast.
      const longEdge = Math.max(srcW, srcH);
      if (longEdge > COMPRESSED_MAX_DIMENSION) {
        const scale = COMPRESSED_MAX_DIMENSION / longEdge;
        actions.push({
          resize: {
            width: Math.round(srcW * scale),
            height: Math.round(srcH * scale),
          },
        });
      }

      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        actions,
        {
          base64: true,
          compress: JPEG_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      if (!manipulated.base64) throw new Error("Échec de la compression");

      onCapture({
        uri: manipulated.uri,
        base64: manipulated.base64,
        width: manipulated.width,
        height: manipulated.height,
        contentType: "image/jpeg",
      });
    } catch {
      setError("Échec de la capture. Veuillez réessayer.");
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, onCapture, size.height, size.width]);

  if (!permission) {
    // Permissions not loaded yet
    return (
      <Modal visible={open} animationType="fade" onRequestClose={onClose}>
        <View className="flex-1 items-center justify-center bg-black">
          <ActivityIndicator color="#fff" />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={open} animationType="fade" onRequestClose={onClose}>
        <View className="flex-1 items-center justify-center gap-4 bg-black px-8">
          <Text className="text-center text-white" variant="h3">
            Accès caméra requis
          </Text>
          <Text className="text-center text-white/70">
            PokeMarket a besoin d&apos;utiliser votre appareil photo pour
            scanner vos cartes.
          </Text>
          <Button onPress={() => requestPermission()} className="w-full">
            Autoriser la caméra
          </Button>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text className="text-white/60">Fermer</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={open}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black" onLayout={handleLayout}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing={facing}
          autofocus="on"
        />

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 120,
          }}
        >
          <CameraOverlay
            containerWidth={size.width}
            containerHeight={Math.max(0, size.height - 120)}
          />
        </View>

        <AnimatePresence>
          {error ? (
            <MotiView
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "timing", duration: duration.fast }}
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                top: 64,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: "rgba(220,38,38,0.85)",
              }}
            >
              <Text className="text-center text-white">{error}</Text>
            </MotiView>
          ) : null}
        </AnimatePresence>

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 120,
            backgroundColor: "#000",
          }}
          className="flex-row items-center justify-between px-8"
        >
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-12 w-12 items-center justify-center rounded-full bg-white/15"
          >
            <X size={20} color="#fff" />
          </Pressable>

          <Pressable
            onPress={handleCapture}
            disabled={isCapturing}
            hitSlop={8}
            className="h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white"
            style={{
              backgroundColor: isCapturing
                ? "rgba(255,255,255,0.4)"
                : "rgba(255,255,255,0.9)",
            }}
          >
            {isCapturing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Aperture size={32} color="rgba(0,0,0,0.7)" />
            )}
          </Pressable>

          <Pressable
            onPress={handleFlip}
            hitSlop={8}
            className="h-12 w-12 items-center justify-center rounded-full bg-white/15"
          >
            <SwitchCamera size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
