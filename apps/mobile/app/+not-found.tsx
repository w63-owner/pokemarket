import { useEffect } from "react";
import { View } from "react-native";
import { usePathname, useSegments, Link, router } from "expo-router";
import { Text } from "@/components/ui/text";

// Until `expo-dev-client` is included in the native build, the dev-launcher
// intent (`pokemarket://expo-development-client/?url=...`) is delivered to
// the JS layer instead of being intercepted natively. Expo Router then
// treats `/expo-development-client` as an unmatched route. Bounce it back
// to the root so `app/index.tsx` can take over the cold-start routing.
const isDevLauncherPath = (path: string) =>
  path === "/expo-development-client" ||
  path.startsWith("/expo-development-client/") ||
  path.startsWith("/expo-development-client?");

export default function NotFoundScreen() {
  const pathname = usePathname();
  const segments = useSegments();
  const isDevLauncher = isDevLauncherPath(pathname);

  useEffect(() => {
    if (isDevLauncher) {
      router.replace("/");
    }
  }, [isDevLauncher]);

  if (isDevLauncher) {
    return null;
  }

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
      <Text variant="h2">Route introuvable</Text>
      <Text variant="muted" className="text-center">
        Pathname: {pathname}
      </Text>
      <Text variant="muted" className="text-center">
        Segments: {JSON.stringify(segments)}
      </Text>
      <Link href="/" className="text-primary">
        Retour à l&apos;accueil
      </Link>
    </View>
  );
}
