"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function ConversationError({
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
      title="Discussion introuvable"
      description="Un problème est survenu lors du chargement de cette conversation. Réessayez ou revenez à votre boîte de réception."
    />
  );
}
