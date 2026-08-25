import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StatusBar,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { X, ZoomIn } from "lucide-react-native";

import { duration, spring } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { Text } from "@/components/ui";

type Props = {
  images: string[];
};

const FALLBACK_BLURHASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

/**
 * Listing image carousel — mirrors the web `ImageCarousel` :
 *
 *   - Paged horizontal swipe with snap to image width
 *     (`useWindowDimensions` so rotation / split-view resizes
 *     re-flow correctly, vs. the static `Dimensions` snapshot).
 *   - Animated dot pagination : the active dot "pills" from a 6px
 *     square to a 20px pill via a Reanimated spring on `width`.
 *   - `1/N` counter overlay top-right so the user always knows the
 *     index without counting dots.
 *   - Zoom button that opens a fullscreen `Modal` with pinch + pan +
 *     double-tap reset (and tap-to-close on the backdrop).
 */
export function ImageCarousel({ images }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomed, setZoomed] = useState<{
    uri: string;
    label: string;
  } | null>(null);
  const { width } = useWindowDimensions();
  const listRef = useRef<FlashListRef<string>>(null);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      setActiveIndex((current) => {
        if (idx !== current) haptic("tap");
        return idx;
      });
    },
    [width],
  );

  if (images.length === 0) {
    return (
      <View
        style={{ width, aspectRatio: 0.72 }}
        className="items-center justify-center bg-muted"
      >
        <Text variant="muted">Aucune image</Text>
      </View>
    );
  }

  return (
    <View>
      <FlashList
        ref={listRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={images}
        keyExtractor={(uri, idx) => `${uri}-${idx}`}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item, index }) => {
          const label = index === 0 ? "Recto de la carte" : "Verso de la carte";
          return (
            <Pressable
              onPress={() => setZoomed({ uri: item, label })}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ouvrir le zoom`}
              className="bg-muted"
            >
              <Image
                source={{ uri: item }}
                style={{ width, aspectRatio: 0.72 }}
                contentFit="contain"
                cachePolicy="memory-disk"
                placeholder={{ blurhash: FALLBACK_BLURHASH }}
                priority={index === 0 ? "high" : "normal"}
                accessible
                accessibilityLabel={label}
                transition={200}
              />
            </Pressable>
          );
        }}
      />

      {images.length > 1 ? (
        <>
          <View className="absolute right-3 top-3 z-10 rounded-full bg-black/40 px-2 py-1">
            <Text className="text-xs font-medium text-white">
              {activeIndex + 1}/{images.length}
            </Text>
          </View>

          <View className="absolute bottom-3 z-10 w-full flex-row justify-center gap-1.5">
            {images.map((_, i) => (
              <DotPill key={i} active={i === activeIndex} />
            ))}
          </View>
        </>
      ) : null}

      <Pressable
        onPress={() =>
          setZoomed({
            uri: images[activeIndex],
            label:
              activeIndex === 0 ? "Recto de la carte" : "Verso de la carte",
          })
        }
        accessibilityLabel={`Voir ${
          activeIndex === 0 ? "le recto" : "le verso"
        } en grand`}
        className="absolute bottom-3 right-3 z-10 h-9 w-9 items-center justify-center rounded-full bg-black/40 active:opacity-80"
      >
        <ZoomIn size={16} color="#fff" />
      </Pressable>

      <FullscreenZoom image={zoomed} onClose={() => setZoomed(null)} />
    </View>
  );
}

/**
 * Active-state aware pagination dot — width animates from 6px to 20px
 * via a Reanimated spring (gentle preset) so the transition feels
 * tactile, matching the framer-motion `transition-all` web variant.
 */
function DotPill({ active }: { active: boolean }) {
  const width = useSharedValue(active ? 20 : 6);
  const opacity = useSharedValue(active ? 1 : 0.6);

  useEffect(() => {
    width.value = withSpring(active ? 20 : 6, spring.gentle);
    opacity.value = withTiming(active ? 1 : 0.6, { duration: duration.fast });
  }, [active, width, opacity]);

  const style = useAnimatedStyle(() => ({
    width: width.value,
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[{ height: 6, borderRadius: 999, backgroundColor: "#fff" }, style]}
    />
  );
}

/**
 * Fullscreen pinch-to-zoom Modal overlay. Combines :
 *
 *   - `Gesture.Pinch()` → updates `scale` shared value (clamped 1..5).
 *   - `Gesture.Pan()` → updates `translateX/Y` shared values when the
 *     image is scaled above 1× (otherwise pans through to a no-op so
 *     swipe-down-to-close can be added later).
 *   - `Gesture.Tap().numberOfTaps(2)` → toggles between 1× and 2.5×
 *     and resets translation when zooming out.
 *   - Backdrop tap → closes the overlay (single tap, with race-free
 *     `numberOfTaps(1)` and `.requireExternalGestureToFail(doubleTap)`
 *     to avoid swallowing the double-tap).
 */
function FullscreenZoom({
  image,
  onClose,
}: {
  image: { uri: string; label: string } | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeHeight = height - insets.top - insets.bottom;
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const reset = useCallback(() => {
    scale.value = withSpring(1, spring.gentle);
    savedScale.value = 1;
    translateX.value = withSpring(0, spring.gentle);
    translateY.value = withSpring(0, spring.gentle);
    savedTx.value = 0;
    savedTy.value = 0;
  }, [scale, savedScale, savedTx, savedTy, translateX, translateY]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.05) {
        scale.value = withSpring(1, spring.gentle);
        savedScale.value = 1;
        translateX.value = withSpring(0, spring.gentle);
        translateY.value = withSpring(0, spring.gentle);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTx.value + e.translationX;
        translateY.value = savedTy.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1, spring.gentle);
        savedScale.value = 1;
        translateX.value = withSpring(0, spring.gentle);
        translateY.value = withSpring(0, spring.gentle);
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        scale.value = withSpring(2.5, spring.gentle);
        savedScale.value = 2.5;
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => {
      runOnJS(handleClose)();
    });

  const composed = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={image !== null}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView
        edges={["top", "right", "bottom", "left"]}
        className="flex-1 bg-black/95"
      >
        <Pressable
          onPress={handleClose}
          accessibilityLabel="Fermer"
          className="absolute right-4 top-3 z-10 h-10 w-10 items-center justify-center rounded-full bg-white/10 active:opacity-80"
        >
          <X size={20} color="#fff" />
        </Pressable>

        <GestureDetector gesture={composed}>
          <Animated.View
            style={{
              width,
              height: safeHeight,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {image ? (
              <Animated.View style={imageStyle}>
                <Image
                  source={{ uri: image.uri }}
                  style={{ width, height: safeHeight * 0.8 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  accessible
                  accessibilityLabel={image.label}
                  transition={200}
                />
              </Animated.View>
            ) : null}
          </Animated.View>
        </GestureDetector>
      </SafeAreaView>
    </Modal>
  );
}
