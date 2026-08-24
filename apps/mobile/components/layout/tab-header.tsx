import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";

export type TabHeaderProps = {
  /** Main heading for the tab, or a custom branded wordmark. */
  title: ReactNode;
  /** Optional secondary line, rendered as a muted small text. */
  subtitle?: string;
  /**
   * Element rendered on the trailing edge — typically a ghost
   * `Button` (e.g. inbox → "Offres"). Vertically centred.
   */
  right?: ReactNode;
};

/**
 * Shared header for the five bottom-tab roots
 * (`index`, `favorites`, `sell`, `inbox`, `profile`).
 *
 * Replaces the five bespoke `SafeAreaView + Text variant="h2"` blocks
 * that each tab used to inline. Mirrors the rhythm of `MobileHeader`
 * (used on stack screens) but is purpose-built for tab roots:
 *
 *  - Reserves the top safe-area inset (status bar / notch).
 *  - Uses the `bg-background` surface (not `bg-card`) — tabs aren't a
 *    push, they're the canvas, so the header has no separate "lift".
 *  - String titles render as `h2`; the home tab can provide its wordmark.
 *  - Relies on spacing rather than a divider to keep the tab canvas clean.
 */
export function TabHeader({ title, subtitle, right }: TabHeaderProps) {
  return (
    <SafeAreaView edges={["top"]} className="bg-background">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <View className="min-w-0 flex-1">
          {typeof title === "string" ? (
            <Text variant="h2" numberOfLines={1}>
              {title}
            </Text>
          ) : (
            title
          )}
          {subtitle ? (
            <Text variant="muted" numberOfLines={1} className="mt-0.5">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View className="shrink-0">{right}</View> : null}
      </View>
    </SafeAreaView>
  );
}
