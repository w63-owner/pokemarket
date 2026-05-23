import { Children, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { Image } from "expo-image";
import { cn } from "@/lib/cn";
import { Text } from "./text";

type AvatarProps = {
  uri?: string | null;
  fallback?: string;
  size?: number;
  className?: string;
  children?: ReactNode;
};

/**
 * Avatar — square image clipped to a circle, with a text fallback when the
 * URI is missing. The wrapper `<View>` is `position: "relative"` so callers
 * can drop overlay children (e.g. `<AvatarBadge />`) without an extra
 * wrapper. The wrapper layout matches the image size 1-to-1 so the
 * surrounding flex layout sees no shift between the image-present and
 * fallback states.
 */
export function Avatar({
  uri,
  fallback = "?",
  size = 40,
  className,
  children,
}: AvatarProps) {
  return (
    <View
      style={{ width: size, height: size }}
      className={cn("relative", className as string)}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          style={{ width: size, height: size, borderRadius: size / 2 }}
          className="items-center justify-center bg-muted"
        >
          <Text className="font-semibold text-foreground">
            {fallback.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      {children}
    </View>
  );
}

// ─── AvatarBadge ──────────────────────────────────────────────────────────────

const BADGE_SIZE: Record<NonNullable<AvatarBadgeProps["size"]>, number> = {
  sm: 8,
  default: 10,
  lg: 12,
};

type AvatarBadgeProps = ViewProps & {
  /** Match the parent `<Avatar size />` band — tiny / regular / large. */
  size?: "sm" | "default" | "lg";
  /**
   * Optional content (notification icon). The badge sizes to the parent
   * avatar band; pass small `<Text>` / `<Icon />` children for richer
   * pills. When empty, the badge renders as a presence dot.
   */
  children?: ReactNode;
  className?: string;
};

/**
 * Presence dot / notification badge anchored to the bottom-right of the
 * nearest `<Avatar>` wrapper. Must live inside an `<Avatar>` so the
 * absolute positioning resolves against the avatar's box.
 *
 * Mirrors the web `AvatarBadge` — same 2-pixel ring against the page
 * background and the same primary fill by default.
 */
export function AvatarBadge({
  size = "default",
  children,
  className,
  style,
  ...rest
}: AvatarBadgeProps) {
  const dimension = BADGE_SIZE[size];
  return (
    <View
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          position: "absolute",
          right: 0,
          bottom: 0,
          // 2 px ring = same as the web `ring-2 ring-background`. Border
          // pushes the box; on iOS/Android the visual is identical and we
          // avoid an extra wrapper.
          borderWidth: 2,
        },
        style,
      ]}
      className={cn(
        "items-center justify-center border-background bg-primary",
        className as string,
      )}
      {...rest}
    >
      {children}
    </View>
  );
}

// ─── AvatarGroup ──────────────────────────────────────────────────────────────

type AvatarGroupProps = ViewProps & {
  children: ReactNode;
  /** Cap the number of avatars rendered; the remainder collapses to `+N`. */
  max?: number;
  /** Pixels each child overlaps the previous one (defaults to 10). */
  overlap?: number;
  /** Avatar diameter — controls the `+N` chip size to keep alignment. */
  size?: number;
  className?: string;
};

/**
 * Horizontal stack of avatars with consistent overlap and an optional
 * `+N` overflow chip. Wraps each child in a `<View>` carrying a
 * `border-2 border-background` ring so adjacent avatars stay visually
 * separated against any page background.
 */
export function AvatarGroup({
  children,
  max,
  overlap = 10,
  size = 40,
  className,
  style,
  ...rest
}: AvatarGroupProps) {
  const childArray = Children.toArray(children).filter(Boolean);
  const visible = max != null ? childArray.slice(0, max) : childArray;
  const overflow = max != null ? Math.max(childArray.length - max, 0) : 0;

  return (
    <View
      style={[{ flexDirection: "row" }, style]}
      className={cn("items-center", className as string)}
      {...rest}
    >
      {visible.map((child, index) => (
        <View
          key={index}
          style={{
            marginLeft: index === 0 ? 0 : -overlap,
            borderWidth: 2,
            borderRadius: size / 2,
          }}
          className="border-background"
        >
          {child}
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            marginLeft: -overlap,
            borderWidth: 2,
          }}
          className="items-center justify-center border-background bg-muted"
        >
          <Text className="text-xs font-semibold text-muted-foreground">
            +{overflow}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
