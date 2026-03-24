"use client";

import { useState, useEffect } from "react";
import { m, AnimatePresence, LazyMotion, domAnimation } from "framer-motion";

const CARD_ASPECT = 63 / 88;
const SCAN_PHASE_MS = 1700;
const DISMISS_MS = 2800;

const BRACKET_POSITIONS = ["tl", "tr", "bl", "br"] as const;
type BracketPosition = (typeof BRACKET_POSITIONS)[number];

function ScanBracket({ position }: { position: BracketPosition }) {
  const isTop = position[0] === "t";
  const isLeft = position[1] === "l";

  return (
    <m.span
      className="absolute"
      style={{
        width: 22,
        height: 22,
        ...(isTop ? { top: -1 } : { bottom: -1 }),
        ...(isLeft ? { left: -1 } : { right: -1 }),
        borderColor: "hsl(var(--brand))",
        borderStyle: "solid",
        borderWidth: 0,
        ...(isTop ? { borderTopWidth: 2.5 } : { borderBottomWidth: 2.5 }),
        ...(isLeft ? { borderLeftWidth: 2.5 } : { borderRightWidth: 2.5 }),
        borderRadius: isTop
          ? isLeft
            ? "6px 0 0 0"
            : "0 6px 0 0"
          : isLeft
            ? "0 0 0 6px"
            : "0 0 6px 0",
      }}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function SplashScreen() {
  const [isVisible, setIsVisible] = useState(false);
  const [phase, setPhase] = useState<"scan" | "logo">("scan");

  useEffect(() => {
    if (sessionStorage.getItem("hasSeenSplash")) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    sessionStorage.setItem("hasSeenSplash", "1");

    const scanMs = reduced ? 300 : SCAN_PHASE_MS;
    const dismissMs = reduced ? 1000 : DISMISS_MS;

    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;

    const t0 = window.setTimeout(() => {
      setIsVisible(true);
      t1 = window.setTimeout(() => setPhase("logo"), scanMs);
      t2 = window.setTimeout(() => setIsVisible(false), dismissMs);
    }, 0);

    return () => {
      window.clearTimeout(t0);
      if (t1 !== undefined) window.clearTimeout(t1);
      if (t2 !== undefined) window.clearTimeout(t2);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isVisible && (
          <m.div
            key="splash"
            className="bg-background fixed inset-0 z-[9999] flex items-center justify-center"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
          >
            {/* Ambient radial glow behind the animation */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 45%, hsl(var(--brand) / 0.06) 0%, transparent 60%)",
              }}
            />

            <AnimatePresence mode="wait">
              {phase === "scan" ? (
                /* ── Phase 1: Card scan ───────────────────────── */
                <m.div
                  key="scan"
                  className="relative"
                  style={{
                    width: "45%",
                    maxWidth: 170,
                    aspectRatio: CARD_ASPECT,
                  }}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
                >
                  <div className="border-brand/30 absolute inset-0 rounded-lg border-2" />

                  {BRACKET_POSITIONS.map((pos) => (
                    <ScanBracket key={pos} position={pos} />
                  ))}

                  {/* Laser line */}
                  <m.div
                    className="absolute inset-x-1 h-[2px]"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, hsl(var(--brand)), transparent)",
                      boxShadow:
                        "0 0 8px 2px hsl(var(--brand) / 0.5), 0 0 24px 4px hsl(var(--brand) / 0.15)",
                    }}
                    initial={{ top: "2%" }}
                    animate={{ top: ["2%", "96%", "2%"] }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                  />

                  {/* Glow pulse around card */}
                  <m.div
                    className="absolute inset-0 rounded-lg"
                    animate={{
                      boxShadow: [
                        "0 0 0px 0px hsl(var(--brand) / 0)",
                        "0 0 20px 4px hsl(var(--brand) / 0.1)",
                        "0 0 0px 0px hsl(var(--brand) / 0)",
                      ],
                    }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                  />
                </m.div>
              ) : (
                /* ── Phase 2: Logo reveal ─────────────────────── */
                <m.div
                  key="logo"
                  className="flex flex-col items-center gap-2"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 12 }}
                >
                  <h1 className="font-heading text-4xl font-extrabold tracking-tight">
                    Poke<span className="text-brand">Market</span>
                  </h1>

                  <m.p
                    className="text-muted-foreground text-xs tracking-widest uppercase"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 0.7, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                  >
                    Attrapez-les tous
                  </m.p>
                </m.div>
              )}
            </AnimatePresence>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
