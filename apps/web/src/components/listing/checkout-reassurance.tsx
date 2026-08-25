import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

export function CheckoutReassurance({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-muted-foreground flex items-center justify-center gap-1.5 text-xs",
        className,
      )}
    >
      <ShieldCheck
        className="text-primary size-4 shrink-0"
        aria-hidden="true"
      />
      Paiement sécurisé par Stripe · Protection acheteur
    </p>
  );
}
