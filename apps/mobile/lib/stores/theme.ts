import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

type ThemeState = {
  preference: ThemePreference;
  systemScheme: EffectiveTheme;
  setPreference: (next: ThemePreference) => void;
  /** Internal: keep zustand in sync with OS-level appearance changes. */
  _setSystemScheme: (scheme: EffectiveTheme) => void;
};

/**
 * Persisted theme preference.
 *
 * `preference` is what the user chose (`light`, `dark`, or follow `system`).
 * `systemScheme` mirrors `Appearance.getColorScheme()` so consumers can
 * derive the *effective* scheme without depending on `useColorScheme`
 * (which doesn't fire on every change in some Hermes builds).
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: "system",
      systemScheme:
        (Appearance.getColorScheme() as EffectiveTheme | null) ?? "light",
      setPreference: (next) => set({ preference: next }),
      _setSystemScheme: (scheme) => set({ systemScheme: scheme }),
    }),
    {
      name: "pokemarket.theme",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ preference: state.preference }),
    },
  ),
);

Appearance.addChangeListener(({ colorScheme }) => {
  useThemeStore
    .getState()
    ._setSystemScheme((colorScheme as EffectiveTheme | null) ?? "light");
});

/**
 * Resolves the user's chosen preference into a concrete theme. Use this
 * everywhere instead of reading `preference` directly so `system` is
 * handled uniformly.
 */
export function useEffectiveTheme(): EffectiveTheme {
  const preference = useThemeStore((s) => s.preference);
  const systemScheme = useThemeStore((s) => s.systemScheme);
  return preference === "system" ? systemScheme : preference;
}
