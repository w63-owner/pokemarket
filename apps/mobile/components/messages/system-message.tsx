import { View } from "react-native";
import { MotiView } from "moti";
import {
  Ban,
  CheckCircle2,
  CreditCard,
  Package,
  PartyPopper,
  Tag,
  XCircle,
} from "lucide-react-native";
import type { Message } from "@pokemarket/shared";
import { Text } from "@/components/ui";
import { TrackingCard } from "./tracking-card";

type IconComponent = React.ComponentType<{ size: number; color: string }>;

const SYSTEM_CONFIG: Record<
  string,
  { label?: string; icon: IconComponent; color: string }
> = {
  offer: { icon: Tag, color: "#E63946" },
  offer_accepted: {
    label: "Offre acceptée",
    icon: PartyPopper,
    color: "#16a34a",
  },
  offer_rejected: {
    label: "Offre déclinée",
    icon: XCircle,
    color: "#64748b",
  },
  offer_cancelled: {
    label: "Offre annulée",
    icon: Ban,
    color: "#64748b",
  },
  offer_cancelled_by_buyer: {
    label: "Offre annulée",
    icon: Ban,
    color: "#64748b",
  },
  payment_completed: {
    label: "Paiement effectué",
    icon: CreditCard,
    color: "#2563eb",
  },
  order_shipped: {
    label: "Colis expédié",
    icon: Package,
    color: "#d97706",
  },
  sale_completed: {
    label: "Vente finalisée",
    icon: CheckCircle2,
    color: "#16a34a",
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
  const color = config?.color ?? "#64748b";
  const label = config?.label ?? message.content ?? "Message système";

  return (
    <MotiView
      from={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      style={{ alignSelf: "center", paddingVertical: 4 }}
    >
      <View className="flex-row items-center gap-1.5 self-center rounded-full bg-muted/70 px-3 py-1.5">
        <Icon size={14} color={color} />
        <Text className="text-xs font-medium text-muted-foreground">
          {label}
        </Text>
      </View>
    </MotiView>
  );
}
