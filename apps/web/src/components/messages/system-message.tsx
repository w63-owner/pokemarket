"use client";

import { m } from "framer-motion";
import {
  CheckCircle2,
  CreditCard,
  Package,
  Ban,
  PartyPopper,
  Tag,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TrackingCard } from "@/components/messages/tracking-card";
import type { Message } from "@/types";

type SystemConfig = {
  /** Card title. Omitted for `offer`, which uses the message content (it
   *  embeds the amount, e.g. "Offre de 4,20 €"). */
  title?: string;
  /** One-line explanation of what happened / what the next step is. */
  description?: string;
  icon: typeof CheckCircle2;
  /** Icon colour. */
  color: string;
  /** Card background + border tint. */
  tint: string;
  /** Icon-bubble background tint. */
  iconBg: string;
};

const SYSTEM_CONFIG: Record<string, SystemConfig> = {
  offer: {
    icon: Tag,
    color: "text-brand",
    tint: "border-brand/20 bg-brand/[0.06]",
    iconBg: "bg-brand/10",
    description:
      "Proposition de prix — le vendeur peut l'accepter ou la refuser.",
  },
  offer_accepted: {
    title: "Offre acceptée",
    icon: PartyPopper,
    color: "text-emerald-600 dark:text-emerald-400",
    tint: "border-emerald-500/20 bg-emerald-500/[0.06]",
    iconBg: "bg-emerald-500/10",
    description:
      "L'offre a été acceptée. L'acheteur peut maintenant régler au prix convenu pour lancer la vente.",
  },
  offer_rejected: {
    title: "Offre déclinée",
    icon: XCircle,
    color: "text-muted-foreground",
    tint: "border-border bg-muted/50",
    iconBg: "bg-background",
    description:
      "Cette offre a été refusée. Une nouvelle proposition peut être envoyée.",
  },
  offer_cancelled: {
    title: "Offre annulée",
    icon: Ban,
    color: "text-muted-foreground",
    tint: "border-border bg-muted/50",
    iconBg: "bg-background",
    description: "L'offre a été annulée : elle n'est plus valable.",
  },
  offer_cancelled_by_buyer: {
    title: "Offre annulée",
    icon: Ban,
    color: "text-muted-foreground",
    tint: "border-border bg-muted/50",
    iconBg: "bg-background",
    description: "L'acheteur a retiré son offre : elle n'est plus valable.",
  },
  payment_completed: {
    title: "Paiement confirmé",
    icon: CreditCard,
    color: "text-blue-600 dark:text-blue-400",
    tint: "border-blue-500/20 bg-blue-500/[0.06]",
    iconBg: "bg-blue-500/10",
    description:
      "Le paiement est validé et le vendeur est notifié. Prochaine étape : il prépare puis expédie la carte. Vous serez prévenu ici dès l'expédition, puis pourrez confirmer la réception du colis pour finaliser la transaction.",
  },
  order_shipped: {
    title: "Colis expédié",
    icon: Package,
    color: "text-amber-600 dark:text-amber-400",
    tint: "border-amber-500/20 bg-amber-500/[0.06]",
    iconBg: "bg-amber-500/10",
    description:
      "Le vendeur a expédié la carte. Confirmez la réception à l'arrivée du colis pour clôturer la transaction.",
  },
  sale_completed: {
    title: "Vente finalisée",
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    tint: "border-emerald-500/20 bg-emerald-500/[0.06]",
    iconBg: "bg-emerald-500/10",
    description:
      "La réception a été confirmée. La transaction est terminée et les fonds sont libérés au vendeur. Merci !",
  },
};

interface SystemMessageProps {
  message: Message;
}

export function SystemMessage({ message }: SystemMessageProps) {
  if (message.message_type === "order_shipped") {
    return <TrackingCard message={message} />;
  }

  const config = message.message_type
    ? SYSTEM_CONFIG[message.message_type]
    : undefined;
  const Icon = config?.icon ?? CheckCircle2;
  const color = config?.color ?? "text-muted-foreground";
  const title = config?.title ?? message.content ?? "Message système";

  // Rich step types (offers, payment, sale) get a title + explanation card so
  // the buyer/seller understands what happened and what to do next.
  if (config?.description) {
    return (
      <m.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="flex justify-center px-4 py-2"
      >
        <div
          className={cn(
            "flex max-w-sm items-start gap-2.5 rounded-2xl border px-4 py-3",
            config.tint,
          )}
        >
          <span
            className={cn(
              "mt-0.5 inline-flex shrink-0 rounded-full p-1.5",
              config.iconBg,
            )}
          >
            <Icon className={cn("size-4", color)} />
          </span>
          <div className="min-w-0">
            <p className="text-foreground text-sm font-semibold">{title}</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {config.description}
            </p>
          </div>
        </div>
      </m.div>
    );
  }

  // Fallback for bare `system` notes: the compact centered pill.
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex justify-center px-4 py-1"
    >
      <div className="bg-muted/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
        <Icon className={cn("size-3.5 shrink-0", color)} />
        <span className="text-muted-foreground">{title}</span>
      </div>
    </m.div>
  );
}
