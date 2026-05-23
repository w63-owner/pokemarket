import { useEffectiveTheme, type EffectiveTheme } from "./stores/theme";

/**
 * Concrete RGB hex values mirroring the CSS variables defined in
 * `global.css`. Used for inline `color={...}` props on lucide icons,
 * `tintColor`, and any other place where a CSS class can't be applied.
 *
 * Each token name maps 1-to-1 onto a Tailwind utility colour declared
 * in `tailwind.config.js` so refactors that want to migrate from
 * `useThemeColor("border")` to `className="border-border"` are
 * mechanical.
 *
 * Keep this map in sync with `global.css` whenever colors change —
 * design tokens flow from there, this file is a typed read-replica.
 */
const PALETTE: Record<EffectiveTheme, Record<string, string>> = {
  light: {
    background: "#ffffff",
    foreground: "#1a1a2e",
    card: "#ffffff",
    cardForeground: "#1a1a2e",
    popover: "#ffffff",
    popoverForeground: "#1a1a2e",
    primary: "#e63946",
    primaryForeground: "#ffffff",
    secondary: "#f1f3f5",
    secondaryForeground: "#1d3557",
    muted: "#f8f9fa",
    mutedForeground: "#6b7280",
    accent: "#f1f3f5",
    accentForeground: "#1a1a2e",
    destructive: "#ef4444",
    destructiveForeground: "#ffffff",
    border: "#e5e7eb",
    input: "#e5e7eb",
    ring: "#e63946",
    brand: "#e63946",
    brandForeground: "#ffffff",
    brandSecondary: "#1d3557",
    brandAccent: "#f4a261",
    success: "#10b981",
    successForeground: "#ffffff",
    warning: "#f59e0b",
    warningForeground: "#1a1a2e",
    chart1: "#e63946",
    chart2: "#1d3557",
    chart3: "#f4a261",
    chart4: "#10b981",
    chart5: "#6b7280",
    sidebar: "#f8f9fa",
    sidebarForeground: "#1a1a2e",
    sidebarPrimary: "#e63946",
    sidebarPrimaryForeground: "#ffffff",
    sidebarAccent: "#f1f3f5",
    sidebarAccentForeground: "#1a1a2e",
    sidebarBorder: "#e5e7eb",
    sidebarRing: "#e63946",
  },
  dark: {
    background: "#0f0f1a",
    foreground: "#f1f3f5",
    card: "#1a1a2e",
    cardForeground: "#f1f3f5",
    popover: "#1a1a2e",
    popoverForeground: "#f1f3f5",
    primary: "#ff4d5a",
    primaryForeground: "#ffffff",
    secondary: "#2a2a3e",
    secondaryForeground: "#f1f3f5",
    muted: "#2a2a3e",
    mutedForeground: "#9ca3af",
    accent: "#2a2a3e",
    accentForeground: "#f1f3f5",
    destructive: "#ef4444",
    destructiveForeground: "#ffffff",
    // Pre-composited from rgba(255,255,255,0.10) over #0f0f1a — see
    // global.css for the alpha-channel justification.
    border: "#272732",
    input: "#33333e",
    ring: "#ff4d5a",
    brand: "#ff4d5a",
    brandForeground: "#ffffff",
    brandSecondary: "#a8c4e0",
    brandAccent: "#f4a261",
    success: "#10b981",
    successForeground: "#ffffff",
    warning: "#f59e0b",
    warningForeground: "#1a1a2e",
    chart1: "#ff4d5a",
    chart2: "#a8c4e0",
    chart3: "#f4a261",
    chart4: "#10b981",
    chart5: "#9ca3af",
    sidebar: "#1a1a2e",
    sidebarForeground: "#f1f3f5",
    sidebarPrimary: "#ff4d5a",
    sidebarPrimaryForeground: "#ffffff",
    sidebarAccent: "#2a2a3e",
    sidebarAccentForeground: "#f1f3f5",
    sidebarBorder: "#272732",
    sidebarRing: "#ff4d5a",
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
