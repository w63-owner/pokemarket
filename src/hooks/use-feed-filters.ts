"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { FeedFilters } from "@/lib/query-keys";

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
