import {
  useFonts as useExpoFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";

/**
 * Single source of truth for the typography stack loaded at app boot.
 *
 * Keys mirror the names referenced by `tailwind.config.js#fontFamily`
 * so utility classes like `font-sans`, `font-heading`, `font-display`,
 * `font-mono` resolve to a registered native font face.
 *
 * Bundled assets are stripped to the weights we actually consume on
 * mobile (web ships more variants because it dynamically subsets via
 * `next/font`). When adding a weight to the design system, register
 * it here and reference it from `tailwind.config.js` to keep the two
 * in lock-step.
 */
export const APP_FONTS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  GeistMono_400Regular,
} as const;

/**
 * Hook returning `[loaded, error]` for the full PokeMarket typography
 * bundle. Designed to be awaited in `app/_layout.tsx` alongside the
 * splash screen so the first paint never falls back to system fonts.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useExpoFonts(APP_FONTS);
}
