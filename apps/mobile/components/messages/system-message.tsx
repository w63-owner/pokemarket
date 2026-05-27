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
import { fadeInScale, spring, useReducedMotionSafe } from "@/lib/motion";
import { useThemeColors } from "@/lib/theme-colors";
import { TrackingCard } from "./tracking-card";

type IconComponent = React.ComponentType<{ size: number; color: string }>;

type SystemConfig = { label?: string; icon: IconComponent; color: string };

// Same pattern as the wallet/orders status maps: each entry's icon
// colour is resolved from the live palette so badges stay readable
// in both light and dark themes.
function useSystemConfig(): Record<string, SystemConfig> {
  const colors = useThemeColors();
  return {
    offer: { icon: Tag, color: colors.primary },
    offer_accepted: {
      label: "Offre acceptée",
      icon: PartyPopper,
      color: colors.success,
    },
    offer_rejected: {
      label: "Offre déclinée",
      icon: XCircle,
      color: colors.mutedForeground,
    },
    offer_cancelled: {
      label: "Offre annulée",
      icon: Ban,
      color: colors.mutedForeground,
    },
    offer_cancelled_by_buyer: {
      label: "Offre annulée",
      icon: Ban,
      color: colors.mutedForeground,
    },
    payment_completed: {
      label: "Paiement effectué",
      icon: CreditCard,
      color: colors.brandSecondary,
    },
    order_shipped: {
      label: "Colis expédié",
      icon: Package,
      color: colors.warning,
    },
    sale_completed: {
      label: "Vente finalisée",
      icon: CheckCircle2,
      color: colors.success,
    },
  };
}

interface SystemMessageProps {
  message: Message;
}

export function SystemMessage({ message }: SystemMessageProps) {
  const reduceMotion = useReducedMotionSafe();
  const colors = useThemeColors();
  const systemConfig = useSystemConfig();

  if (message.message_type === "order_shipped") {
    return <TrackingCard message={message} />;
  }

  const config = message.message_type
    ? systemConfig[message.message_type]
    : undefined;
  const Icon = config?.icon ?? CheckCircle2;
  const color = config?.color ?? colors.mutedForeground;
  const label = config?.label ?? message.content ?? "Message système";

  return (
    <MotiView
      from={reduceMotion ? fadeInScale.animate : fadeInScale.from}
      animate={fadeInScale.animate}
      transition={spring.snappy}
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
