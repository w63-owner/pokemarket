"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function ListingError({
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
      title="Annonce introuvable"
      description="Cette annonce n'a pas pu être chargée. Elle a peut-être été retirée ou une erreur est survenue."
    />
  );
}
