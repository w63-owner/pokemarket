"use client";

import { motion, type Variants } from "framer-motion";

/** Pokemon card standard ratio: 63mm × 88mm → width/height */
export const CARD_ASPECT_RATIO = 63 / 88;

/** Cutout occupies 88% of the container width */
const CUTOUT_WIDTH_PERCENT = 88;

const BRACKET_LEN = 22;
const BRACKET_W = 2.5;

const bracketPulse: Variants = {
  animate: {
    opacity: [0.7, 1, 0.7],
    transition: {
      duration: 2.4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

function CornerBracket({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const isTop = position.startsWith("t");
  const isLeft = position.endsWith("l");

  return (
    <motion.span
      className="absolute"
      style={{
        width: BRACKET_LEN,
        height: BRACKET_LEN,
        ...(isTop ? { top: -BRACKET_W / 2 } : { bottom: -BRACKET_W / 2 }),
        ...(isLeft ? { left: -BRACKET_W / 2 } : { right: -BRACKET_W / 2 }),
        borderColor: "hsl(var(--brand))",
        borderStyle: "solid",
        borderWidth: 0,
        ...(isTop
          ? { borderTopWidth: BRACKET_W }
          : { borderBottomWidth: BRACKET_W }),
        ...(isLeft
          ? { borderLeftWidth: BRACKET_W }
          : { borderRightWidth: BRACKET_W }),
        borderRadius: isTop
          ? isLeft
            ? "6px 0 0 0"
            : "0 6px 0 0"
          : isLeft
            ? "0 0 0 6px"
            : "0 0 6px 0",
      }}
      variants={bracketPulse}
      animate="animate"
    />
  );
}

interface CameraOverlayProps {
  className?: string;
}

export function CameraOverlay({ className }: CameraOverlayProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
    >
      {/* Cutout with massive box-shadow acting as the dark scrim */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: `${CUTOUT_WIDTH_PERCENT}%`,
          aspectRatio: `${CARD_ASPECT_RATIO}`,
          borderRadius: 8,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.60)",
        }}
      >
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />
      </div>

      {/* Instruction label below the cutout */}
      <motion.p
        className="absolute bottom-[8%] left-0 w-full text-center text-sm font-medium tracking-wide text-white/70"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        Alignez la carte dans le cadre
      </motion.p>
    </div>
  );
}

/**
 * Returns the cutout region as ratios (0–1) of the overlay container.
 * Maps directly to camera crop coordinates because the overlay is
 * positioned over the <video> with identical dimensions.
 */
export function getOverlayCropRatios(
  containerWidth: number,
  containerHeight: number,
) {
  const cutoutW = containerWidth * (CUTOUT_WIDTH_PERCENT / 100);
  const cutoutH = cutoutW / CARD_ASPECT_RATIO;

  return {
    x: (containerWidth - cutoutW) / 2 / containerWidth,
    y: (containerHeight - cutoutH) / 2 / containerHeight,
    width: cutoutW / containerWidth,
    height: cutoutH / containerHeight,
  };
}
