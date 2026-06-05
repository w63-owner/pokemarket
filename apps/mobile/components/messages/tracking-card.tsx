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

/** Mirror of the helper in `system-message.tsx`: tint the card/icon
 *  backgrounds with the accent colour at low opacity. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(107, 114, 128, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface TrackingCardProps {
  message: Message;
}

export function TrackingCard({ message }: TrackingCardProps) {
  const reduceMotion = useReducedMotionSafe();
  const colors = useThemeColors();

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

  const accent = colors.warning;

  return (
    <MotiView
      from={reduceMotion ? fadeInScale.animate : fadeInScale.from}
      animate={fadeInScale.animate}
      transition={spring.snappy}
      style={{ paddingVertical: 6, paddingHorizontal: 16 }}
    >
      <View
        className="w-full flex-row items-start gap-2.5 rounded-2xl border px-4 py-3"
        style={{
          backgroundColor: withAlpha(accent, 0.08),
          borderColor: withAlpha(accent, 0.25),
        }}
      >
        <View
          className="mt-0.5 rounded-full p-1.5"
          style={{ backgroundColor: withAlpha(accent, 0.16) }}
        >
          <Package size={16} color={accent} />
        </View>

        <View className="flex-1 gap-1.5">
          <View className="flex-row items-center">
            <Text className="text-sm font-semibold text-foreground">
              Colis expédié
            </Text>
            {formattedDate ? (
              <Text className="ml-auto text-[11px] text-muted-foreground">
                {formattedDate}
              </Text>
            ) : null}
          </View>

          <Text className="text-xs leading-5 text-muted-foreground">
            Le vendeur a expédié la carte. Confirmez la réception à
            l&apos;arrivée du colis pour clôturer la transaction.
          </Text>

          <View className="flex-row items-center gap-1.5">
            <Hash size={13} color={colors.mutedForeground} />
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
              className="mt-0.5 flex-row items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5"
              style={{ backgroundColor: accent }}
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
