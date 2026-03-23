"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl">😕</p>
      <h1 className="font-heading mt-4 text-2xl font-bold">
        Quelque chose s&apos;est mal passé
      </h1>
      <p className="text-muted-foreground mt-2">
        Une erreur inattendue est survenue. Réessayez dans quelques instants.
      </p>
      <Button onClick={reset} className="mt-8">
        Réessayer
      </Button>
    </div>
  );
}
