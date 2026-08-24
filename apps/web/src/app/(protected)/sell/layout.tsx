import { FEATURE_FLAGS } from "@deckdealr/shared";
import { ServerFeatureGate } from "@/components/feature-flags/server-feature-gate";

export default function SellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServerFeatureGate flag={FEATURE_FLAGS.SELLING} name="La mise en vente">
      {children}
    </ServerFeatureGate>
  );
}
