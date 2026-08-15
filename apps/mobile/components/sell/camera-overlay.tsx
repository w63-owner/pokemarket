import { View } from "react-native";
import { MotiView } from "moti";
import { Text } from "@/components/ui/text";
import { useThemeColor } from "@/lib/theme-colors";

/** Pokemon card standard ratio: 63mm × 88mm → width / height */
export const CARD_ASPECT_RATIO = 63 / 88;

/** Cutout occupies 88% of the container width */
export const CUTOUT_WIDTH_PERCENT = 0.88;

/** Extra image retained around every edge of the visible guide. */
export const CROP_MARGIN_PERCENT = 0.02;

const BRACKET_LEN = 22;
const BRACKET_W = 2.5;

type Position = "tl" | "tr" | "bl" | "br";

function CornerBracket({ position }: { position: Position }) {
  const isTop = position.startsWith("t");
  const isLeft = position.endsWith("l");
  const brandColor = useThemeColor("primary");

  return (
    <MotiView
      from={{ opacity: 0.7 }}
      animate={{ opacity: 1 }}
      transition={{
        type: "timing",
        // Custom: 1200ms breathing loop tuned for the camera bracket pulse —
        // intentionally longer than `duration.dramatic` (800ms) to feel calm
        // & idle. Documented exception to the "no hardcoded duration" rule.
        duration: 1200,
        loop: true,
      }}
      style={{
        position: "absolute",
        width: BRACKET_LEN,
        height: BRACKET_LEN,
        borderColor: brandColor,
        borderTopWidth: isTop ? BRACKET_W : 0,
        borderBottomWidth: isTop ? 0 : BRACKET_W,
        borderLeftWidth: isLeft ? BRACKET_W : 0,
        borderRightWidth: isLeft ? 0 : BRACKET_W,
        ...(isTop ? { top: -BRACKET_W / 2 } : { bottom: -BRACKET_W / 2 }),
        ...(isLeft ? { left: -BRACKET_W / 2 } : { right: -BRACKET_W / 2 }),
        borderTopLeftRadius: isTop && isLeft ? 6 : 0,
        borderTopRightRadius: isTop && !isLeft ? 6 : 0,
        borderBottomLeftRadius: !isTop && isLeft ? 6 : 0,
        borderBottomRightRadius: !isTop && !isLeft ? 6 : 0,
      }}
    />
  );
}

/**
 * Visual scrim with a card-shaped cutout, centered. Pure presentational
 * component; the camera capture screen owns the geometry math used for
 * cropping (same percentages so the rendered overlay matches the crop).
 *
 * Implementation note: React Native does not allow `box-shadow: 0 0 0 9999px`
 * the way the web does, so we draw 4 dark rectangles around the cutout.
 */
export function CameraOverlay({
  containerWidth,
  containerHeight,
}: {
  containerWidth: number;
  containerHeight: number;
}) {
  const cutoutW = containerWidth * CUTOUT_WIDTH_PERCENT;
  const cutoutH = cutoutW / CARD_ASPECT_RATIO;
  const cutoutX = (containerWidth - cutoutW) / 2;
  const cutoutY = (containerHeight - cutoutH) / 2;

  const scrim = "rgba(0, 0, 0, 0.6)";

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", inset: 0 as never }}
      className="absolute inset-0"
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: cutoutY,
          backgroundColor: scrim,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          top: cutoutY + cutoutH,
          backgroundColor: scrim,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          width: cutoutX,
          top: cutoutY,
          height: cutoutH,
          backgroundColor: scrim,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 0,
          width: cutoutX,
          top: cutoutY,
          height: cutoutH,
          backgroundColor: scrim,
        }}
      />

      <View
        style={{
          position: "absolute",
          left: cutoutX,
          top: cutoutY,
          width: cutoutW,
          height: cutoutH,
          borderRadius: 8,
        }}
      >
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />
      </View>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: cutoutY + cutoutH + 24,
        }}
      >
        <Text className="text-center text-sm font-medium tracking-wide text-white/80">
          Alignez la carte dans le cadre
        </Text>
      </View>
    </View>
  );
}

/**
 * Returns the expanded cutout as ratios (0–1) of the full CameraView.
 * The guide can be shorter than the camera preview when capture controls
 * reserve space at the bottom, so both heights must be supplied.
 */
export function getOverlayCropRatios(
  cameraWidth: number,
  cameraHeight: number,
  overlayHeight: number,
  marginPercent = CROP_MARGIN_PERCENT,
) {
  const cutoutW = cameraWidth * CUTOUT_WIDTH_PERCENT;
  const cutoutH = cutoutW / CARD_ASPECT_RATIO;
  const cutoutX = (cameraWidth - cutoutW) / 2;
  const cutoutY = (overlayHeight - cutoutH) / 2;
  const marginX = cutoutW * marginPercent;
  const marginY = cutoutH * marginPercent;

  const left = Math.max(0, cutoutX - marginX);
  const top = Math.max(0, cutoutY - marginY);
  const right = Math.min(cameraWidth, cutoutX + cutoutW + marginX);
  const bottom = Math.min(cameraHeight, cutoutY + cutoutH + marginY);

  return {
    x: left / cameraWidth,
    y: top / cameraHeight,
    width: (right - left) / cameraWidth,
    height: (bottom - top) / cameraHeight,
  };
}
