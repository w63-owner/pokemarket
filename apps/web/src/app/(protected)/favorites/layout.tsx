import { FEATURE_FLAGS } from "@pokemarket/shared";
import { ServerFeatureGate } from "@/components/feature-flags/server-feature-gate";

export default function FavoritesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServerFeatureGate flag={FEATURE_FLAGS.FAVORITES} name="Les favoris">
      {children}
    </ServerFeatureGate>
  );
}
