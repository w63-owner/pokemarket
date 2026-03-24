"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";
import { CreditCard, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { MobileHeader } from "@/components/layout/mobile-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { queryKeys } from "@/lib/query-keys";

type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
};

async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  const res = await fetch("/api/stripe/payment-methods");
  if (!res.ok) throw new Error("Impossible de charger les cartes");
  const data = await res.json();
  return data.payment_methods;
}

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

function brandLabel(brand: string) {
  return BRAND_LABELS[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

export default function PaymentsPage() {
  const {
    data: cards,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.paymentMethods.list(),
    queryFn: fetchPaymentMethods,
  });

  return (
    <>
      <MobileHeader title="Moyens de paiement" fallbackUrl="/profile" />
      <div className="mx-auto max-w-lg px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6 flex items-center justify-end">
            <Button size="sm" render={<Link href="/profile/payments/new" />}>
              <Plus className="size-4" />
              Ajouter
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : error ? (
            <p className="text-destructive text-sm">
              Erreur lors du chargement des cartes.
            </p>
          ) : !cards || cards.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="size-8" />}
              title="Aucune carte enregistrée"
              description="Ajoutez une carte bancaire pour vos futurs achats."
              action={{
                label: "Ajouter une carte",
                href: "/profile/payments/new",
              }}
            />
          ) : (
            <div className="space-y-3">
              {cards.map((card, i) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card>
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
                        <CreditCard className="text-muted-foreground size-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">
                          {brandLabel(card.brand)} •••• {card.last4}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Expire {String(card.exp_month).padStart(2, "0")}/
                          {card.exp_year}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() =>
                          toast.info(
                            "La suppression de carte sera disponible prochainement.",
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </>
  );
}
