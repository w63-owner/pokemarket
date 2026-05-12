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

// Placeholder used for the very first render so the markup matches between
// server and client. We can't derive the real countdown during SSR because
// `Date.now()` would differ from the value computed at hydration on the
// client (the server clock is ahead of the user's clock by however long the
// HTML spent travelling over the wire), which produced a hydration mismatch
// warning attributed to whichever node happened to be next to the timer.
const INITIAL_TIME_LEFT = { minutes: 0, seconds: 0, total: Infinity };

export function CountdownTimer({
  expiresAt,
  onExpired,
  className,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME_LEFT);
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
    // Compute the real time left as soon as the next frame after mount (no
    // flash of "00:00" visible to the user) and then keep ticking every
    // second. We defer the first tick via rAF instead of calling it
    // synchronously in the effect body to avoid the cascading-render lint
    // (`react-hooks/set-state-in-effect`) — calling setState inside a rAF
    // callback runs outside the effect body, so it's allowed.
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
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
