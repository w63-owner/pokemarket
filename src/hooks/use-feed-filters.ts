"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { FeedFilters } from "@/lib/query-keys";
import {
  CONDITION_LABELS,
  RARITY_OPTIONS,
  type CardCondition,
} from "@/lib/constants";

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

export function useFiltersFromUrl(): FeedFilters {
  const searchParams = useSearchParams();

  return useMemo((): FeedFilters => {
    const filters: FeedFilters = {};

    const q = searchParams.get("q");
    if (q) filters.q = q;

    const set = searchParams.get("set");
    if (set) filters.set = set;

    const rarity = searchParams.get("rarity");
    if (rarity) filters.rarity = rarity;

    const condition = searchParams.get("condition");
    if (condition) filters.condition = condition;

    if (searchParams.get("is_graded") === "true") {
      filters.is_graded = true;
      filters.grade_min = parseNumber(searchParams.get("grade_min"));
      filters.grade_max = parseNumber(searchParams.get("grade_max"));
    }

    filters.price_min = parseNumber(searchParams.get("price_min"));
    filters.price_max = parseNumber(searchParams.get("price_max"));

    const card_number = searchParams.get("card_number");
    if (card_number) filters.card_number = card_number;

    const series = searchParams.get("series");
    if (series) filters.series = series;

    const sort = searchParams.get("sort");
    if (sort) filters.sort = sort;

    return filters;
  }, [searchParams]);
}

/**
 * Reads the current URL directly (window.location) to avoid stale closures
 * when multiple filters change in rapid succession.
 */
export function useUpdateFilters() {
  const router = useRouter();
  const pathname = usePathname();

  const updateFilters = useCallback(
    (updates: Partial<FeedFilters>) => {
      const params = new URLSearchParams(window.location.search);

      for (const [key, value] of Object.entries(updates)) {
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          value === false
        ) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }

      if (params.get("is_graded") !== "true") {
        params.delete("grade_min");
        params.delete("grade_max");
      }

      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const resetFilters = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  return { updateFilters, resetFilters };
}

export function countActiveFilters(filters: FeedFilters): number {
  let count = 0;
  if (filters.q) count++;
  if (filters.set) count++;
  if (filters.rarity) count++;
  if (filters.condition) count++;
  if (filters.is_graded) count++;
  if (filters.price_min !== undefined) count++;
  if (filters.price_max !== undefined) count++;
  if (filters.card_number) count++;
  if (filters.series) count++;
  return count;
}

export function filtersToSearchString(filters: FeedFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      value !== false
    ) {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

const rarityLabelMap = Object.fromEntries(
  RARITY_OPTIONS.map((r) => [r.value, r.label]),
);

/**
 * Human-readable summary of active filters, e.g. "Pikachu, Rare, 5–50 €"
 */
export function filtersToLabel(filters: FeedFilters): string {
  const parts: string[] = [];

  if (filters.q) parts.push(`"${filters.q}"`);
  if (filters.series) parts.push(filters.series);
  if (filters.set) parts.push(filters.set);
  if (filters.card_number) parts.push(`#${filters.card_number}`);
  if (filters.rarity) {
    parts.push(rarityLabelMap[filters.rarity] ?? filters.rarity);
  }
  if (filters.condition) {
    parts.push(
      CONDITION_LABELS[filters.condition as CardCondition] ?? filters.condition,
    );
  }
  if (filters.is_graded) {
    const g = [filters.grade_min, filters.grade_max].filter(Boolean);
    parts.push(g.length ? `Gradée ${g.join("–")}` : "Gradée");
  }
  if (filters.price_min !== undefined || filters.price_max !== undefined) {
    const min = filters.price_min ?? 0;
    const max = filters.price_max;
    parts.push(max !== undefined ? `${min}–${max} €` : `≥ ${min} €`);
  }

  return parts.join(", ") || "Tous les résultats";
}

/**
 * Suggest a short default name from filters (for the save dialog pre-fill).
 */
export function suggestSearchName(filters: FeedFilters): string {
  const parts: string[] = [];
  if (filters.q) parts.push(filters.q);
  if (filters.set) parts.push(filters.set);
  if (filters.rarity) {
    parts.push(rarityLabelMap[filters.rarity] ?? filters.rarity);
  }
  return parts.join(" ") || "Ma recherche";
}
