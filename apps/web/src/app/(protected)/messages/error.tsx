"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function MessagesError({
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
      title="Messagerie indisponible"
      description="Impossible de charger vos conversations pour le moment. Réessayez dans quelques instants."
    />
  );
}
