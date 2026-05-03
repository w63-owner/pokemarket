"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Search, X } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type CardSuggestion = {
  card_key: string;
  name: string;
  set_id: string | null;
  set_name: string | null;
  series_id: string | null;
  series_name: string | null;
  local_id: string | null;
  set_official_count: number | null;
  language: string;
  image_url: string | null;
};

type CardSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onSubmit: (value: string) => void;
  onSelectCard: (card: CardSuggestion) => void;
  placeholder?: string;
};

const MIN_QUERY_LENGTH = 2;
const PREFERRED_LANGUAGE = "fr";
const DEBOUNCE_MS = 250;

function buildTcgdexImageUrl(
  setId: string | null,
  seriesId: string | null,
  localId: string | null,
  language: string,
): string | null {
  if (!setId || !seriesId || !localId) return null;
  return `https://assets.tcgdex.net/${language}/${seriesId}/${setId}/${localId}/low.webp`;
}

/**
 * Parses a free-form search like "Dracaufeu 11/25" into a name part and
 * an optional card number. The number is detected as a trailing token of
 * the form "<num>" or "<num>/<num>".
 */
function parseQuery(raw: string): { name: string; localId?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { name: "" };
  const match = trimmed.match(/^(.*?)\s+(\d+)(?:\s*\/\s*\d+)?\s*$/);
  if (match && match[1].trim().length >= MIN_QUERY_LENGTH) {
    return { name: match[1].trim(), localId: match[2] };
  }
  return { name: trimmed };
}

async function fetchCardSuggestions(query: string): Promise<CardSuggestion[]> {
  const { name, localId } = parseQuery(query);
  if (name.length < MIN_QUERY_LENGTH) return [];

  const supabase = createClient();
  const { data, error } = await supabase.rpc("match_tcgdex_cards", {
    p_name: name,
    p_language: PREFERRED_LANGUAGE,
    ...(localId ? { p_local_id: localId } : {}),
  });

  if (error) {
    console.error("match_tcgdex_cards error:", error);
    return [];
  }
  if (!data) return [];

  const seen = new Set<string>();
  const results: CardSuggestion[] = [];
  for (const row of data) {
    if (!row.card_key || seen.has(row.card_key)) continue;
    seen.add(row.card_key);
    results.push({
      card_key: row.card_key,
      name: row.card_name ?? "Carte inconnue",
      set_id: row.card_set_id ?? null,
      set_name: row.set_name ?? null,
      series_id: row.series_id ?? null,
      series_name: row.series_name ?? null,
      local_id: row.card_local_id ?? null,
      set_official_count: row.set_official_count ?? null,
      language: row.card_language ?? PREFERRED_LANGUAGE,
      image_url: buildTcgdexImageUrl(
        row.card_set_id ?? null,
        row.series_id ?? null,
        row.card_local_id ?? null,
        row.card_language ?? PREFERRED_LANGUAGE,
      ),
    });
  }
  return results;
}

