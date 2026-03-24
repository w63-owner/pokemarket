"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { m, AnimatePresence } from "framer-motion";
import { Search, TrendingUp, X, Loader2, Sparkles } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/client";

type PriceResult = {
  card_key: string;
  name: string;
  set_name: string;
  rarity: string | null;
  avg_price: number | null;
  listing_count: number;
  source: string;
};

async function searchPrices(query: string): Promise<PriceResult[]> {
  if (!query || query.length < 2) return [];

  const supabase = createClient();

  const { data: cards, error } = await supabase
    .from("tcgdex_cards")
    .select("card_key, name, set_id, rarity")
    .eq("language", "fr")
    .ilike("name", `%${query}%`)
    .limit(30);

  if (error) throw error;
  if (!cards || cards.length === 0) return [];

  const setIds = [...new Set(cards.map((c) => c.set_id).filter(Boolean))];

  const { data: sets } = await supabase
    .from("tcgdex_sets")
    .select("id, name")
    .eq("language", "fr")
    .in("id", setIds as string[]);

  const setMap = new Map(sets?.map((s) => [s.id, s.name]) ?? []);

  const cardKeys = cards.map((c) => c.card_key);
  const { data: listings } = await supabase
    .from("listings")
    .select("card_ref_id, display_price")
    .in("card_ref_id", cardKeys)
    .eq("status", "ACTIVE");

  const priceMap = new Map<string, { total: number; count: number }>();
  listings?.forEach((l) => {
    if (!l.card_ref_id || l.display_price == null) return;
    const entry = priceMap.get(l.card_ref_id) ?? { total: 0, count: 0 };
    entry.total += l.display_price;
    entry.count += 1;
    priceMap.set(l.card_ref_id, entry);
  });

  return cards.map((c) => {
    const priceEntry = priceMap.get(c.card_key);
    return {
      card_key: c.card_key,
      name: c.name ?? "Carte inconnue",
      set_name: setMap.get(c.set_id ?? "") ?? "Set inconnu",
      rarity: c.rarity,
      avg_price: priceEntry
        ? Math.round((priceEntry.total / priceEntry.count) * 100) / 100
        : null,
      listing_count: priceEntry?.count ?? 0,
      source: priceEntry ? "Annonces PokeMarket" : "Pas de données",
    };
  });
}

export default function PriceCheckingPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const debounceRef = useCallback(() => {
    let timeout: ReturnType<typeof setTimeout>;
    return (value: string) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setDebouncedQuery(value), 400);
    };
  }, [])();

  const handleChange = (value: string) => {
    setQuery(value);
    debounceRef(value);
  };

  const { data: results, isLoading } = useQuery({
    queryKey: ["price-checking", debouncedQuery],
    queryFn: () => searchPrices(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  const showEmpty = !isLoading && debouncedQuery.length < 2;
  const showNoResults =
    !isLoading && debouncedQuery.length >= 2 && results?.length === 0;

  return (
    <main className="bg-background flex min-h-svh flex-col">
      <header className="bg-background/80 sticky top-0 z-10 border-b px-4 py-4 backdrop-blur-lg">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary size-5" />
            <h1 className="font-display text-lg font-semibold">
              Référentiel de Prix
            </h1>
          </div>

          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              placeholder="Rechercher une carte (ex: Dracaufeu, Pikachu)…"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              className="h-11 pr-8 pl-10 text-base"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setDebouncedQuery("");
                }}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        {showEmpty && (
          <EmptyState
            icon={<TrendingUp className="size-8" />}
            title="Recherchez une carte pour connaître sa cote"
            description="Tapez le nom d'une carte Pokémon pour voir son prix moyen sur PokeMarket."
          />
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border p-4"
              >
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        )}

        {showNoResults && (
          <EmptyState
            icon={<Search className="size-8" />}
            title="Aucune carte trouvée"
            description={`Aucun résultat pour "${debouncedQuery}". Essayez un autre nom.`}
          />
        )}

        <AnimatePresence mode="popLayout">
          {results && results.length > 0 && (
            <m.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {results.map((card, i) => (
                <m.li
                  key={card.card_key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                  className="bg-card hover:bg-accent/50 flex items-center gap-3 rounded-xl border p-4 transition-colors"
                >
                  <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <TrendingUp className="text-primary size-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {card.name}
                    </p>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span className="truncate">{card.set_name}</span>
                      {card.rarity && (
                        <>
                          <span>·</span>
                          <span className="shrink-0">{card.rarity}</span>
                        </>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      {card.source}
                      {card.listing_count > 0 &&
                        ` (${card.listing_count} annonce${card.listing_count > 1 ? "s" : ""})`}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {card.avg_price != null ? (
                      <Badge variant="secondary" className="text-sm font-bold">
                        {card.avg_price.toFixed(2)} €
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    )}
                  </div>
                </m.li>
              ))}
            </m.ul>
          )}
        </AnimatePresence>

        {isLoading && debouncedQuery.length >= 2 && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
            <span className="text-muted-foreground text-sm">Recherche…</span>
          </div>
        )}
      </div>
    </main>
  );
}
