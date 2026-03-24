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
      className="flex justify-center px-4 py-1.5"
    >
      <div className="w-full max-w-xs overflow-hidden rounded-xl border border-amber-200/60 bg-amber-50/80 shadow-sm dark:border-amber-500/20 dark:bg-amber-950/30">
        <div className="flex items-center gap-2 border-b border-amber-200/60 bg-amber-100/60 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-900/30">
          <Package className="size-4 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Colis expédié
          </span>
          {formattedDate && (
            <span className="ml-auto text-[10px] text-amber-600/70 dark:text-amber-400/60">
              {formattedDate}
            </span>
          )}
        </div>

        <div className="space-y-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Hash className="size-3.5 shrink-0 text-amber-500/70 dark:text-amber-400/50" />
            <span className="text-foreground font-mono text-xs font-medium select-all">
              {trackingNumber}
            </span>
          </div>

          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 active:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
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
