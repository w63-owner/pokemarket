"use client";

import { useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, ShoppingBag, Home, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

interface SuccessClientProps {
  transaction: {
    id: string;
    listing_title: string | null;
    total_amount: number;
    status: string;
  };
}

function useConfetti(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  enabled = true,
) {
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  const spawn = useCallback(() => {
    if (!enabled || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = [
      "#FFDC00",
      "#FF6B6B",
      "#4ECDC4",
      "#A78BFA",
      "#F472B6",
      "#34D399",
      "#FB923C",
      "#60A5FA",
    ];

    const particles: Particle[] = [];
    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 3 + 2,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
      });
    }

    particlesRef.current = particles;

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = false;
      for (const p of particlesRef.current) {
        if (p.opacity <= 0) continue;
        alive = true;

        p.x += p.vx;
        p.vy += 0.08;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        if (p.y > canvas.height * 0.7) {
          p.opacity -= 0.02;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }

      if (alive) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [canvasRef, enabled]);

  useEffect(() => {
    if (!enabled) return;
    spawn();
    const timeout = setTimeout(spawn, 1200);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timeout);
    };
  }, [spawn, enabled]);
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

const STATUS_COPY: Record<string, { title: string; description: string }> = {
  PAID: {
    title: "Commande confirmée !",
    description:
      "Votre paiement est en cours de validation. Le vendeur sera notifié et préparera l'envoi de votre carte.",
  },
  SHIPPED: {
    title: "Commande expédiée",
    description:
      "Votre carte a été expédiée ! Vous recevrez bientôt votre colis.",
  },
  COMPLETED: {
    title: "Vente terminée",
    description:
      "Cette vente est terminée. Merci pour votre achat sur PokeMarket !",
  },
};

const FRESH_STATUSES = new Set(["PAID", "PENDING_PAYMENT"]);

function getStatusCopy(status: string) {
  return (
    STATUS_COPY[status] ?? {
      title: "Détail de la commande",
      description: `Statut actuel : ${status.toLowerCase().replace("_", " ")}.`,
    }
  );
}

export function SuccessClient({ transaction }: SuccessClientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isFresh = FRESH_STATUSES.has(transaction.status);
  useConfetti(canvasRef, isFresh);
  const copy = getStatusCopy(transaction.status);

  return (
    <div className="relative flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center px-4 py-12">
      {isFresh && (
        <canvas
          ref={canvasRef}
          className="pointer-events-none fixed inset-0 z-50"
          aria-hidden
        />
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="relative z-10 w-full max-w-md text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 15,
            delay: 0.2,
          }}
          className="mb-6 inline-flex"
        >
          <div className="bg-primary/10 relative rounded-full p-5">
            <CheckCircle2 className="text-primary size-16" strokeWidth={1.5} />
            {isFresh && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="absolute -top-1 -right-1"
              >
                <Sparkles className="size-6 text-yellow-500" />
              </motion.div>
            )}
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="font-heading mb-2 text-2xl font-bold"
        >
          {copy.title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground mb-8 text-sm"
        >
          {isFresh ? (
            <>
              Votre paiement de{" "}
              <strong className="text-foreground">
                {formatPrice(transaction.total_amount)}
              </strong>{" "}
              est en cours de validation. Le vendeur sera notifié et préparera
              l&apos;envoi de votre carte.
            </>
          ) : (
            copy.description
          )}
        </motion.p>

        {transaction.listing_title && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-muted/50 border-border mb-8 rounded-xl border px-4 py-3"
          >
            <p className="text-muted-foreground text-xs">Article</p>
            <p className="font-heading text-sm font-semibold">
              {transaction.listing_title}
            </p>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col gap-3 sm:flex-row sm:justify-center"
        >
          <Button
            render={<Link href="/profile/transactions" />}
            size="lg"
            className="flex-1 sm:flex-initial"
          >
            <ShoppingBag className="size-4" />
            Voir mes achats
          </Button>
          <Button
            render={<Link href="/" />}
            variant="outline"
            size="lg"
            className="flex-1 sm:flex-initial"
          >
            <Home className="size-4" />
            Retour à l&apos;accueil
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
