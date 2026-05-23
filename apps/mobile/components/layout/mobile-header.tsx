import type { ReactNode } from "react";
import { Pressable, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SmartBackButton } from "@/components/ui/smart-back-button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";

export type MobileHeaderProps = {
  /** Centered or left-aligned title (left by default to match the web). */
  title?: string;
  /** Optional subtitle rendered under the title in muted text. */
  subtitle?: string;
  /** Element rendered on the right side (e.g. share button, "Add" CTA). */
  rightAction?: ReactNode;
  /** Hide the back button entirely. Defaults to `false`. */
  hideBack?: boolean;
  /**
   * Where to send the user when the navigator stack is empty. Common
   * values: `/(tabs)`, `/(tabs)/profile`, `/(tabs)/inbox`. See
   * `SmartBackButton` for the lookup logic.
   */
  fallbackHref?: string;
  /**
   * Render mode.
   *
   *  - `default` (opaque): card-coloured background, sits inside the
   *    document flow. Use this on > 80% of screens.
   *  - `transparent` (overlay): no background, no border. Designed to
   *    float over a hero image (listing carousel, profile cover).
   *    Automatically uses the `overlay` variant of `SmartBackButton`.
   *  - `bare` (no surface, opaque): no SafeAreaView padding either.
   *    Use when the screen already wraps the header in its own
   *    SafeAreaView (e.g. inbox).
   */
  variant?: "default" | "transparent" | "bare";
  /** Centre the title horizontally instead of left-aligning. */
  centerTitle?: boolean;
  /**
   * Optional press handler for the title — useful when the title is
   * also a navigation target (e.g. tapping the seller's username inside
   * a conversation header navigates to their public profile).
   */
  onTitlePress?: () => void;
} & Pick<ViewProps, "style">;

/**
 * Reusable screen header for stack screens.
 *
 * Mirrors the web `MobileHeader` (apps/web/src/components/layout/...)
 * with three call-site driven variants:
 *
 *   - `default`  : opaque header sitting inside the document flow.
 *   - `transparent` : floating overlay (image hero, video cover).
 *   - `bare`    : no SafeAreaView padding (when caller owns insets).
 */
export function MobileHeader({
  title,
  subtitle,
  rightAction,
  hideBack = false,
  fallbackHref = "/",
  variant = "default",
  centerTitle = false,
  onTitlePress,
  style,
}: MobileHeaderProps) {
  const isOverlay = variant === "transparent";
  const isBare = variant === "bare";

  const Wrapper = isBare ? View : SafeAreaView;
  const wrapperProps = isBare ? {} : { edges: ["top" as const] };

  // Left-aligned, centred, or right-only layouts emerge naturally from
  // the same flex container as long as we keep a placeholder div on
  // the trailing edge to balance the back button. This avoids the
  // title shifting horizontally as `rightAction` mounts/unmounts.
  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        isOverlay
          ? "absolute inset-x-0 top-0 z-10"
          : "border-b border-border bg-card",
      )}
      style={style}
      pointerEvents="box-none"
    >
      <View
        className="flex-row items-center gap-3 px-2 py-2"
        pointerEvents="box-none"
      >
        <View className="w-12 items-start" pointerEvents="box-none">
          {hideBack ? (
            <View className="h-10 w-10" />
          ) : (
            <SmartBackButton
              fallbackHref={fallbackHref}
              variant={isOverlay ? "overlay" : "default"}
            />
          )}
        </View>

        <View
          className={cn(
            "min-w-0 flex-1",
            centerTitle ? "items-center" : "items-start",
          )}
        >
          {title || subtitle ? (
            onTitlePress ? (
              <Pressable
                onPress={onTitlePress}
                className={cn(centerTitle ? "items-center" : "items-start")}
              >
                <TitleStack
                  title={title}
                  subtitle={subtitle}
                  isOverlay={isOverlay}
                />
              </Pressable>
            ) : (
              <TitleStack
                title={title}
                subtitle={subtitle}
                isOverlay={isOverlay}
              />
            )
          ) : null}
        </View>

        <View className="min-w-12 items-end" pointerEvents="box-none">
          {rightAction ?? <View className="h-10 w-10" />}
        </View>
      </View>
    </Wrapper>
  );
}

function TitleStack({
  title,
  subtitle,
  isOverlay,
}: {
  title?: string;
  subtitle?: string;
  isOverlay: boolean;
}) {
  return (
    <>
      {title ? (
        <Text
          numberOfLines={1}
          className={cn("text-base font-semibold", isOverlay && "text-white")}
        >
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          numberOfLines={1}
          className={cn(
            "text-xs",
            isOverlay ? "text-white/80" : "text-muted-foreground",
          )}
        >
          {subtitle}
        </Text>
      ) : null}
    </>
  );
}
