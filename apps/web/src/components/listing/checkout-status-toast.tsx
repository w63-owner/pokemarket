"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function CheckoutStatusToast() {
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("checkout");

    if (status === "cancelled") {
      toast.info("Paiement annulé", {
        description: "Votre carte n’a pas été débitée.",
      });
    } else if (status === "unavailable") {
      toast.error("Annonce indisponible", {
        description:
          "Cette annonce n’est plus disponible à l’achat pour le moment.",
      });
    }
  }, []);

  return null;
}
