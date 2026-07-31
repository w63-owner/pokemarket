import { FEATURE_FLAGS } from "@pokemarket/shared";
import { ServerFeatureGate } from "@/components/feature-flags/server-feature-gate";

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServerFeatureGate flag={FEATURE_FLAGS.MESSAGING} name="La messagerie">
      {children}
    </ServerFeatureGate>
  );
}
