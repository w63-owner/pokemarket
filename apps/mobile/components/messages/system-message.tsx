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

/** Build an rgba() string from a #RGB / #RRGGBB hex so we can tint the
 *  card/icon backgrounds with the type's accent colour at low opacity. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(107, 114, 128, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type SystemConfig = {
  /** Card title. Omitted for `offer`, which uses the message content (it
   *  embeds the amount, e.g. "Offre de 4,20 €"). */
  title?: string;
  /** One-line explanation of what happened / what the next step is. */
  description?: string;
  icon: IconComponent;
  color: string;
};

// Same pattern as the wallet/orders status maps: each entry's icon
// colour is resolved from the live palette so badges stay readable
// in both light and dark themes.
function useSystemConfig(): Record<string, SystemConfig> {
  const colors = useThemeColors();
  return {
    offer: {
      icon: Tag,
      color: colors.primary,
      description:
        "Proposition de prix — le vendeur peut l'accepter ou la refuser.",
    },
    offer_accepted: {
      title: "Offre acceptée",
      icon: PartyPopper,
      color: colors.success,
      description:
        "L'offre a été acceptée. L'acheteur peut maintenant régler au prix convenu pour lancer la vente.",
    },
    offer_rejected: {
      title: "Offre déclinée",
      icon: XCircle,
      color: colors.mutedForeground,
      description:
        "Cette offre a été refusée. Une nouvelle proposition peut être envoyée.",
    },
    offer_cancelled: {
      title: "Offre annulée",
      icon: Ban,
      color: colors.mutedForeground,
      description: "L'offre a été annulée : elle n'est plus valable.",
    },
    offer_cancelled_by_buyer: {
      title: "Offre annulée",
      icon: Ban,
      color: colors.mutedForeground,
      description: "L'acheteur a retiré son offre : elle n'est plus valable.",
    },
    payment_completed: {
      title: "Paiement confirmé",
      icon: CreditCard,
      color: colors.brandSecondary,
      description:
        "Le paiement est validé et le vendeur est notifié. Prochaine étape : il prépare puis expédie la carte. Vous serez prévenu ici dès l'expédition, puis pourrez confirmer la réception du colis pour finaliser la transaction.",
    },
    order_shipped: {
      title: "Colis expédié",
      icon: Package,
      color: colors.warning,
      description:
        "Le vendeur a expédié la carte. Confirmez la réception à l'arrivée du colis pour clôturer la transaction.",
    },
    sale_completed: {
      title: "Vente finalisée",
      icon: CheckCircle2,
      color: colors.success,
      description:
        "La réception a été confirmée. La transaction est terminée et les fonds sont libérés au vendeur. Merci !",
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
  const title = config?.title ?? message.content ?? "Message système";

  // Rich step types (offers, payment, sale) get a title + explanation card so
  // the buyer/seller understands what happened and what to do next.
  if (config?.description) {
    return (
      <MotiView
        from={reduceMotion ? fadeInScale.animate : fadeInScale.from}
        animate={fadeInScale.animate}
        transition={spring.snappy}
        style={{ paddingVertical: 6, paddingHorizontal: 16 }}
      >
        <View
          className="w-full flex-row items-start gap-2.5 rounded-2xl border px-4 py-3"
          style={{
            backgroundColor: withAlpha(color, 0.08),
            borderColor: withAlpha(color, 0.25),
          }}
        >
          <View
            className="mt-0.5 rounded-full p-1.5"
            style={{ backgroundColor: withAlpha(color, 0.16) }}
          >
            <Icon size={16} color={color} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">
              {title}
            </Text>
            <Text className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {config.description}
            </Text>
          </View>
        </View>
      </MotiView>
    );
  }

  // Fallback for bare `system` notes: the compact centered pill.
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
          {title}
        </Text>
      </View>
    </MotiView>
  );
}
