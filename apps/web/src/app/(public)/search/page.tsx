"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Bookmark, X } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import type { FeedFilters } from "@/lib/query-keys";
import {
  filtersToSearchString,
  countActiveFilters,
} from "@/hooks/use-feed-filters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SmartBackButton } from "@/components/ui/smart-back-button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CARD_CONDITIONS,
  CONDITION_LABELS,
  SORT_OPTIONS,
  RARITY_OPTIONS,
} from "@/lib/constants";

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function readFiltersFromParams(sp: URLSearchParams): FeedFilters {
  const filters: FeedFilters = {};
  const q = sp.get("q");
  if (q) filters.q = q;
  const set = sp.get("set");
  if (set) filters.set = set;
  const rarity = sp.get("rarity");
  if (rarity) filters.rarity = rarity;
  const condition = sp.get("condition");
  if (condition) filters.condition = condition;
  if (sp.get("is_graded") === "true") {
    filters.is_graded = true;
    filters.grade_min = parseNumber(sp.get("grade_min"));
    filters.grade_max = parseNumber(sp.get("grade_max"));
  }
  filters.price_min = parseNumber(sp.get("price_min"));
  filters.price_max = parseNumber(sp.get("price_max"));
  const sort = sp.get("sort");
  if (sort) filters.sort = sort;
  return filters;
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FeedFilters>(() =>
    readFiltersFromParams(searchParams),
  );

  const activeCount = countActiveFilters(filters);

  function updateFilter<K extends keyof FeedFilters>(
    key: K,
    value: FeedFilters[K],
  ) {
    setFilters((prev) => {
      const next = { ...prev };
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === false
      ) {
        delete next[key];
      } else {
        next[key] = value;
      }
      if (key === "is_graded" && !value) {
        delete next.grade_min;
        delete next.grade_max;
      }
      return next;
    });
  }

  function handleApply() {
    const qs = filtersToSearchString(filters);
    router.push(qs ? `/?${qs}` : "/");
  }

  function handleReset() {
    setFilters({});
  }

  return (
    <main className="bg-background flex min-h-svh flex-col">
      <header className="bg-background/80 sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-lg">
        <SmartBackButton fallbackUrl="/" />
        <h1 className="font-heading text-lg font-semibold">
          Recherche avancée
        </h1>
        {activeCount > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {activeCount}
          </Badge>
        )}
      </header>

      <div className="flex-1 space-y-5 p-4">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            autoFocus
            placeholder="Nom de la carte, set..."
            value={filters.q ?? ""}
            onChange={(e) => updateFilter("q", e.target.value || undefined)}
            className="h-10 pr-8 pl-10 text-base"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => updateFilter("q", undefined)}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Tri</Label>
          <Select
            value={filters.sort ?? "date_desc"}
            onValueChange={(val) =>
              updateFilter(
                "sort",
                !val || val === "date_desc" ? undefined : val,
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label>Extension / Set</Label>
          <Input
            placeholder="Ex: Écarlate et Violet..."
            value={filters.set ?? ""}
            onChange={(e) => updateFilter("set", e.target.value || undefined)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Rareté</Label>
          <Select
            value={filters.rarity ?? ""}
            onValueChange={(val) => updateFilter("rarity", val || undefined)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Toutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Toutes</SelectItem>
              <SelectSeparator />
              {RARITY_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>État</Label>
          <Select
            value={filters.condition ?? ""}
            onValueChange={(val) => updateFilter("condition", val || undefined)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              <SelectSeparator />
              {CARD_CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="search-graded">Carte gradée</Label>
            <Switch
              id="search-graded"
              checked={filters.is_graded ?? false}
              onCheckedChange={(checked: boolean) =>
                updateFilter("is_graded", checked || undefined)
              }
            />
          </div>

          <AnimatePresence>
            {filters.is_graded && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-muted-foreground text-xs">
                      Note min
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      step={0.5}
                      placeholder="1"
                      value={filters.grade_min ?? ""}
                      onChange={(e) =>
                        updateFilter(
                          "grade_min",
                          e.target.value ? Number(e.target.value) : undefined,
                        )
                      }
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-muted-foreground text-xs">
                      Note max
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      step={0.5}
                      placeholder="10"
                      value={filters.grade_max ?? ""}
                      onChange={(e) =>
                        updateFilter(
                          "grade_max",
                          e.target.value ? Number(e.target.value) : undefined,
                        )
                      }
                    />
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-1.5">
          <Label>Prix (€)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="Min"
              value={filters.price_min ?? ""}
              onChange={(e) =>
                updateFilter(
                  "price_min",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
            />
            <span className="text-muted-foreground shrink-0">–</span>
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="Max"
              value={filters.price_max ?? ""}
              onChange={(e) =>
                updateFilter(
                  "price_max",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <Bookmark className="h-4 w-4" />
            Recherches sauvegardées
          </h2>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-muted-foreground text-sm">
              Connectez-vous pour sauvegarder et retrouver vos recherches.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-background sticky bottom-0 flex gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="outline" className="flex-1" onClick={handleReset}>
          Réinitialiser
        </Button>
        <Button className="flex-1" onClick={handleApply}>
          Appliquer
        </Button>
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}
