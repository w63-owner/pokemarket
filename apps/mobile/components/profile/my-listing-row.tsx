import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight, Pencil, Tag } from "lucide-react-native";
import { MotiView } from "moti";
import {
  formatPrice,
  formatRelativeDate,
  type Listing,
} from "@pokemarket/shared";

import { Badge, Text } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

type StatusVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_CONFIG: Record<string, { label: string; variant: StatusVariant }> =
  {
    DRAFT: { label: "Brouillon", variant: "outline" },
    ACTIVE: { label: "En vente", variant: "default" },
    LOCKED: { label: "Verrouillée", variant: "secondary" },
    RESERVED: { label: "Réservée", variant: "secondary" },
    SOLD: { label: "Vendue", variant: "destructive" },
  };

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const }
  );
}

type Props = {
  listing: Listing;
  index: number;
};

export function MyListingRow({ listing, index }: Props) {
  const status = getStatusConfig(listing.status ?? "ACTIVE");
  const canEdit = listing.status === "ACTIVE" || listing.status === "DRAFT";
  const muted = useThemeColor("mutedForeground");

  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ delay: Math.min(index * 30, 300) }}
    >
      <Pressable
        onPress={() =>
          router.push(
            (canEdit
              ? `/sell/edit/${listing.id}`
              : `/listing/${listing.id}`) as never,
          )
        }
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:bg-muted"
      >
        <View className="h-12 w-12 overflow-hidden rounded-lg bg-muted">
          {listing.cover_image_url ? (
            <Image
              source={{ uri: listing.cover_image_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Tag size={18} color={muted} />
            </View>
          )}
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium" numberOfLines={1}>
            {listing.title}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <Badge variant={status.variant} className="px-2 py-0.5">
              <Text
                className={
                  status.variant === "default" ||
                  status.variant === "destructive"
                    ? "text-[10px] font-medium text-primary-foreground"
                    : "text-[10px] font-medium text-foreground"
                }
              >
                {status.label}
              </Text>
            </Badge>
            <Text variant="caption" className="text-[11px]">
              {listing.created_at ? formatRelativeDate(listing.created_at) : ""}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Text className="text-sm font-semibold">
            {formatPrice(listing.display_price ?? 0)}
          </Text>
          {canEdit ? (
            <Pencil size={14} color={muted} />
          ) : (
            <ChevronRight size={16} color={muted} />
          )}
        </View>
      </Pressable>
    </MotiView>
  );
}
