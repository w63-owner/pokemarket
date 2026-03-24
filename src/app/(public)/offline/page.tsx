"use client";

import { m } from "framer-motion";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <m.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="flex max-w-sm flex-col items-center gap-6"
      >
        <m.div
          initial={{ y: -8 }}
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          className="bg-muted relative flex size-24 items-center justify-center rounded-full"
        >
          <WifiOff className="text-muted-foreground size-10" />
          <m.div
            className="bg-destructive absolute -right-1 -bottom-1 size-6 rounded-full"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 400 }}
          >
            <span className="flex size-full items-center justify-center text-xs font-bold text-white">
              !
            </span>
          </m.div>
        </m.div>

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold">
            Vous semblez être hors ligne
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Vérifiez votre connexion Internet et réessayez. Vos données
            sauvegardées restent accessibles.
          </p>
        </div>

        <Button
          size="lg"
          onClick={() => window.location.reload()}
          className="gap-2"
        >
          <RefreshCw className="size-4" />
          Réessayer
        </Button>

        <p className="text-muted-foreground/60 text-xs">
          PokeMarket nécessite une connexion pour fonctionner
        </p>
      </m.div>
    </main>
  );
}
