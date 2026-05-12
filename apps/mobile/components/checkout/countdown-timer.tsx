import { useEffect, useState, useCallback } from "react";
import { View } from "react-native";
import { MotiView, AnimatePresence } from "moti";
import { Clock, AlertTriangle } from "lucide-react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

type CountdownTimerProps = {
  expiresAt: Date;
  onExpired?: () => void;
  className?: string;
};

function getTimeLeft(expiresAt: Date) {
  const diff = Math.max(0, expiresAt.getTime() - Date.now());
  const minutes = Math.floor(diff / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { minutes, seconds, total: diff };
}

export function CountdownTimer({
  expiresAt,
  onExpired,
  className,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(expiresAt));
  const [expired, setExpired] = useState(false);

  const tick = useCallback(() => {
    const t = getTimeLeft(expiresAt);
    setTimeLeft(t);
    if (t.total <= 0) {
      setExpired(true);
      onExpired?.();
    }
  }, [expiresAt, onExpired]);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  const isUrgent = timeLeft.total > 0 && timeLeft.minutes < 5;

  return (
    <AnimatePresence>
      {expired ? (
        <MotiView
          key="expired"
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "flex-row items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3",
            className,
          )}
        >
          <AlertTriangle size={20} color="#dc2626" />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-destructive">
              Session expirée
            </Text>
            <Text className="text-xs text-destructive/70">
              Le délai de paiement a expiré. Veuillez recommencer.
            </Text>
          </View>
        </MotiView>
      ) : (
        <MotiView
          key="active"
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          className={cn(
            "flex-row items-center gap-3 rounded-xl border px-4 py-3",
            isUrgent
              ? "border-destructive/30 bg-destructive/5"
              : "border-border bg-muted/50",
            className,
          )}
        >
          <Clock size={20} color={isUrgent ? "#dc2626" : "#64748b"} />
          <View className="flex-1">
            <Text variant="caption">Temps restant pour finaliser</Text>
            <Text
              className={cn(
                "text-lg font-bold tabular-nums",
                isUrgent ? "text-destructive" : "text-foreground",
              )}
            >
              {String(timeLeft.minutes).padStart(2, "0")}:
              {String(timeLeft.seconds).padStart(2, "0")}
            </Text>
          </View>
        </MotiView>
      )}
    </AnimatePresence>
  );
}
