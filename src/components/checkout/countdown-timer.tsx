"use client";

import { useEffect, useState, useCallback } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  expiresAt: Date;
  onExpired?: () => void;
  className?: string;
}

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
    <AnimatePresence mode="wait">
      {expired ? (
        <m.div
          key="expired"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "bg-destructive/10 border-destructive/30 flex items-center gap-3 rounded-xl border px-4 py-3",
            className,
          )}
        >
          <AlertTriangle className="text-destructive size-5 shrink-0" />
          <div>
            <p className="text-destructive text-sm font-semibold">
              Session expirée
            </p>
            <p className="text-destructive/70 text-xs">
              Le délai de paiement a expiré. Veuillez recommencer.
            </p>
          </div>
        </m.div>
      ) : (
        <m.div
          key="active"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
            isUrgent
              ? "bg-destructive/5 border-destructive/30"
              : "bg-muted/50 border-border",
            className,
          )}
        >
          <Clock
            className={cn(
              "size-5 shrink-0",
              isUrgent
                ? "text-destructive animate-pulse"
                : "text-muted-foreground",
            )}
          />
          <div className="flex-1">
            <p className="text-muted-foreground text-xs">
              Temps restant pour finaliser
            </p>
            <p
              className={cn(
                "font-mono text-lg font-bold tabular-nums",
                isUrgent ? "text-destructive" : "text-foreground",
              )}
            >
              {String(timeLeft.minutes).padStart(2, "0")}:
              {String(timeLeft.seconds).padStart(2, "0")}
            </p>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
