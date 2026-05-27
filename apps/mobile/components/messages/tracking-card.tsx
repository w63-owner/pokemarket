import { Linking, Pressable, View } from "react-native";
import { MotiView } from "moti";
import { ExternalLink, Hash, Package } from "lucide-react-native";
import type { Message } from "@pokemarket/shared";
import { Text } from "@/components/ui";
import { fadeInScale, spring, useReducedMotionSafe } from "@/lib/motion";
import { useThemeColors } from "@/lib/theme-colors";

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

interface TrackingCardProps {
  message: Message;
}

export function TrackingCard({ message }: TrackingCardProps) {
  const metadata = message.metadata as {
    tracking_number?: string;
    tracking_url?: string;
    shipped_at?: string;
  } | null;

  const trackingNumber = metadata?.tracking_number;
  const trackingUrl = metadata?.tracking_url
    ? normalizeUrl(metadata.tracking_url)
    : undefined;
  const shippedAt = metadata?.shipped_at;

  if (!trackingNumber) return null;

  const formattedDate = shippedAt
    ? new Date(shippedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const reduceMotion = useReducedMotionSafe();
  const colors = useThemeColors();

  return (
    <MotiView
      from={reduceMotion ? fadeInScale.animate : fadeInScale.from}
      animate={fadeInScale.animate}
      transition={spring.snappy}
      style={{ alignSelf: "center", paddingVertical: 6 }}
    >
      <View className="w-72 overflow-hidden rounded-2xl border border-warning/30 bg-warning/10">
        <View className="flex-row items-center gap-2 border-b border-warning/30 bg-warning/20 px-3 py-2">
          <Package size={16} color={colors.warning} />
          <Text className="text-xs font-semibold text-warning">
            Colis expédié
          </Text>
          {formattedDate ? (
            <Text className="ml-auto text-[10px] text-warning/70">
              {formattedDate}
            </Text>
          ) : null}
        </View>

        <View className="gap-2 px-3 py-2.5">
          <View className="flex-row items-center gap-2">
            <Hash size={14} color={colors.warning} />
            <Text
              className="font-mono text-xs font-medium text-foreground"
              selectable
            >
              {trackingNumber}
            </Text>
          </View>

          {trackingUrl ? (
            <Pressable
              onPress={() => Linking.openURL(trackingUrl).catch(() => {})}
              className="flex-row items-center gap-1.5 self-start rounded-md bg-warning px-2.5 py-1.5"
            >
              <ExternalLink size={12} color={colors.warningForeground} />
              <Text className="text-xs font-medium text-warning-foreground">
                Suivre le colis
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </MotiView>
  );
}
