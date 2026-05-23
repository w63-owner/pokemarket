import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { Heart, UserPlus } from "lucide-react-native";
import { MotiView, useAnimationState } from "moti";
import { router } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { useSellerFollowStatus, useToggleFollow } from "@/hooks/use-profile";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

type Props = {
  sellerId: string;
  /** Dense layout for list rows (favorites → vendeurs suivis). */
  compact?: boolean;
};

export function FollowButton({ sellerId, compact }: Props) {
  const { user } = useAuth();
  const { data: isFollowing = false } = useSellerFollowStatus(sellerId);
  const toggle = useToggleFollow(sellerId);
  const primary = useThemeColor("primary");
  const primaryForeground = useThemeColor("primaryForeground");

  // `useAnimationState` is a Moti primitive that re-runs the transition
  // each time the active state name changes — perfect for a tap-scale.
  const pressState = useAnimationState({
    rest: { scale: 1 },
    pressed: { scale: 0.95 },
  });

  useEffect(() => {
    pressState.transitionTo("rest");
  }, [pressState]);

  return (
    <Pressable
      onPress={() => {
        if (!user) {
          router.push("/(auth)/login");
          return;
        }
        toggle.mutate(!isFollowing);
      }}
      onPressIn={() => pressState.transitionTo("pressed")}
      onPressOut={() => pressState.transitionTo("rest")}
      disabled={toggle.isPending}
    >
      <MotiView
        state={pressState}
        transition={spring.snappy}
        className={cn(
          "flex-row items-center justify-center gap-2",
          compact ? "h-9 rounded-xl px-3" : "h-12 rounded-full px-5",
          isFollowing ? "border border-border bg-card" : "bg-primary",
        )}
      >
        {isFollowing ? (
          <>
            <Heart size={compact ? 15 : 18} color={primary} fill={primary} />
            <Text
              className={cn(
                "font-semibold text-foreground",
                compact ? "text-xs" : "text-sm",
              )}
            >
              Suivi
            </Text>
          </>
        ) : (
          <>
            <UserPlus size={compact ? 15 : 18} color={primaryForeground} />
            <Text
              className={cn(
                "font-semibold text-primary-foreground",
                compact ? "text-xs" : "text-sm",
              )}
            >
              Suivre
            </Text>
          </>
        )}
      </MotiView>
    </Pressable>
  );
}

/**
 * Wrapper used by callers that need a floating CTA at the bottom of the
 * public-profile screen. Adds a centered, blurred surround so the
 * button stays legible above any feed content.
 */
export function FloatingFollowBar({ sellerId }: { sellerId: string }) {
  return (
    <View className="absolute bottom-6 left-0 right-0 items-center">
      <View className="rounded-full bg-background/60 px-1 py-1 shadow-lg">
        <FollowButton sellerId={sellerId} />
      </View>
    </View>
  );
}
