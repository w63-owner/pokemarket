"use client";

import { useState, useEffect, useCallback } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "pwa-install-dismissed-at";
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const ENGAGEMENT_DELAY_MS = 30_000;
const ENGAGEMENT_SCROLL_PX = 600;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ advertises itself as MacIntel
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  // beforeinstallprompt is unavailable on iOS, but "Add to Home Screen"
  // only works in real Safari (not Chrome/Firefox/Edge in-app browsers).
  return !/CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV/i.test(navigator.userAgent);
}

function isInCooldown(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const ts = Number.parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage may be blocked (private mode); ignore
  }
}

function clearDismissed() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [engaged, setEngaged] = useState(false);
  // Lazy initializer: helpers guard against SSR (typeof window). On the server
  // this is `false`, on the client it reflects the real environment, matching
  // the rendered output (`AnimatePresence` with no children) — no hydration mismatch.
  const [eligible, setEligible] = useState(
    () => !isStandalone() && !isInCooldown(),
  );

  useEffect(() => {
    if (!eligible) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      clearDismissed();
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [eligible]);

  useEffect(() => {
    if (!eligible) return;

    const markEngaged = () => setEngaged(true);
    const timer = window.setTimeout(markEngaged, ENGAGEMENT_DELAY_MS);

    const onScroll = () => {
      if (window.scrollY > ENGAGEMENT_SCROLL_PX) markEngaged();
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [eligible]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome !== "accepted") markDismissed();
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    markDismissed();
    setDeferredPrompt(null);
    setEngaged(false);
    setEligible(false);
  }, []);

  const showNative = eligible && engaged && deferredPrompt !== null;
  const showIOS =
    eligible && engaged && deferredPrompt === null && isIOSSafari();
  const visible = showNative || showIOS;

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed right-4 bottom-20 left-4 z-50 lg:bottom-4"
          role="dialog"
          aria-labelledby="pwa-install-title"
        >
          <div className="bg-card mx-auto flex max-w-md items-center gap-3 rounded-2xl border p-3 shadow-lg">
            <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-xl">
              {showIOS ? (
                <Share className="text-primary size-5" />
              ) : (
                <Download className="text-primary size-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p id="pwa-install-title" className="text-sm font-semibold">
                Installer PokeMarket
              </p>
              <p className="text-muted-foreground text-xs">
                {showIOS
                  ? "Appuyez sur Partager puis « Sur l'écran d'accueil »"
                  : "Ajoutez l'app à votre écran d'accueil"}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {showNative && (
                <Button size="sm" onClick={handleInstall}>
                  Installer
                </Button>
              )}
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground rounded-full p-1.5 transition-colors"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
