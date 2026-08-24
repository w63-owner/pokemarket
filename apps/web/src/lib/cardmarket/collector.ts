import "server-only";

import {
  parseTcgdexCardmarketPricing,
  type CardmarketVariant,
} from "@deckdealr/shared";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

const SOURCE = "CARDMARKET_TCGDEX";
const LANGUAGE = "fr";
const DEFAULT_BATCH_SIZE = 150;
const FETCH_CONCURRENCY = 10;
const FETCH_RETRIES = 3;

type CatalogCard = {
  card_key: string;
  id: Database["public"]["Tables"]["tcgdex_cards"]["Row"]["id"];
};

type TcgdexCardDetail = {
  id?: string;
  pricing?: unknown;
  updated?: string;
};

export type CardPriceSnapshot = {
  card_key: string;
  condition: "UNSPECIFIED";
  currency: string;
  is_graded: false;
  language: "fr";
  price: number;
  recorded_at: string;
  snapshot_date: string;
  source: typeof SOURCE;
  variant: CardmarketVariant;
};

export type CollectionMetrics = {
  batch_size: number;
  completed: boolean;
  coverage_percent: number;
  failed: number;
  next_cursor: string | null;
  priced: number;
  processed: number;
  snapshot_date: string;
  total: number;
};

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchTcgdexCard(
  cardId: string,
  retries = FETCH_RETRIES,
): Promise<TcgdexCardDetail> {
  const url = `https://api.tcgdex.net/v2/${LANGUAGE}/cards/${encodeURIComponent(cardId)}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`TCGdex ${response.status} for ${cardId}`);
      }

      return (await response.json()) as TcgdexCardDetail;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }

  throw new Error(`Unable to fetch ${cardId}`);
}

export function snapshotsFromCardDetail(
  cardKey: string,
  detail: TcgdexCardDetail,
  now: Date,
): CardPriceSnapshot[] {
  const pricing = parseTcgdexCardmarketPricing(detail.pricing);
  if (!pricing) return [];

  const recordedAt = now.toISOString();
  const snapshotDate = utcDate(now);

  return (["normal", "holo"] as const).flatMap((variant) => {
    const price = pricing[variant].current;
    if (price == null) return [];

    return [
      {
        card_key: cardKey,
        condition: "UNSPECIFIED" as const,
        currency: pricing.currency,
        is_graded: false as const,
        language: LANGUAGE,
        price,
        recorded_at: recordedAt,
        snapshot_date: snapshotDate,
        source: SOURCE,
        variant,
      },
    ];
  });
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];

  for (let index = 0; index < items.length; index += concurrency) {
    const group = items.slice(index, index + concurrency);
    results.push(...(await Promise.allSettled(group.map(callback))));
  }

  return results;
}

export async function collectCardmarketPriceBatch({
  batchSize = DEFAULT_BATCH_SIZE,
  now = new Date(),
}: {
  batchSize?: number;
  now?: Date;
} = {}): Promise<CollectionMetrics> {
  const admin = createAdminClient();
  const snapshotDate = utcDate(now);

  const { data: existingRun, error: runError } = await admin
    .from("card_price_collection_runs")
    .select("*")
    .eq("source", SOURCE)
    .eq("language", LANGUAGE)
    .eq("snapshot_date", snapshotDate)
    .maybeSingle();

  if (runError) throw runError;
  let run = existingRun;

  if (!run) {
    const { count, error: countError } = await admin
      .from("tcgdex_cards")
      .select("*", { count: "exact", head: true })
      .eq("language", LANGUAGE);
    if (countError) throw countError;

    const { data: createdRun, error: createError } = await admin
      .from("card_price_collection_runs")
      .insert({
        source: SOURCE,
        language: LANGUAGE,
        snapshot_date: snapshotDate,
        total_cards: count ?? 0,
      })
      .select("*")
      .single();
    if (createError) throw createError;
    run = createdRun;
  }

  let cardsQuery = admin
    .from("tcgdex_cards")
    .select("card_key,id")
    .eq("language", LANGUAGE)
    .order("card_key", { ascending: true })
    .limit(batchSize);

  if (run.cursor_card_key) {
    cardsQuery = cardsQuery.gt("card_key", run.cursor_card_key);
  }

  const { data: cardsData, error: cardsError } = await cardsQuery;
  if (cardsError) throw cardsError;

  const cards = (cardsData ?? []).filter(
    (card): card is CatalogCard => typeof card.card_key === "string",
  );

  if (cards.length === 0) {
    const { error: completeError } = await admin
      .from("card_price_collection_runs")
      .update({
        status: "completed",
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", run.id);
    if (completeError) throw completeError;

    return {
      batch_size: 0,
      completed: true,
      coverage_percent: run.total_cards === 0 ? 100 : 100,
      failed: run.failed_cards,
      next_cursor: null,
      priced: run.priced_cards,
      processed: run.processed_cards,
      snapshot_date: snapshotDate,
      total: run.total_cards,
    };
  }

  const settled = await mapConcurrent(
    cards,
    FETCH_CONCURRENCY,
    async (card) => {
      const detail = await fetchTcgdexCard(card.id);
      return { card, detail };
    },
  );

  const cardUpdates: Array<{
    id: string;
    language: string;
    pricing: Database["public"]["Tables"]["tcgdex_cards"]["Insert"]["pricing"];
    updated_at: string;
  }> = [];
  const snapshots: CardPriceSnapshot[] = [];
  const failures: string[] = [];
  let pricedCards = 0;

  settled.forEach((result, index) => {
    const card = cards[index];
    if (result.status === "rejected") {
      failures.push(`${card.card_key}: ${errorMessage(result.reason)}`);
      return;
    }

    const { detail } = result.value;
    cardUpdates.push({
      id: card.id,
      language: LANGUAGE,
      pricing:
        (detail.pricing as
          | Database["public"]["Tables"]["tcgdex_cards"]["Insert"]["pricing"]
          | undefined) ?? null,
      updated_at: detail.updated ?? now.toISOString(),
    });

    const cardSnapshots = snapshotsFromCardDetail(card.card_key, detail, now);
    if (cardSnapshots.length > 0) pricedCards++;
    snapshots.push(...cardSnapshots);
  });

  if (cardUpdates.length > 0) {
    const { error: updateCardsError } = await admin
      .from("tcgdex_cards")
      .upsert(cardUpdates, { onConflict: "language,id" });
    if (updateCardsError) throw updateCardsError;
  }

  if (snapshots.length > 0) {
    const { error: snapshotsError } = await admin
      .from("card_price_history")
      .upsert(snapshots, {
        onConflict: "card_key,variant,source,snapshot_date",
      });
    if (snapshotsError) throw snapshotsError;
  }

  const processed = run.processed_cards + cards.length;
  const priced = run.priced_cards + pricedCards;
  const failed = run.failed_cards + failures.length;
  const completed = cards.length < batchSize;
  const nextCursor = completed ? null : (cards.at(-1)?.card_key ?? null);
  const updatedAt = now.toISOString();

  const { error: updateRunError } = await admin
    .from("card_price_collection_runs")
    .update({
      completed_at: completed ? updatedAt : null,
      cursor_card_key: cards.at(-1)?.card_key ?? run.cursor_card_key,
      failed_cards: failed,
      last_error: failures.at(-1) ?? null,
      priced_cards: priced,
      processed_cards: processed,
      status: completed
        ? "completed"
        : failures.length > 0
          ? "partial"
          : "running",
      updated_at: updatedAt,
    })
    .eq("id", run.id);
  if (updateRunError) throw updateRunError;

  return {
    batch_size: cards.length,
    completed,
    coverage_percent:
      run.total_cards === 0
        ? 100
        : Math.min(
            100,
            Math.round((processed / run.total_cards) * 10_000) / 100,
          ),
    failed,
    next_cursor: nextCursor,
    priced,
    processed,
    snapshot_date: snapshotDate,
    total: run.total_cards,
  };
}