export function CardSearchInput({
  value,
  onChange,
  onClear,
  onSubmit,
  onSelectCard,
  placeholder = "Carte, série ou bloc (ex: Dracaufeu 11/25)…",
}: CardSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLFormElement>(null);
  const listboxId = "card-search-suggestions";
  const debouncedValue = useDebounce(value, DEBOUNCE_MS);
  const trimmed = debouncedValue.trim();
  const parsedName = parseQuery(trimmed).name;
  const enabled = open && parsedName.length >= MIN_QUERY_LENGTH;

  const { data: suggestions, isFetching } = useQuery({
    queryKey: queryKeys.tcgdex.cards(trimmed),
    queryFn: () => fetchCardSuggestions(trimmed),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  const list = suggestions ?? [];
  // Clamp the highlighted index so a stale value never points past the list
  // when results shrink between renders.
  const safeActiveIndex = activeIndex >= list.length ? -1 : activeIndex;
  const showPanel =
    open && (parsedName.length >= MIN_QUERY_LENGTH || isFetching);

  const handleSelect = (card: CardSuggestion) => {
    onSelectCard(card);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (open && safeActiveIndex >= 0 && list[safeActiveIndex]) {
      handleSelect(list[safeActiveIndex]);
      return;
    }
    onSubmit(value);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (!showPanel) {
        setOpen(true);
        return;
      }
      if (list.length === 0) return;
      e.preventDefault();
      setActiveIndex((idx) => {
        const start = idx >= list.length ? -1 : idx;
        return (start + 1) % list.length;
      });
    } else if (e.key === "ArrowUp") {
      if (!showPanel || list.length === 0) return;
      e.preventDefault();
      setActiveIndex((idx) => {
        const start = idx >= list.length ? -1 : idx;
        return start <= 0 ? list.length - 1 : start - 1;
      });
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  return (
    <form
      ref={containerRef}
      onSubmit={handleSubmit}
      className="relative flex-1"
      role="search"
    >
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 z-10 h-4 w-4 -translate-y-1/2" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          safeActiveIndex >= 0 && list[safeActiveIndex]
            ? `${listboxId}-${list[safeActiveIndex].card_key}`
            : undefined
        }
        className="pr-8 pl-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onClear();
            setOpen(false);
            setActiveIndex(-1);
          }}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 z-10 -translate-y-1/2 rounded-sm transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Effacer la recherche</span>
        </button>
      )}

      <AnimatePresence>
        {showPanel && (
          <m.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="bg-popover text-popover-foreground ring-foreground/10 absolute top-full right-0 left-0 z-50 mt-1.5 max-h-[60vh] overflow-y-auto rounded-lg shadow-lg ring-1"
          >
            <SuggestionList
              listboxId={listboxId}
              suggestions={list}
              isFetching={isFetching}
              activeIndex={safeActiveIndex}
              query={parsedName || trimmed}
              onHover={setActiveIndex}
              onSelect={handleSelect}
            />
          </m.div>
        )}
      </AnimatePresence>
    </form>
  );
}

type SuggestionListProps = {
  listboxId: string;
  suggestions: CardSuggestion[];
  isFetching: boolean;
  activeIndex: number;
  query: string;
  onSelect: (card: CardSuggestion) => void;
  onHover: (idx: number) => void;
};

function SuggestionList({
  listboxId,
  suggestions,
  isFetching,
  activeIndex,
  query,
  onSelect,
  onHover,
}: SuggestionListProps) {
  if (isFetching && suggestions.length === 0) {
    return (
      <div className="space-y-0.5 p-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-1.5">
            <Skeleton className="h-12 w-9 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-3/4" />
            </div>
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (suggestions.length === 0 && query.length >= MIN_QUERY_LENGTH) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-1 px-4 py-6 text-center text-sm">
        <Search className="size-5 opacity-50" />
        <p>
          Aucune carte trouvée pour&nbsp;
          <span className="text-foreground font-medium">« {query} »</span>
        </p>
        <p className="text-muted-foreground/80 text-xs">
          Appuyez sur Entrée pour rechercher dans les annonces.
        </p>
      </div>
    );
  }

  return (
    <ul id={listboxId} role="listbox" className="py-1">
      {suggestions.map((card, idx) => {
        const isActive = idx === activeIndex;
        const number =
          card.local_id && card.set_official_count
            ? `${card.local_id}/${card.set_official_count}`
            : card.local_id;
        const subtitle =
          [card.series_name, card.set_name].filter(Boolean).join(" · ") ||
          "Bloc inconnu";
        return (
          <li
            key={card.card_key}
            id={`${listboxId}-${card.card_key}`}
            role="option"
            aria-selected={isActive}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(card);
              }}
              onMouseEnter={() => onHover(idx)}
              className={cn(
                "hover:bg-accent flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                isActive && "bg-accent",
              )}
            >
              <div className="bg-muted relative h-12 w-9 shrink-0 overflow-hidden rounded-md">
                {card.image_url ? (
                  <Image
                    src={card.image_url}
                    alt={card.name}
                    fill
                    sizes="36px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                    <ImageIcon className="size-4 opacity-50" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{card.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {subtitle}
                </p>
              </div>
              {number && (
                <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px]">
                  {number}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
