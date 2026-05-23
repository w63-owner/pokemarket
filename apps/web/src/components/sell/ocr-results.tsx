"use client";

import { useState } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { ScanLine, CircleHelp, Sparkles } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OcrCandidate } from "@/types/api";

const MANUAL_VALUE = "__manual__";

interface OcrResultsProps {
  candidates: OcrCandidate[];
  isLoading: boolean;
  onSelect: (cardKey: string | null) => void;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return "bg-emerald-500";
  if (confidence >= 50) return "bg-amber-500";
  return "bg-red-400";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 80) return "Forte";
  if (confidence >= 50) return "Moyenne";
  return "Faible";
}

function ScanSkeleton() {
  return (
    <div className="space-y-4">
      <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        <Sparkles className="text-brand size-4 animate-pulse" />
        <span>Analyse de la carte en cours…</span>
      </div>

      <div className="border-border bg-card relative overflow-hidden rounded-xl border p-4">
        <div className="flex gap-4">
          <div className="bg-muted relative h-[100px] w-[72px] shrink-0 overflow-hidden rounded-lg">
            <m.div
              className="via-brand/60 absolute inset-x-0 h-1 bg-gradient-to-r from-transparent to-transparent"
              animate={{ y: [0, 100, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </div>
          <div className="flex flex-1 flex-col justify-center gap-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>

        <m.div
          className="from-brand/[0.03] absolute inset-x-0 top-0 h-full bg-gradient-to-b to-transparent"
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {[1, 2].map((i) => (
        <div
          key={i}
          className="border-border bg-card rounded-xl border p-4"
          style={{ opacity: 1 - i * 0.3 }}
        >
          <div className="flex gap-4">
            <Skeleton className="h-[100px] w-[72px] shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col justify-center gap-2.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-2 w-4/5 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CandidateCard({
  candidate,
  isSelected,
}: {
  candidate: OcrCandidate;
  isSelected: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <m.label
      htmlFor={`candidate-${candidate.card_key}`}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
        isSelected
          ? "border-brand bg-brand/5 ring-brand/30 ring-1"
          : "border-border bg-card hover:border-muted-foreground/40",
      )}
      whileTap={{ scale: 0.98 }}
      layout
    >
      <RadioGroupItem
        id={`candidate-${candidate.card_key}`}
        value={candidate.card_key}
        className="mt-1 shrink-0"
      />

      <div className="bg-muted relative h-[100px] w-[72px] shrink-0 overflow-hidden rounded-lg">
        {candidate.image_url && !imgError ? (
          <Image
            src={candidate.image_url}
            alt={candidate.name}
            fill
            className="object-cover"
            sizes="72px"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CircleHelp className="text-muted-foreground/40 size-6" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="font-display text-foreground truncate text-sm font-semibold">
            {candidate.name}
          </span>
          {candidate.hp != null && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {candidate.hp} HP
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {candidate.set_name && (
            <span className="text-muted-foreground truncate text-xs">
              {candidate.set_name}
            </span>
          )}
          {candidate.rarity && (
            <Badge variant="secondary" className="text-[10px]">
              {candidate.rarity}
            </Badge>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <m.div
              className={cn(
                "h-full rounded-full",
                confidenceColor(candidate.confidence),
              )}
              initial={{ width: 0 }}
              animate={{ width: `${candidate.confidence}%` }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
            />
          </div>
          <span
            className={cn(
              "text-[10px] font-medium tabular-nums",
              candidate.confidence >= 80
                ? "text-emerald-600 dark:text-emerald-400"
                : candidate.confidence >= 50
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-500 dark:text-red-400",
            )}
          >
            {candidate.confidence}%
          </span>
        </div>

        <span className="text-muted-foreground/60 text-[10px]">
          {confidenceLabel(candidate.confidence)} confiance ·{" "}
          {candidate.language.toUpperCase()}
        </span>
      </div>
    </m.label>
  );
}

export function OcrResults({
  candidates,
  isLoading,
  onSelect,
}: OcrResultsProps) {
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) {
    return <ScanSkeleton />;
  }

  if (candidates.length === 0) {
    return null;
  }

  const handleChange = (value: string | null) => {
    if (!value) return;
    setSelected(value);
    onSelect(value === MANUAL_VALUE ? null : value);
  };

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <ScanLine className="text-brand size-4" />
        <h3 className="font-display text-foreground text-sm font-semibold">
          Résultats de l&apos;identification
        </h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {candidates.length} résultat{candidates.length > 1 ? "s" : ""}
        </Badge>
      </div>

      <RadioGroup value={selected ?? undefined} onValueChange={handleChange}>
        <AnimatePresence mode="popLayout">
          {candidates.map((candidate, i) => (
            <m.div
              key={candidate.card_key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <CandidateCard
                candidate={candidate}
                isSelected={selected === candidate.card_key}
              />
            </m.div>
          ))}

          <m.label
            key="manual"
            htmlFor="candidate-manual"
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 transition-colors",
              selected === MANUAL_VALUE
                ? "border-brand bg-brand/5 ring-brand/30 ring-1"
                : "border-border bg-card hover:border-muted-foreground/40",
            )}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: candidates.length * 0.06 }}
            whileTap={{ scale: 0.98 }}
          >
            <RadioGroupItem
              id="candidate-manual"
              value={MANUAL_VALUE}
              className="shrink-0"
            />
            <div className="flex items-center gap-2">
              <CircleHelp className="text-muted-foreground size-4" />
              <span className="text-muted-foreground text-sm font-medium">
                Aucun de ces résultats (Saisie manuelle)
              </span>
            </div>
          </m.label>
        </AnimatePresence>
      </RadioGroup>
    </m.div>
  );
}
