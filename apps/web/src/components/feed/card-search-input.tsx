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
import { AlertCircle, ImageIcon, Search, X } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import type { CardSearchResponse, CardSearchResult } from "@pokemarket/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type CardSuggestion = CardSearchResult;

type CardSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onSubmit: (value: string) => void;
  onSelectCard: (card: CardSuggestion) => void;
  placeholder?: string;
  selectFirstOnSubmit?: boolean;
  noResultsHint?: string;
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

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
  const { name } = parseQuery(query);
  if (name.length < MIN_QUERY_LENGTH) return [];

  const params = new URLSearchParams({ q: query });
  const response = await fetch(`/api/cards/search?${params}`);
  if (!response.ok) {
    throw new Error("La recherche de cartes est indisponible.");
  }

  const data: CardSearchResponse = await response.json();
  return data.results;
}

export function CardSearchInput({
  value,
  onChange,
  onClear,
  onSubmit,
  onSelectCard,
  placeholder = "Carte, série ou bloc (ex: Dracaufeu 11/25)…",
  selectFirstOnSubmit = false,
  noResultsHint = "Appuyez sur Entrée pour rechercher dans les annonces.",
}: CardSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLFormElement>(null);
  const listboxId = "card-search-suggestions";
  const debouncedValue = useDebounce(value, DEBOUNCE_MS);
  const trimmed = debouncedValue.trim();
  const parsedName = parseQuery(trimmed).name;
  const enabled = open && parsedName.length >= MIN_QUERY_LENGTH;

  const {
    data: suggestions,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.cardMarket.search(trimmed),
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
    if (selectFirstOnSubmit && list[0]) {
      handleSelect(list[0]);
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
        aria-label="Rechercher une carte Pokémon"
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
              isError={isError}
              activeIndex={safeActiveIndex}
              query={parsedName || trimmed}
              noResultsHint={noResultsHint}
              onRetry={() => void refetch()}
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
  isError: boolean;
  activeIndex: number;
  query: string;
  noResultsHint: string;
  onRetry: () => void;
  onSelect: (card: CardSuggestion) => void;
  onHover: (idx: number) => void;
};

function SuggestionList({
  listboxId,
  suggestions,
  isFetching,
  isError,
  activeIndex,
  query,
  noResultsHint,
  onRetry,
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

  if (isError) {
    return (
      <div
        className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-6 text-center text-sm"
        role="alert"
      >
        <AlertCircle className="text-destructive size-5" />
        <p>Impossible de rechercher les cartes pour le moment.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
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
        <p className="text-muted-foreground/80 text-xs">{noResultsHint}</p>
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
                    placeholder="blur"
                    blurDataURL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
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
