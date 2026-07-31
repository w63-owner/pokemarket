import { FEATURE_FLAGS } from "@pokemarket/shared";
import { ServerFeatureGate } from "@/components/feature-flags/server-feature-gate";

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServerFeatureGate flag={FEATURE_FLAGS.HOME_SEARCH} name="La recherche">
      {children}
    </ServerFeatureGate>
  );
}
