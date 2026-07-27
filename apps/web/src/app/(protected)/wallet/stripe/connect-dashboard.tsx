"use client";

import { useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import {
  ConnectAccountManagement,
  ConnectComponentsProvider,
  ConnectNotificationBanner,
  ConnectPayouts,
} from "@stripe/react-connect-js";
import { toast } from "sonner";

async function fetchClientSecret(): Promise<string> {
  const response = await fetch("/api/stripe-connect/account-session", {
    method: "POST",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.client_secret !== "string") {
    throw new Error(body.error ?? "Session Stripe Connect indisponible");
  }
  return body.client_secret;
}

export function ConnectDashboard() {
  const [connectInstance] = useState(() =>
    loadConnectAndInitialize({
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
      fetchClientSecret,
      appearance: {
        variables: {
          colorPrimary: "#E63946",
          borderRadius: "12px",
        },
      },
      locale: "fr-FR",
    }),
  );

  const onLoadError = () =>
    toast.error("Impossible de charger les outils Stripe Connect");

  return (
    <ConnectComponentsProvider connectInstance={connectInstance}>
      <div className="space-y-6">
        <ConnectNotificationBanner onLoadError={onLoadError} />
        <section>
          <h2 className="font-heading mb-3 text-lg font-semibold">
            Compte vendeur
          </h2>
          <ConnectAccountManagement onLoadError={onLoadError} />
        </section>
        <section>
          <h2 className="font-heading mb-3 text-lg font-semibold">Virements</h2>
          <ConnectPayouts onLoadError={onLoadError} />
        </section>
      </div>
    </ConnectComponentsProvider>
  );
}
