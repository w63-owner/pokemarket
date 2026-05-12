import { Pressable, Share } from "react-native";
import { Share2 } from "lucide-react-native";
import { env } from "@/lib/env";
import { useThemeColor } from "@/lib/theme-colors";

type Props = {
  username: string;
  size?: number;
};

export function ShareProfileButton({ username, size = 20 }: Props) {
  const foreground = useThemeColor("foreground");

  const handleShare = async () => {
    const url = buildProfileUrl(username);
    try {
      await Share.share({
        message: `Découvrez @${username} sur PokeMarket : ${url}`,
        url,
      });
    } catch {
      // User cancelled or platform error – nothing to surface.
    }
  };

  return (
    <Pressable
      onPress={handleShare}
      hitSlop={8}
      className="h-10 w-10 items-center justify-center rounded-full bg-card active:opacity-80"
    >
      <Share2 size={size} color={foreground} />
    </Pressable>
  );
}

function buildProfileUrl(username: string): string {
  // Prefer the public website URL so the link works even for recipients
  // without the app installed; the deep link will resolve to the
  // mobile app on devices that have it via universal links.
  const base = env.API_URL.replace(/\/$/, "");
  return `${base}/u/${encodeURIComponent(username)}`;
}
