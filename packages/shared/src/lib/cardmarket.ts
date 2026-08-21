export type CardmarketVariant = "normal" | "holo";

export type CardmarketVariantQuote = {
  variant: CardmarketVariant;
  current: number | null;
  trend: number | null;
  average: number | null;
  average30: number | null;
};

export type TcgdexCardmarketPricing = {
  source: "cardmarket";
  currency: string;
  updatedAt: string | null;
  normal: CardmarketVariantQuote;
  holo: CardmarketVariantQuote;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;
}

function positivePrice(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function parseUpdatedAt(value: unknown): string | null {
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function parseVariant(
  cardmarket: UnknownRecord,
  variant: CardmarketVariant,
): CardmarketVariantQuote {
  const suffix = variant === "holo" ? "-holo" : "";
  const trend = positivePrice(cardmarket[`trend${suffix}`]);
  const average = positivePrice(cardmarket[`avg${suffix}`]);
  const average30 = positivePrice(cardmarket[`avg30${suffix}`]);

  return {
    variant,
    current: trend ?? average ?? average30,
    trend,
    average,
    average30,
  };
}

/**
 * Parses the current TCGdex Cardmarket payload.
 *
 * TCGdex exposes Cardmarket fields directly under `pricing.cardmarket`.
 * Zero values are treated as unavailable because TCGdex uses them for
 * variants without a market observation.
 */
export function parseTcgdexCardmarketPricing(
  pricing: unknown,
): TcgdexCardmarketPricing | null {
  const cardmarket = asRecord(asRecord(pricing)?.cardmarket);
  if (!cardmarket) return null;

  const unit = cardmarket.unit;

  return {
    source: "cardmarket",
    currency:
      typeof unit === "string" && /^[A-Z]{3}$/i.test(unit)
        ? unit.toUpperCase()
        : "EUR",
    updatedAt: parseUpdatedAt(cardmarket.updated),
    normal: parseVariant(cardmarket, "normal"),
    holo: parseVariant(cardmarket, "holo"),
  };
}

export function buildTcgdexCardImageUrl(
  language: string,
  seriesId: string | null,
  setId: string | null,
  localId: string | null,
  quality: "low" | "high" = "low",
): string | null {
  if (!language || !seriesId || !setId || !localId) return null;

  return `https://assets.tcgdex.net/${language}/${seriesId}/${setId}/${localId}/${quality}.webp`;
}
