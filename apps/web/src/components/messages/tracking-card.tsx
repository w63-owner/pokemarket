"use client";

import { m } from "framer-motion";
import { Package, ExternalLink, Hash } from "lucide-react";
import type { Message } from "@/types";

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

interface TrackingCardProps {
  message: Message;
}

export function TrackingCard({ message }: TrackingCardProps) {
  const metadata = message.metadata as {
    tracking_number?: string;
    tracking_url?: string;
    shipped_at?: string;
  } | null;

  const trackingNumber = metadata?.tracking_number;
  const trackingUrl = metadata?.tracking_url
    ? normalizeUrl(metadata.tracking_url)
    : undefined;
  const shippedAt = metadata?.shipped_at;

  if (!trackingNumber) return null;

  const formattedDate = shippedAt
    ? new Date(shippedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex justify-center px-4 py-2"
    >
      <div className="flex max-w-sm items-start gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
        <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-amber-500/10 p-1.5">
          <Package className="size-4 text-amber-600 dark:text-amber-400" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-foreground text-sm font-semibold">
              Colis expédié
            </p>
            {formattedDate && (
              <span className="text-muted-foreground ml-auto text-[11px]">
                {formattedDate}
              </span>
            )}
          </div>

          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            Le vendeur a expédié la carte. Confirmez la réception à
            l&apos;arrivée du colis pour clôturer la transaction.
          </p>

          <div className="mt-1.5 flex items-center gap-1.5">
            <Hash className="text-muted-foreground size-3.5 shrink-0" />
            <span className="text-foreground font-mono text-xs font-medium select-all">
              {trackingNumber}
            </span>
          </div>

          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 active:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              <ExternalLink className="size-3" />
              Suivre le colis
            </a>
          )}
        </div>
      </div>
    </m.div>
  );
}
