"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function CheckoutError({
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
      title="Problème lors de l'initialisation du paiement"
      description="Nous n'avons pas pu préparer votre commande. Vérifiez votre connexion et réessayez."
    />
  );
}
