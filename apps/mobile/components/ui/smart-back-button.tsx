import { Pressable } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";

export function SmartBackButton({
  fallbackHref = "/",
}: {
  fallbackHref?: string;
}) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(fallbackHref as never);
        }
      }}
      hitSlop={8}
      className="h-10 w-10 items-center justify-center rounded-full bg-card"
    >
      <ChevronLeft size={22} color="#0f172a" />
    </Pressable>
  );
}
