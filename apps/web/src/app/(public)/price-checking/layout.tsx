import { FEATURE_FLAGS } from "@pokemarket/shared";
import { ServerFeatureGate } from "@/components/feature-flags/server-feature-gate";

export default function PriceCheckingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServerFeatureGate
      flag={FEATURE_FLAGS.PRICE_CHECKING}
      name="L’estimation des prix"
    >
      {children}
    </ServerFeatureGate>
  );
}
