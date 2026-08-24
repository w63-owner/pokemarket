"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { m, useReducedMotion } from "framer-motion";
import { CheckCircle2, MailCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

const REDIRECT_DELAY_MS = 2_000;

function getSafeDestination(next: string | null) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function ConfirmedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const isSuccess = searchParams.get("status") === "success";
  const destination = getSafeDestination(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!isSuccess) return;

    const timer = window.setTimeout(() => {
      router.replace(destination);
      router.refresh();
    }, REDIRECT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [destination, isSuccess, router]);

  async function resendConfirmation(event: React.FormEvent) {
    event.preventDefault();
    setResending(true);

    const { error } = await createClient().auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setResending(false);
    if (error) {
      toast.error("Impossible de renvoyer l’email. Réessayez dans un instant.");
      return;
    }

    setResent(true);
  }

  function continueToMarketplace() {
    router.replace(destination);
    router.refresh();
  }

  return (
    <m.main
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card rounded-2xl border p-6 text-center shadow-sm sm:p-8"
      aria-live="polite"
    >
      {isSuccess ? (
        <>
          <div className="bg-success/10 mx-auto flex size-20 items-center justify-center rounded-full">
            <CheckCircle2
              className="text-success size-11"
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </div>
          <h1 className="font-heading mt-6 text-2xl font-bold">
            Email confirmé, bienvenue !
          </h1>
          <p className="text-muted-foreground mt-3">
            Votre compte PokeMarket est maintenant actif. Vous pouvez commencer
            à découvrir les cartes disponibles.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-7 w-full"
            onClick={continueToMarketplace}
          >
            Découvrir les cartes
          </Button>
          <p className="text-muted-foreground mt-4 text-xs">
            Redirection automatique…
          </p>
        </>
      ) : resent ? (
        <>
          <div className="bg-brand/10 mx-auto flex size-20 items-center justify-center rounded-full">
            <MailCheck
              className="text-brand size-10"
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </div>
          <h1 className="font-heading mt-6 text-2xl font-bold">
            Nouvel email envoyé
          </h1>
          <p className="text-muted-foreground mt-3">
            Consultez votre boîte mail et cliquez sur le nouveau lien pour
            finaliser votre inscription.
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-7 w-full"
            onClick={() => router.replace("/auth")}
          >
            Retour à la connexion
          </Button>
        </>
      ) : (
        <>
          <div className="bg-destructive/10 mx-auto flex size-20 items-center justify-center rounded-full">
            <TriangleAlert
              className="text-destructive size-10"
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </div>
          <h1 className="font-heading mt-6 text-2xl font-bold">
            Ce lien n’est plus valide
          </h1>
          <p className="text-muted-foreground mt-3">
            Il a peut-être expiré ou déjà été utilisé. Saisissez votre email
            pour recevoir un nouveau lien de confirmation.
          </p>
          <form
            onSubmit={resendConfirmation}
            className="mt-7 space-y-4 text-left"
          >
            <div className="space-y-2">
              <Label htmlFor="confirmation-email">Email</Label>
              <Input
                id="confirmation-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vous@exemple.fr"
                autoComplete="email"
                required
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={resending}
            >
              {resending ? "Envoi en cours…" : "Renvoyer l’email"}
            </Button>
          </form>
        </>
      )}
    </m.main>
  );
}

export default function ConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-card space-y-5 rounded-2xl border p-8">
          <Skeleton className="mx-auto size-20 rounded-full" />
          <Skeleton className="mx-auto h-8 w-64" />
          <Skeleton className="mx-auto h-5 w-full max-w-sm" />
          <Skeleton className="h-10 w-full" />
        </div>
      }
    >
      <ConfirmedContent />
    </Suspense>
  );
}
