import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { Heart, UserPlus } from "lucide-react-native";
import { MotiView, useAnimationState } from "moti";
import { useSellerFollowStatus, useToggleFollow } from "@/hooks/use-profile";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

type Props = {
  sellerId: string;
};

export function FollowButton({ sellerId }: Props) {
  const { data: isFollowing = false } = useSellerFollowStatus(sellerId);
  const toggle = useToggleFollow(sellerId);

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
      onPress={() => toggle.mutate(!isFollowing)}
      onPressIn={() => pressState.transitionTo("pressed")}
      onPressOut={() => pressState.transitionTo("rest")}
      disabled={toggle.isPending}
    >
      <MotiView
        state={pressState}
        transition={{ type: "timing", duration: 90 }}
        className={cn(
          "h-12 flex-row items-center justify-center gap-2 rounded-full px-5",
          isFollowing ? "border border-border bg-card" : "bg-primary",
        )}
      >
        {isFollowing ? (
          <>
            <Heart size={18} color="#E63946" fill="#E63946" />
            <Text className="text-sm font-semibold text-foreground">Suivi</Text>
          </>
        ) : (
          <>
            <UserPlus size={18} color="#fff" />
            <Text className="text-sm font-semibold text-primary-foreground">
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
