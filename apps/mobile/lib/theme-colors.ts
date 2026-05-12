import { useEffectiveTheme, type EffectiveTheme } from "./stores/theme";

/**
 * Concrete RGB hex values mirroring the CSS variables defined in
 * `global.css`. Used for inline `color={...}` props on lucide icons,
 * `tintColor`, and any other place where a CSS class can't be applied.
 *
 * Keep this map in sync with `global.css` whenever colors change.
 */
const PALETTE: Record<EffectiveTheme, Record<string, string>> = {
  light: {
    background: "#ffffff",
    foreground: "#0f172a",
    card: "#ffffff",
    cardForeground: "#0f172a",
    primary: "#E63946",
    primaryForeground: "#ffffff",
    secondary: "#f1f5f9",
    secondaryForeground: "#0f172a",
    muted: "#f1f5f9",
    mutedForeground: "#64748b",
    accent: "#f1f5f9",
    accentForeground: "#0f172a",
    destructive: "#ef4444",
    destructiveForeground: "#ffffff",
    border: "#e2e8f0",
    input: "#e2e8f0",
    ring: "#E63946",
  },
  dark: {
    background: "#0f172a",
    foreground: "#f8fafc",
    card: "#1e293b",
    cardForeground: "#f8fafc",
    primary: "#E63946",
    primaryForeground: "#ffffff",
    secondary: "#334155",
    secondaryForeground: "#f8fafc",
    muted: "#334155",
    mutedForeground: "#94a3b8",
    accent: "#334155",
    accentForeground: "#f8fafc",
    destructive: "#f87171",
    destructiveForeground: "#ffffff",
    border: "#334155",
    input: "#334155",
    ring: "#E63946",
  },
};

export type ThemeColorName = keyof (typeof PALETTE)["light"];

/** Hook returning a color resolver for the current effective theme. */
export function useThemeColors(): Record<ThemeColorName, string> {
  const scheme = useEffectiveTheme();
  return PALETTE[scheme];
}

/** One-shot resolver for a single token in the current effective theme. */
export function useThemeColor(name: ThemeColorName): string {
  const scheme = useEffectiveTheme();
  return PALETTE[scheme][name];
}
