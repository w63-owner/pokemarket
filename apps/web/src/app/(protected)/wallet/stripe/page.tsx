import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConnectDashboard } from "./connect-dashboard";

export default function StripeConnectDashboardPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Button variant="ghost" className="mb-4" render={<Link href="/wallet" />}>
        <ChevronLeft className="size-4" />
        Portefeuille
      </Button>
      <h1 className="font-heading mb-1 text-2xl font-bold">
        Espace vendeur Stripe
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Gérez vos informations, alertes de conformité et virements.
      </p>
      <ConnectDashboard />
    </div>
  );
}
