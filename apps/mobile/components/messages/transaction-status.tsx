import { ActivityIndicator, View } from "react-native";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Truck,
} from "lucide-react-native";
import type { Transaction } from "@pokemarket/shared";
import { Text } from "@/components/ui";
import { useThemeColors } from "@/lib/theme-colors";

interface TransactionStatusProps {
  transaction: Transaction;
  currentUserId: string;
  sellerId: string;
  buyerId: string;
}

/**
 * Read-only transaction status bar. The active flows (ship order,
 * confirm reception, dispute) live in sprints 5/6/7 and will replace
 * this component once we have the corresponding mobile actions.
 */
export function TransactionStatus({
  transaction,
  currentUserId,
  sellerId,
  buyerId,
}: TransactionStatusProps) {
  const isSeller = currentUserId === sellerId;
  const isBuyer = currentUserId === buyerId;
  const colors = useThemeColors();

  if (transaction.status === "PENDING_PAYMENT") {
    return (
      <StatusBar
        icon={<ActivityIndicator size="small" color={colors.brandSecondary} />}
        label="Paiement en cours de validation…"
      />
    );
  }

  if (transaction.status === "PAID" && isSeller) {
    return (
      <StatusBar
        icon={<Package size={16} color={colors.brandSecondary} />}
        label="Paiement reçu — préparez le colis"
      />
    );
  }

  if (transaction.status === "PAID" && isBuyer) {
    return (
      <StatusBar
        icon={<Package size={16} color={colors.brandSecondary} />}
        label="Paiement confirmé — en attente d'envoi"
      />
    );
  }

  if (transaction.status === "SHIPPED" && isBuyer) {
    return (
      <StatusBar
        icon={<Truck size={16} color={colors.warning} />}
        label="Colis en route — confirmez la réception"
      />
    );
  }

  if (transaction.status === "SHIPPED" && isSeller) {
    return (
      <StatusBar
        icon={<Truck size={16} color={colors.warning} />}
        label="En attente de la confirmation de réception"
      />
    );
  }

  if (transaction.status === "DISPUTED") {
    return (
      <StatusBar
        icon={<AlertTriangle size={16} color={colors.destructive} />}
        label="Litige en cours — un administrateur va intervenir"
      />
    );
  }

  if (transaction.status === "COMPLETED") {
    return (
      <StatusBar
        icon={<CheckCircle2 size={16} color={colors.success} />}
        label="Transaction finalisée"
      />
    );
  }

  return null;
}

function StatusBar({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-muted/50 px-3 py-2.5">
      {icon}
      <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
    </View>
  );
}
