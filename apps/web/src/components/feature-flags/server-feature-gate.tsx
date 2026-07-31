import { Power } from "lucide-react";
import type { FeatureFlag } from "@pokemarket/shared";
import { EmptyState } from "@/components/shared/empty-state";
import { isFeatureEnabled } from "@/lib/feature-flags/server";

type ServerFeatureGateProps = {
  flag: FeatureFlag;
  name: string;
  children: React.ReactNode;
};

export async function ServerFeatureGate({
  flag,
  name,
  children,
}: ServerFeatureGateProps) {
  if (await isFeatureEnabled(flag)) return children;

  return (
    <main className="mx-auto w-full max-w-2xl px-4">
      <EmptyState
        icon={<Power className="size-7" />}
        title={`${name} est temporairement indisponible`}
        description="Cette fonctionnalité a été mise en pause. Elle sera de nouveau accessible prochainement."
        action={{ label: "Retour à l’accueil", href: "/" }}
      />
    </main>
  );
}
