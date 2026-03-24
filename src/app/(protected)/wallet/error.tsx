"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function WalletError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Impossible de récupérer votre solde"
      description="Nous n'avons pas pu charger les informations de votre portefeuille. Réessayez dans quelques instants."
    />
  );
}
