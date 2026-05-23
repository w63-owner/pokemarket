/** @type {import('tailwindcss').Config} */

/*
 * Design tokens are kept in lock-step with the web app:
 * - HEX values mirror `apps/web/src/app/globals.css` (light + dark).
 * - Each color is declared as a CSS variable in `apps/mobile/global.css`
 *   (RGB triplet, no `rgb()` wrapper, so NativeWind can compose
 *   `<alpha-value>` for utilities like `bg-primary/50`).
 * - The `dark:` Tailwind variant is driven by NativeWind's
 *   `setColorScheme()` which we synchronise with the persisted
 *   theme store in `app/_layout.tsx`.
 */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./features/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--color-background) / <alpha-value>)",
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        card: {
          DEFAULT: "rgb(var(--color-card) / <alpha-value>)",
          foreground: "rgb(var(--color-card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--color-popover) / <alpha-value>)",
          foreground: "rgb(var(--color-popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          foreground: "rgb(var(--color-primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--color-secondary) / <alpha-value>)",
          foreground: "rgb(var(--color-secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--color-muted) / <alpha-value>)",
          foreground: "rgb(var(--color-muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          foreground: "rgb(var(--color-accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--color-destructive) / <alpha-value>)",
          foreground:
            "rgb(var(--color-destructive-foreground) / <alpha-value>)",
        },
        border: "rgb(var(--color-border) / <alpha-value>)",
        input: "rgb(var(--color-input) / <alpha-value>)",
        ring: "rgb(var(--color-ring) / <alpha-value>)",

        brand: {
          DEFAULT: "rgb(var(--color-brand) / <alpha-value>)",
          foreground: "rgb(var(--color-brand-foreground) / <alpha-value>)",
          secondary: "rgb(var(--color-brand-secondary) / <alpha-value>)",
          accent: "rgb(var(--color-brand-accent) / <alpha-value>)",
        },

        success: {
          DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
          foreground: "rgb(var(--color-success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
          foreground: "rgb(var(--color-warning-foreground) / <alpha-value>)",
        },

        "chart-1": "rgb(var(--color-chart-1) / <alpha-value>)",
        "chart-2": "rgb(var(--color-chart-2) / <alpha-value>)",
        "chart-3": "rgb(var(--color-chart-3) / <alpha-value>)",
        "chart-4": "rgb(var(--color-chart-4) / <alpha-value>)",
        "chart-5": "rgb(var(--color-chart-5) / <alpha-value>)",

        sidebar: {
          DEFAULT: "rgb(var(--color-sidebar) / <alpha-value>)",
          foreground: "rgb(var(--color-sidebar-foreground) / <alpha-value>)",
          primary: "rgb(var(--color-sidebar-primary) / <alpha-value>)",
          "primary-foreground":
            "rgb(var(--color-sidebar-primary-foreground) / <alpha-value>)",
          accent: "rgb(var(--color-sidebar-accent) / <alpha-value>)",
          "accent-foreground":
            "rgb(var(--color-sidebar-accent-foreground) / <alpha-value>)",
          border: "rgb(var(--color-sidebar-border) / <alpha-value>)",
          ring: "rgb(var(--color-sidebar-ring) / <alpha-value>)",
        },
      },
      borderRadius: {
        // Web base is `--radius: 0.75rem` → 12px. Mobile mirrors the
        // multipliers so a `rounded-2xl` button looks identical across
        // platforms.
        sm: "calc(0.75rem * 0.6)",
        md: "calc(0.75rem * 0.8)",
        lg: "0.75rem",
        xl: "calc(0.75rem * 1.4)",
        "2xl": "calc(0.75rem * 1.8)",
        "3xl": "calc(0.75rem * 2.2)",
        "4xl": "calc(0.75rem * 2.6)",
      },
      fontFamily: {
        // Names match the font faces registered in `lib/fonts.ts` via
        // `@expo-google-fonts/*`. NativeWind cannot read a single
        // `Inter` family name and pick a weight at runtime, so we map
        // logical roles → concrete font-face names.
        sans: ["Inter_400Regular", "System"],
        heading: ["PlusJakartaSans_700Bold", "System"],
        display: ["PlusJakartaSans_800ExtraBold", "System"],
        mono: ["GeistMono_400Regular", "Menlo"],
      },
    },
  },
  plugins: [],
};
