"use client";

import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ConditionBadge } from "@/components/shared/condition-badge";
import { formatPrice } from "@/lib/utils";
import { calcPriceSeller, calcFeeAmount } from "@/lib/pricing";

interface OrderSummaryProps {
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
}

export function OrderSummary({
  listing,
  effectivePrice,
  shippingCost,
}: OrderSummaryProps) {
  const priceSeller = calcPriceSeller(effectivePrice);
  const buyerProtectionFee = calcFeeAmount(effectivePrice, priceSeller);
  const total = Math.round((effectivePrice + shippingCost) * 100) / 100;

  return (
    <div className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
      <div className="flex gap-4 p-4">
        {listing.cover_image_url && (
          <div className="bg-muted relative h-24 w-20 shrink-0 overflow-hidden rounded-xl">
            <Image
              src={listing.cover_image_url}
              alt={listing.title}
              fill
              className="object-cover"
              sizes="80px"
            />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="font-heading truncate text-sm font-semibold">
            {listing.title}
          </h3>
          {listing.card_series && (
            <p className="text-muted-foreground truncate text-xs">
              {listing.card_series}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {listing.condition && (
              <ConditionBadge condition={listing.condition} />
            )}
            {listing.is_graded && listing.grading_company && (
              <Badge variant="secondary" className="text-xs">
                {listing.grading_company}
                {listing.grade_note != null ? ` ${listing.grade_note}` : ""}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Prix de la carte</span>
          <span>{formatPrice(effectivePrice)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Protection acheteur</span>
          <span>{formatPrice(buyerProtectionFee)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Livraison</span>
          <span>{formatPrice(shippingCost)}</span>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <span className="font-heading text-base font-bold">Total</span>
          <span className="text-primary font-heading text-lg font-bold">
            {formatPrice(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
