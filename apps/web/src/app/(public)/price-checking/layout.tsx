import type { Metadata } from "next";
import { FEATURE_FLAGS } from "@deckdealr/shared";

import { ServerFeatureGate } from "@/components/feature-flags/server-feature-gate";

export const metadata: Metadata = {
  title: "Cote des cartes Pokémon",
  description:
    "Recherchez une carte Pokémon française et consultez sa cote Cardmarket actuelle par variante.",
};

export default function PriceCheckingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServerFeatureGate
      flag={FEATURE_FLAGS.PRICE_CHECKING}
      name="La cote des cartes"
    >
      {children}
    </ServerFeatureGate>
  );
}
