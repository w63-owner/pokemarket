"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "hasAcceptedCookies";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        if (!localStorage.getItem(STORAGE_KEY)) {
          setVisible(true);
        }
      } catch {
        // localStorage unavailable (SSR, private browsing, etc.)
      }
    });
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // silently fail
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentement aux cookies"
      className="bg-background fixed right-0 bottom-0 left-0 z-[60] flex flex-col items-center justify-between gap-4 border-t p-4 shadow-lg sm:flex-row"
    >
      <p className="text-muted-foreground max-w-2xl text-center text-sm sm:text-left">
        Nous utilisons des cookies essentiels pour assurer le bon fonctionnement
        de la plateforme (authentification, sécurité) et améliorer votre
        expérience.{" "}
        <Link
          href="/legal/privacy"
          className="hover:text-foreground underline underline-offset-4 transition-colors"
        >
          En savoir plus
        </Link>
      </p>
      <Button onClick={accept} size="sm" className="shrink-0">
        Accepter
      </Button>
    </div>
  );
}
