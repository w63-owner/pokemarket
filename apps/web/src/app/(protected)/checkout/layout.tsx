import { FEATURE_FLAGS } from "@pokemarket/shared";
import { ServerFeatureGate } from "@/components/feature-flags/server-feature-gate";

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServerFeatureGate flag={FEATURE_FLAGS.CHECKOUT} name="Le paiement">
      {children}
    </ServerFeatureGate>
  );
}
