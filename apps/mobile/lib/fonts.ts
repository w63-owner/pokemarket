import {
  useFonts as useExpoFonts,
  Inter_400Regular,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import {
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";

/**
 * Critical font subset loaded at boot (before the splash screen hides).
 * Kept minimal so the first paint is blocked as briefly as possible.
 *
 * Weights included here:
 *   • Inter 400 — body text everywhere
 *   • Inter 600 — semibold labels, buttons
 *   • PlusJakartaSans 700 — headings (font-heading)
 *   • PlusJakartaSans 800 — animated splash logo (font-display, needed before first frame)
 *
 * Deferred weights (loaded post-mount in `_layout.tsx`):
 *   • Inter 500, Inter 700, PlusJakartaSans 600, GeistMono 400
 */
export const CRITICAL_FONTS = {
  Inter_400Regular,
  Inter_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} as const;

/**
 * Hook returning `[loaded, error]` for the critical PokeMarket typography
 * bundle. Blocks the splash screen until resolved.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useExpoFonts(CRITICAL_FONTS);
}
