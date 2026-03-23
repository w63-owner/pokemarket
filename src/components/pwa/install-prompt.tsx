"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("pwa-install-dismissed") === "1") return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  }, []);

  const visible = deferredPrompt !== null && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed right-4 bottom-20 left-4 z-50 lg:bottom-4"
        >
          <div className="bg-card mx-auto flex max-w-md items-center gap-3 rounded-2xl border p-3 shadow-lg">
            <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-xl">
              <Download className="text-primary size-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Installer PokeMarket</p>
              <p className="text-muted-foreground text-xs">
                Ajoutez l&apos;app à votre écran d&apos;accueil
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" onClick={handleInstall}>
                Installer
              </Button>
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground rounded-full p-1.5 transition-colors"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
