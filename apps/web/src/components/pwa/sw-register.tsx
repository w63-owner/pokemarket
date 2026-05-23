"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let reloading = false;
    let userTriggeredUpdate = false;

    const promptReload = (worker: ServiceWorker) => {
      toast("Nouvelle version disponible", {
        description: "Rechargez pour profiter des dernières améliorations.",
        duration: Infinity,
        action: {
          label: "Recharger",
          onClick: () => {
            userTriggeredUpdate = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    // Reload the page once the new SW takes control — but only if the user
    // explicitly accepted the update, otherwise first install would force a reload.
    const onControllerChange = () => {
      if (!userTriggeredUpdate || reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (cancelled) return;

        // A new SW was already waiting from a previous tab.
        if (reg.waiting && navigator.serviceWorker.controller) {
          promptReload(reg.waiting);
        }

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              promptReload(installing);
            }
          });
        });
      } catch {
        // SW registration can fail in dev or on insecure origins; ignore.
      }
    };

    void register();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  return null;
}
