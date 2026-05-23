import { View } from "react-native";
import { Image } from "expo-image";
import {
  calcPriceSeller,
  calcFeeAmount,
  formatPrice,
} from "@pokemarket/shared";
import { Badge, Separator, Text } from "@/components/ui";

type OrderSummaryProps = {
  listing: {
    title: string;
    cover_image_url: string | null;
    display_price: number;
    condition: string | null;
    is_graded: boolean;
    grading_company: string | null;
    grade_note: number | null;
    card_series: string | null;
  };
  effectivePrice: number;
  shippingCost: number;
};

export function OrderSummary({
  listing,
  effectivePrice,
  shippingCost,
}: OrderSummaryProps) {
  const priceSeller = calcPriceSeller(effectivePrice);
  const buyerProtectionFee = calcFeeAmount(effectivePrice, priceSeller);
  const total = Math.round((effectivePrice + shippingCost) * 100) / 100;

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <View className="flex-row gap-4 p-4">
        {listing.cover_image_url ? (
          <View className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
            <Image
              source={{ uri: listing.cover_image_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
            />
          </View>
        ) : null}
        <View className="min-w-0 flex-1 gap-1.5">
          <Text className="font-semibold" numberOfLines={1}>
            {listing.title}
          </Text>
          {listing.card_series ? (
            <Text variant="muted" numberOfLines={1}>
              {listing.card_series}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-1.5">
            {listing.condition ? (
              <Badge variant="secondary">{listing.condition}</Badge>
            ) : null}
            {listing.is_graded && listing.grading_company ? (
              <Badge variant="secondary">
                {listing.grading_company}
                {listing.grade_note != null ? ` ${listing.grade_note}` : ""}
              </Badge>
            ) : null}
          </View>
        </View>
      </View>

      <Separator />

      <View className="gap-3 p-4">
        <View className="flex-row items-center justify-between">
          <Text variant="muted">Prix de la carte</Text>
          <Text>{formatPrice(effectivePrice)}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text variant="muted">Protection acheteur</Text>
          <Text>{formatPrice(buyerProtectionFee)}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text variant="muted">Livraison</Text>
          <Text>{formatPrice(shippingCost)}</Text>
        </View>

        <Separator />

        <View className="flex-row items-center justify-between">
          <Text className="text-base font-bold">Total</Text>
          <Text className="text-lg font-bold text-primary">
            {formatPrice(total)}
          </Text>
        </View>
      </View>
    </View>
  );
}
