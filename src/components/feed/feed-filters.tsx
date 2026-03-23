"use client";

import { useState, useEffect } from "react";
import { Search, SlidersHorizontal, X, Bookmark } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useFiltersFromUrl,
  useUpdateFilters,
  countActiveFilters,
} from "@/hooks/use-feed-filters";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  CARD_CONDITIONS,
  CONDITION_LABELS,
  SORT_OPTIONS,
  RARITY_OPTIONS,
} from "@/lib/constants";
import { SaveSearchDialog } from "@/components/saved-searches/save-search-dialog";

function AdvancedFilters() {
  const filters = useFiltersFromUrl();
  const { updateFilters } = useUpdateFilters();

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="filter-series">Bloc</Label>
        <Input
          id="filter-series"
          placeholder="Ex: Écarlate et Violet..."
          value={filters.series ?? ""}
          onChange={(e) =>
            updateFilters({ series: e.target.value || undefined })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-set">Série</Label>
        <Input
          id="filter-set"
          placeholder="Ex: Flammes Obsidiennes..."
          value={filters.set ?? ""}
          onChange={(e) => updateFilters({ set: e.target.value || undefined })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-card-number">N° de carte</Label>
        <Input
          id="filter-card-number"
          placeholder="Ex: 25/165"
          value={filters.card_number ?? ""}
          onChange={(e) =>
            updateFilters({ card_number: e.target.value || undefined })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label>Rareté</Label>
        <Select
          value={filters.rarity ?? ""}
          onValueChange={(val) => updateFilters({ rarity: val || undefined })}
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
          onValueChange={(val) =>
            updateFilters({ condition: val || undefined })
          }
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
          <Label htmlFor="filter-graded">Carte gradée</Label>
          <Switch
            id="filter-graded"
            checked={filters.is_graded ?? false}
            onCheckedChange={(checked: boolean) =>
              updateFilters({
                is_graded: checked || undefined,
                ...(!checked && {
                  grade_min: undefined,
                  grade_max: undefined,
                }),
              })
            }
          />
        </div>

        <AnimatePresence>
          {filters.is_graded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="filter-grade-min"
                    className="text-muted-foreground text-xs"
                  >
                    Note min
                  </Label>
                  <Input
                    id="filter-grade-min"
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    placeholder="1"
                    value={filters.grade_min ?? ""}
                    onChange={(e) =>
                      updateFilters({
                        grade_min: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="filter-grade-max"
                    className="text-muted-foreground text-xs"
                  >
                    Note max
                  </Label>
                  <Input
                    id="filter-grade-max"
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    placeholder="10"
                    value={filters.grade_max ?? ""}
                    onChange={(e) =>
                      updateFilters({
                        grade_max: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
              </div>
            </motion.div>
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
              updateFilters({
                price_min: e.target.value ? Number(e.target.value) : undefined,
              })
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
              updateFilters({
                price_max: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function FeedFiltersInner() {
  const filters = useFiltersFromUrl();
  const { updateFilters, resetFilters } = useUpdateFilters();
  const activeCount = countActiveFilters(filters);
  const { user } = useAuth();

  const [searchText, setSearchText] = useState(filters.q ?? "");
  const debouncedSearch = useDebounce(searchText, 300);

  useEffect(() => {
    const currentQ = new URLSearchParams(window.location.search).get("q") ?? "";
    if (debouncedSearch === currentQ) return;
    updateFilters({ q: debouncedSearch || undefined });
  }, [debouncedSearch, updateFilters]);

  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Rechercher (ex: Dracaufeu 11/25)..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pr-8 pl-9"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => {
                setSearchText("");
                updateFilters({ q: undefined });
              }}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Effacer la recherche</span>
            </button>
          )}
        </div>

        <Select
          value={filters.sort ?? "date_desc"}
          onValueChange={(val) =>
            updateFilters({
              sort: !val || val === "date_desc" ? undefined : val,
            })
          }
        >
          <SelectTrigger className="w-auto shrink-0">
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

        {/* Mobile: bottom sheet trigger */}
        <div className="lg:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="relative shrink-0"
                />
              }
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeCount > 0 && (
                <span className="bg-brand absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </SheetTrigger>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              className="max-h-[85vh] overflow-y-auto rounded-t-2xl"
            >
              <div className="bg-muted mx-auto mt-2 h-1 w-10 shrink-0 rounded-full" />
              <SheetHeader>
                <SheetTitle>Filtres avancés</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-2">
                <AdvancedFilters />
              </div>
              <SheetFooter>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      resetFilters();
                      setSearchText("");
                      setSheetOpen(false);
                    }}
                  >
                    Réinitialiser
                  </Button>
                  <SheetClose render={<Button className="flex-1" />}>
                    Voir les résultats
                  </SheetClose>
                </div>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop: inline advanced filters */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 xl:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Bloc</Label>
            <Input
              placeholder="Ex: Écarlate et Violet..."
              value={filters.series ?? ""}
              onChange={(e) =>
                updateFilters({ series: e.target.value || undefined })
              }
            />
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Série</Label>
            <Input
              placeholder="Ex: Flammes Obsidiennes..."
              value={filters.set ?? ""}
              onChange={(e) =>
                updateFilters({ set: e.target.value || undefined })
              }
            />
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">N° de carte</Label>
            <Input
              placeholder="Ex: 25/165"
              value={filters.card_number ?? ""}
              onChange={(e) =>
                updateFilters({ card_number: e.target.value || undefined })
              }
            />
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Rareté</Label>
            <Select
              value={filters.rarity ?? ""}
              onValueChange={(val) =>
                updateFilters({ rarity: val || undefined })
              }
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

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">État</Label>
            <Select
              value={filters.condition ?? ""}
              onValueChange={(val) =>
                updateFilters({ condition: val || undefined })
              }
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

          <div className="flex items-end gap-2 pb-0.5">
            <Switch
              id="filter-graded-desktop"
              checked={filters.is_graded ?? false}
              onCheckedChange={(checked: boolean) =>
                updateFilters({
                  is_graded: checked || undefined,
                  ...(!checked && {
                    grade_min: undefined,
                    grade_max: undefined,
                  }),
                })
              }
            />
            <Label htmlFor="filter-graded-desktop" className="text-xs">
              Gradée
            </Label>
          </div>

          {filters.is_graded && (
            <>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">
                  Grade min
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  placeholder="1"
                  value={filters.grade_min ?? ""}
                  onChange={(e) =>
                    updateFilters({
                      grade_min: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">
                  Grade max
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  placeholder="10"
                  value={filters.grade_max ?? ""}
                  onChange={(e) =>
                    updateFilters({
                      grade_max: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">
              Prix min (€)
            </Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="Min"
              value={filters.price_min ?? ""}
              onChange={(e) =>
                updateFilters({
                  price_min: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">
              Prix max (€)
            </Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="Max"
              value={filters.price_max ?? ""}
              onChange={(e) =>
                updateFilters({
                  price_max: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </div>
        </div>
      </div>

      {activeCount > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {activeCount} filtre{activeCount > 1 ? "s" : ""} actif
            {activeCount > 1 ? "s" : ""}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetFilters();
              setSearchText("");
            }}
          >
            <X className="mr-1 h-3 w-3" />
            Réinitialiser
          </Button>
          {user && (
            <SaveSearchDialog filters={filters}>
              <Button variant="ghost" size="sm">
                <Bookmark className="mr-1 h-3 w-3" />
                Sauvegarder
              </Button>
            </SaveSearchDialog>
          )}
        </div>
      )}
    </div>
  );
}

export function FeedFilters() {
  const filters = useFiltersFromUrl();
  const qKey = filters.q ?? "";
  return <FeedFiltersInner key={qKey} />;
}
