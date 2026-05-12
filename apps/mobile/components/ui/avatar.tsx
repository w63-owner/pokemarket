import { View } from "react-native";
import { Image } from "expo-image";
import { cn } from "@/lib/cn";
import { Text } from "./text";

type Props = {
  uri?: string | null;
  fallback?: string;
  size?: number;
  className?: string;
};

export function Avatar({ uri, fallback = "?", size = 40, className }: Props) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={200}
      />
    );
  }

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={cn(
        "items-center justify-center bg-muted",
        className as string,
      )}
    >
      <Text className="font-semibold text-foreground">
        {fallback.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}
