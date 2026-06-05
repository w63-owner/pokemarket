import { useEffect } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react-native";
import { queryKeys } from "@pokemarket/shared";
import { getMessageAttachmentSignedUrl } from "@/lib/api/conversations";

const AnimatedImage = Animated.createAnimatedComponent(Image);

const MAX_SCALE = 4;
const MIN_SCALE = 1;

interface ImageLightboxProps {
  storagePath: string | null;
  onClose: () => void;
}

/**
 * Full-screen image viewer with pinch-to-zoom + pan, opened when a user
 * taps an image message. Re-reads the same React Query the bubble used,
 * so the signed URL is served straight from cache (no extra round-trip).
 */
export function ImageLightbox({ storagePath, onClose }: ImageLightboxProps) {
  const insets = useSafeAreaInsets();
  const open = !!storagePath;

  const { data: signedUrl, isLoading } = useQuery({
    queryKey: queryKeys.conversations.messageAttachment(storagePath ?? ""),
    queryFn: () => getMessageAttachmentSignedUrl(storagePath!),
    enabled: open,
    staleTime: 50 * 60 * 1000,
  });

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reset = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  // Reset zoom/pan whenever a new image is opened.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storagePath]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= MIN_SCALE) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (scale.value <= MIN_SCALE) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > MIN_SCALE) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
      }
    });

  const composed = Gesture.Simultaneous(Gesture.Race(doubleTap, pan), pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-black">
          <Pressable
            onPress={onClose}
            accessibilityLabel="Fermer"
            hitSlop={12}
            style={{ top: insets.top + 8 }}
            className="absolute right-4 z-10 size-10 items-center justify-center rounded-full bg-white/15"
          >
            <X size={22} color="#fff" />
          </Pressable>

          {isLoading || !signedUrl ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <GestureDetector gesture={composed}>
              <View className="flex-1 items-center justify-center">
                <AnimatedImage
                  source={{ uri: signedUrl }}
                  style={[{ width: "100%", height: "100%" }, animatedStyle]}
                  contentFit="contain"
                  transition={120}
                  accessibilityLabel="Image en plein écran"
                />
              </View>
            </GestureDetector>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
