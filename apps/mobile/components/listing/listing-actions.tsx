import { router } from "expo-router";
import { View } from "react-native";
import { MotiView } from "moti";
import type { Listing } from "@deckdealr/shared";
import { formatPrice } from "@deckdealr/shared";

import { Badge, Button } from "@/components/ui";
import { spring } from "@/lib/motion";

type Props = {
  listing: Listing;
  viewerId?: string | null;
  onContact: () => void;
  contactLoading?: boolean;
};

/**
 * Buyer-side CTA stack mirroring `apps/web/src/components/listing/listing-actions.tsx`.
 *
 * The whole block is wrapped in a Moti `translateY` spring so the
 * primary CTA(s) feel like they "rise" into place once the image
 * carousel finishes its initial paint — same intent as the web sticky
 * CTA entrance animation (`spring.gentle`, `delay 100`).
 */
export function ListingActions({
  listing,
  viewerId,
  onContact,
  contactLoading = false,
}: Props) {
  const isOwner = !!viewerId && viewerId === listing.seller_id;
  const status = listing.status;
  const reservedFor = listing.reserved_for;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 24 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ ...spring.gentle, delay: 100 }}
    >
      {renderInner({
        listing,
        viewerId,
        onContact,
        contactLoading,
        isOwner,
        status,
        reservedFor,
      })}
    </MotiView>
  );
}

function renderInner({
  listing,
  viewerId,
  onContact,
  contactLoading,
  isOwner,
  status,
  reservedFor,
}: Props & {
  isOwner: boolean;
  status: Listing["status"];
  reservedFor: Listing["reserved_for"];
}) {
  if (isOwner) {
    return (
      <View className="flex-row gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onPress={() => router.push(`/sell/edit/${listing.id}`)}
        >
          Modifier
        </Button>
      </View>
    );
  }

  if (status === "SOLD") {
    return (
      <Badge variant="secondary" className="self-start">
        Vendue
      </Badge>
    );
  }

  if (status === "LOCKED") {
    return (
      <View className="flex-row items-center gap-2">
        <Badge variant="warning">Paiement en cours</Badge>
        <Button
          variant="outline"
          className="flex-1"
          onPress={onContact}
          loading={contactLoading}
        >
          Contacter le vendeur
        </Button>
      </View>
    );
  }

  if (status === "RESERVED") {
    const reservedForViewer = !!viewerId && viewerId === reservedFor;
    if (reservedForViewer) {
      const reservedDisplay =
        listing.reserved_price ?? listing.display_price ?? 0;
      return (
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            onPress={() => router.push(`/checkout/${listing.id}`)}
          >
            {`Acheter ${formatPrice(reservedDisplay)}`}
          </Button>
          <Button
            variant="outline"
            onPress={onContact}
            loading={contactLoading}
            accessibilityLabel="Contacter le vendeur"
          >
            Contacter
          </Button>
        </View>
      );
    }
    return (
      <View className="flex-row items-center gap-2">
        <Badge variant="warning">Réservée</Badge>
        <Button
          variant="outline"
          className="flex-1"
          onPress={onContact}
          loading={contactLoading}
        >
          Contacter
        </Button>
      </View>
    );
  }

  // ACTIVE
  return (
    <View className="flex-row gap-2">
      <Button
        className="flex-1"
        onPress={() => router.push(`/checkout/${listing.id}`)}
      >
        {`Acheter ${formatPrice(listing.display_price ?? 0)}`}
      </Button>
      <Button
        variant="outline"
        onPress={onContact}
        loading={contactLoading}
        accessibilityLabel="Contacter le vendeur"
      >
        Contacter
      </Button>
    </View>
  );
}
