// Lazy Intl initialization.
//
// `new Intl.RelativeTimeFormat(...)` (and to a lesser extent
// `new Intl.NumberFormat(...)`) used to be evaluated at module top-level.
// That breaks on Hermes Android, where `Intl.RelativeTimeFormat` is
// `undefined` unless the host explicitly opts into full ICU support at
// build time. `new undefined(...)` throws
// `TypeError: Cannot read property 'prototype' of undefined` while the
// shared package's index is still being evaluated, which silently
// short-circuits every consumer (validations, query keys, types) and
// produces "Unmatched Route" / undefined import symptoms downstream.
//
// We now create the formatters on first use and gracefully fall back to
// `toLocaleDateString` when the API is missing so the package is safe
// to import on every JS runtime we target (Node, V8, Hermes).

let eurFormatter: Intl.NumberFormat | null = null;

function getEurFormatter(): Intl.NumberFormat | null {
  if (eurFormatter) return eurFormatter;
  if (typeof Intl !== "undefined" && typeof Intl.NumberFormat === "function") {
    eurFormatter = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    });
    return eurFormatter;
  }
  return null;
}

export function formatPrice(amount: number): string {
  const f = getEurFormatter();
  if (f) return f.format(amount);
  return `${amount.toFixed(2)} €`;
}

let relativeFormatter: Intl.RelativeTimeFormat | null = null;
let relativeFormatterUnavailable = false;

function getRelativeFormatter(): Intl.RelativeTimeFormat | null {
  if (relativeFormatter) return relativeFormatter;
  if (relativeFormatterUnavailable) return null;
  if (
    typeof Intl !== "undefined" &&
    typeof (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat ===
      "function"
  ) {
    relativeFormatter = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
    return relativeFormatter;
  }
  relativeFormatterUnavailable = true;
  return null;
}

export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const formatter = getRelativeFormatter();

  if (formatter) {
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHr = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHr / 24);

    if (Math.abs(diffSec) < 60) return formatter.format(diffSec, "second");
    if (Math.abs(diffMin) < 60) return formatter.format(diffMin, "minute");
    if (Math.abs(diffHr) < 24) return formatter.format(diffHr, "hour");
    if (Math.abs(diffDay) < 30) return formatter.format(diffDay, "day");
  }

  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
