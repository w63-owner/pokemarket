import { FEATURE_FLAGS } from "@deckdealr/shared";
import { ServerFeatureGate } from "@/components/feature-flags/server-feature-gate";
import { MessagesShell } from "@/components/messages/messages-shell";

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServerFeatureGate flag={FEATURE_FLAGS.MESSAGING} name="La messagerie">
      <MessagesShell>{children}</MessagesShell>
    </ServerFeatureGate>
  );
}
