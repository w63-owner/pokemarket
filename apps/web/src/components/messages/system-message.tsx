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

const SYSTEM_CONFIG: Record<
  string,
  { label?: string; icon: typeof CheckCircle2; color: string }
> = {
  offer: {
    icon: Tag,
    color: "text-brand",
  },
  offer_accepted: {
    label: "Offre acceptée",
    icon: PartyPopper,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  offer_rejected: {
    label: "Offre déclinée",
    icon: XCircle,
    color: "text-muted-foreground",
  },
  offer_cancelled: {
    label: "Offre annulée",
    icon: Ban,
    color: "text-muted-foreground",
  },
  offer_cancelled_by_buyer: {
    label: "Offre annulée",
    icon: Ban,
    color: "text-muted-foreground",
  },
  payment_completed: {
    label: "Paiement effectué",
    icon: CreditCard,
    color: "text-blue-600 dark:text-blue-400",
  },
  order_shipped: {
    label: "Colis expédié",
    icon: Package,
    color: "text-amber-600 dark:text-amber-400",
  },
  sale_completed: {
    label: "Vente finalisée",
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
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
  const label = config?.label ?? message.content ?? "Message système";

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex justify-center px-4 py-1"
    >
      <div className="bg-muted/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
        <Icon className={cn("size-3.5 shrink-0", color)} />
        <span className="text-muted-foreground">{label}</span>
      </div>
    </m.div>
  );
}
