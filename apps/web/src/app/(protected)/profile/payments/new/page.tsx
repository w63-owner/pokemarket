"use client";

import { useState, useEffect, useCallback } from "react";
import { m } from "framer-motion";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { MobileHeader } from "@/components/layout/mobile-header";
import { Button } from "@/components/ui/button";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

function SetupForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements || isSubmitting) return;

      setIsSubmitting(true);

      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/profile/payments?success=true`,
        },
      });

      if (error) {
        toast.error(error.message ?? "Erreur lors de l'enregistrement.");
        setIsSubmitting(false);
      }
    },
    [stripe, elements, isSubmitting],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />

      <div className="bg-primary/5 border-primary/20 flex items-start gap-3 rounded-xl border p-3">
        <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Vos informations de paiement sont traitées de manière sécurisée par
          Stripe. Nous ne stockons jamais vos données bancaires.
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full text-base"
        disabled={!stripe || !elements || isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            Enregistrement…
          </>
        ) : (
          "Enregistrer ma carte"
        )}
      </Button>
    </form>
  );
}

export default function NewPaymentMethodPage() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function createSetupIntent() {
      try {
        const res = await fetch("/api/stripe/payment-methods", {
          method: "POST",
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Erreur lors de la création du SetupIntent");
          return;
        }

        setClientSecret(data.client_secret);
      } catch {
        setError("Erreur réseau. Veuillez réessayer.");
      } finally {
        setIsLoading(false);
      }
    }

    createSetupIntent();
  }, []);

  return (
    <>
      <MobileHeader title="Ajouter une carte" fallbackUrl="/profile/payments" />
      <div className="mx-auto max-w-lg px-4 py-6">
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <p className="text-muted-foreground text-sm">
            Enregistrez un moyen de paiement pour vos achats
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="text-muted-foreground size-8 animate-spin" />
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-destructive text-sm">{error}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Réessayer
              </Button>
            </div>
          ) : clientSecret ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    borderRadius: "12px",
                    fontFamily: "inherit",
                  },
                },
              }}
            >
              <SetupForm />
            </Elements>
          ) : null}
        </m.div>
      </div>
    </>
  );
}
