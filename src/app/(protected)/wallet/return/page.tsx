"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KycStatus } from "@/lib/constants";

type Status = "checking" | "success" | "error";

export default function WalletReturnPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [kycStatus, setKycStatus] = useState<KycStatus>("PENDING");

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const res = await fetch("/api/stripe-connect/status");
        if (!res.ok) throw new Error("Erreur");

        const data = await res.json();
        if (cancelled) return;

        setKycStatus(data.kyc_status);
        setStatus("success");

        setTimeout(() => {
          if (!cancelled) router.replace("/wallet");
        }, 2500);
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center px-4">
      <m.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm text-center"
      >
        {status === "checking" && (
          <>
            <Loader2 className="text-primary mx-auto mb-4 size-12 animate-spin" />
            <h1 className="font-heading mb-2 text-xl font-bold">
              Vérification en cours…
            </h1>
            <p className="text-muted-foreground text-sm">
              Nous vérifions votre compte Stripe.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <m.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <CheckCircle2 className="mx-auto mb-4 size-12 text-emerald-500" />
            </m.div>
            <h1 className="font-heading mb-2 text-xl font-bold">
              {kycStatus === "VERIFIED"
                ? "Identité vérifiée !"
                : "Informations enregistrées"}
            </h1>
            <p className="text-muted-foreground mb-6 text-sm">
              {kycStatus === "VERIFIED"
                ? "Votre compte est prêt. Vous pouvez demander des virements."
                : "Votre vérification est en cours. Vous serez notifié dès qu'elle sera terminée."}
            </p>
            <p className="text-muted-foreground text-xs">
              Redirection vers votre portefeuille…
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <AlertTriangle className="text-destructive mx-auto mb-4 size-12" />
            <h1 className="font-heading mb-2 text-xl font-bold">
              Une erreur est survenue
            </h1>
            <p className="text-muted-foreground mb-6 text-sm">
              Impossible de vérifier le statut de votre compte.
            </p>
            <Button onClick={() => router.replace("/wallet")}>
              Retour au portefeuille
            </Button>
          </>
        )}
      </m.div>
    </div>
  );
}
