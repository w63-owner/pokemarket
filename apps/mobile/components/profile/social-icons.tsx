import Svg, { Path, Rect, Circle } from "react-native-svg";

type Props = {
  size?: number;
  // Required: callers pass a theme-aware colour via `useThemeColor()`
  // so brand glyphs flip correctly between light and dark mode. No
  // default — silently rendering as `currentColor` (= black) on iOS
  // would defeat the purpose.
  color: string;
};

/**
 * Brand glyphs used by the public-profile "About" tab. Lucide's
 * React-Native v1 build dropped brand icons, so we ship inline SVGs
 * (24×24 viewBox, single-stroke) consistent with the rest of the
 * lucide icon set.
 */
export function InstagramIcon({ size = 22, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={2}
        y={2}
        width={20}
        height={20}
        rx={5}
        ry={5}
        stroke={color}
        strokeWidth={2}
      />
      <Path
        d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={17.5} cy={6.5} r={1} fill={color} />
    </Svg>
  );
}

export function FacebookIcon({ size = 22, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TikTokIcon({ size = 22, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
