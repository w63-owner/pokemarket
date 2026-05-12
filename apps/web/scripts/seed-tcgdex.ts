import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const LANGUAGES = ["fr", "en", "ja"];
const DB_BATCH_SIZE = 500;
const FETCH_CONCURRENCY = 10;
const DELAY_BETWEEN_BATCHES_MS = 500;

function baseUrl(lang: string) {
  return `https://api.tcgdex.net/v2/${lang}`;
}

// ─── Helpers ───────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string, retries = 4): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = attempt * 3000;
        console.warn(`  ⚠ Rate-limited on ${url}, waiting ${wait}ms…`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt === retries)
        throw new Error(`Failed after ${retries} attempts: ${url} — ${err}`);
      const wait = attempt * 3000;
      console.warn(
        `  ⚠ Attempt ${attempt} failed for ${url}, retrying in ${wait}ms…`,
      );
      await sleep(wait);
    }
  }
  throw new Error("Unreachable");
}

async function runConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
  delayMs: number,
  label: string,
): Promise<R[]> {
  const results: R[] = [];
  let completed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(fn));

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }

    completed += batch.length;
    const pct = Math.round((completed / items.length) * 100);
    process.stdout.write(
      `\r  ${label}: ${pct}% (${completed}/${items.length})`,
    );

    if (i + concurrency < items.length) await sleep(delayMs);
  }

  process.stdout.write("\n");
  return results;
}

// ─── TCGdex API types ──────────────────────────────────────

interface SeriesItem {
  id: string;
  name: string;
}

interface SetListItem {
  id: string;
  name: string;
  logo?: string;
}

interface SetDetail {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  releaseDate?: string;
  tcgOnline?: string;
  cardCount?: {
    total?: number;
    official?: number;
    reverse?: number;
    holo?: number;
    firstEd?: number;
    normal?: number;
  };
  serie?: { id: string; name: string };
  legal?: { standard?: boolean; expanded?: boolean };
  abbreviation?: { official?: string; localized?: string };
  cards?: Array<{ id: string; localId: string; name: string; image?: string }>;
}

interface CardListItem {
  id: string;
  localId: string;
  name: string;
}

interface CardDetail {
  id: string;
  localId?: string;
  name?: string;
  category?: string;
  illustrator?: string;
  image?: string;
  rarity?: string;
  hp?: number | string;

  set?: {
    id: string;
    name?: string;
    logo?: string;
    symbol?: string;
    cardCount?: { official?: number; total?: number };
  };

  variants?: Record<string, boolean>;
  variants_detailed?: Array<{ type: string; size: string }>;

  // Pokemon-specific
  types?: string[];
  evolveFrom?: string;
  description?: string;
  stage?: string;
  attacks?: Array<{
    cost?: string[];
    name: string;
    effect?: string;
    damage?: string | number;
  }>;
  weaknesses?: Array<{ type: string; value: string }>;
  retreat?: number;
  regulationMark?: string;
  dexId?: number[];
  level?: string;
  suffix?: string;
  item?: { name: string; effect: string };

  // Trainer-specific
  effect?: string;
  trainerType?: string;

  // Energy-specific
  energyType?: string;

  // Meta
  legal?: { standard?: boolean; expanded?: boolean };
  pricing?: Record<string, unknown> | null;
  updated?: string;
}

// ─── Step 1: Series ────────────────────────────────────────

async function seedSeries(lang: string) {
  console.log("\n━━━ Step 1/3: Seeding series ━━━");
  const url = baseUrl(lang);
  const series = await fetchJson<SeriesItem[]>(`${url}/series`);
  console.log(`  Fetched ${series.length} series`);

  const rows = series.map((s) => ({
    language: lang,
    id: s.id,
    name: s.name,
  }));

  const { error } = await supabase
    .from("tcgdex_series")
    .upsert(rows, { onConflict: "language,id" });

  if (error) throw new Error(`Series upsert failed: ${error.message}`);
  console.log(`  ✓ ${rows.length} series inserted`);
}

// ─── Step 2: Sets ──────────────────────────────────────────

async function seedSets(lang: string): Promise<SetDetail[]> {
  console.log("\n━━━ Step 2/3: Seeding sets ━━━");
  const url = baseUrl(lang);
  const setList = await fetchJson<SetListItem[]>(`${url}/sets`);
  console.log(`  Fetched ${setList.length} sets from list`);

  const setDetails = await runConcurrent(
    setList,
    (s) => fetchJson<SetDetail>(`${url}/sets/${encodeURIComponent(s.id)}`),
    FETCH_CONCURRENCY,
    DELAY_BETWEEN_BATCHES_MS,
    "Fetching set details",
  );

  const deduped = new Map<string, (typeof setDetails)[0]>();
  for (const s of setDetails) deduped.set(s.id, s);

  const rows = [...deduped.values()].map((s) => ({
    language: lang,
    id: s.id,
    name: s.name,
    series_id: s.serie?.id ?? null,
    logo: s.logo ?? null,
    release_date: s.releaseDate ?? null,
    symbol: s.symbol ?? null,
    card_count: s.cardCount ?? null,
    legal: s.legal ?? null,
    tcg_online_code: s.tcgOnline ?? null,
  }));

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE);
    const { error } = await supabase
      .from("tcgdex_sets")
      .upsert(batch, { onConflict: "language,id" });
    if (error) throw new Error(`Sets upsert failed: ${error.message}`);
  }

  console.log(`  ✓ ${rows.length} sets inserted`);
  return setDetails;
}

// ─── Step 3: Cards ─────────────────────────────────────────

function extractSetId(cardId: string, localId: string): string {
  return cardId.slice(0, -(localId.length + 1));
}

function parseHp(raw: number | string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isNaN(n) ? null : n;
}

async function seedCards(lang: string, setDetails: SetDetail[]) {
  console.log("\n━━━ Step 3/3: Seeding cards ━━━");
  const url = baseUrl(lang);

  const cardMap = new Map<string, CardListItem>();
  for (const set of setDetails) {
    if (set.cards) {
      for (const c of set.cards) {
        cardMap.set(c.id, { id: c.id, localId: c.localId, name: c.name });
      }
    }
  }
  const allCardRefs = [...cardMap.values()];
  console.log(
    `  Collected ${allCardRefs.length} card refs from ${setDetails.length} sets`,
  );

  let fetchErrors = 0;
  const cardDetails = await runConcurrent(
    allCardRefs,
    async (ref) => {
      try {
        return await fetchJson<CardDetail>(
          `${url}/cards/${encodeURIComponent(ref.id)}`,
        );
      } catch {
        fetchErrors++;
        return null;
      }
    },
    FETCH_CONCURRENCY,
    DELAY_BETWEEN_BATCHES_MS,
    "Fetching card details",
  );

  console.log(`  Fetch complete — ${fetchErrors} errors`);

  const rows = allCardRefs.map((ref, i) => {
    const detail = cardDetails[i];

    if (detail) {
      return {
        language: lang,
        id: detail.id,
        name: detail.name ?? ref.name ?? null,
        set_id: detail.set?.id ?? extractSetId(ref.id, ref.localId),
        local_id: detail.localId ?? ref.localId,
        category: detail.category ?? null,
        illustrator: detail.illustrator ?? null,
        image: detail.image ?? null,
        hp: parseHp(detail.hp),
        rarity: detail.rarity ?? null,
        variants: detail.variants ?? null,
        types: detail.types ?? null,
        evolve_from: detail.evolveFrom ?? null,
        description: detail.description ?? null,
        stage: detail.stage ?? null,
        attacks: detail.attacks ?? null,
        weaknesses: detail.weaknesses ?? null,
        retreat: detail.retreat ?? null,
        regulation_mark: detail.regulationMark ?? null,
        legal: detail.legal ?? null,
        dex_id: detail.dexId ?? null,
        level: detail.level ?? null,
        suffix: detail.suffix ?? null,
        item: detail.item ?? null,
        effect: detail.effect ?? null,
        trainer_type: detail.trainerType ?? null,
        energy_type: detail.energyType ?? null,
        pricing: detail.pricing ?? null,
        updated_at: detail.updated ?? null,
      };
    }

    return {
      language: lang,
      id: ref.id,
      name: ref.name ?? null,
      set_id: extractSetId(ref.id, ref.localId),
      local_id: ref.localId,
      category: null,
      illustrator: null,
      image: null,
      hp: null,
      rarity: null,
      variants: null,
      types: null,
      evolve_from: null,
      description: null,
      stage: null,
      attacks: null,
      weaknesses: null,
      retreat: null,
      regulation_mark: null,
      legal: null,
      dex_id: null,
      level: null,
      suffix: null,
      item: null,
      effect: null,
      trainer_type: null,
      energy_type: null,
      pricing: null,
      updated_at: null,
    };
  });

  console.log(
    `  Inserting ${rows.length} cards in batches of ${DB_BATCH_SIZE}…`,
  );
  let inserted = 0;

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE);
    const { error } = await supabase
      .from("tcgdex_cards")
      .upsert(batch, { onConflict: "language,id" });
    if (error)
      throw new Error(
        `Cards upsert batch failed at offset ${i}: ${error.message}`,
      );
    inserted += batch.length;
    const pct = Math.round((inserted / rows.length) * 100);
    console.log(`  DB insert: ${pct}% (${inserted}/${rows.length})`);
  }

  console.log(`  ✓ ${rows.length} cards inserted`);
}

// ─── Main ──────────────────────────────────────────────────

async function seedLanguage(lang: string) {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║   Seeding language: ${lang.toUpperCase().padEnd(18)}║`);
  console.log(`╚═══════════════════════════════════════╝`);

  const langStart = Date.now();
  await seedSeries(lang);
  const setDetails = await seedSets(lang);
  await seedCards(lang, setDetails);
  const elapsed = ((Date.now() - langStart) / 1000).toFixed(1);
  console.log(`\n  ✓ ${lang.toUpperCase()} done in ${elapsed}s`);
}

async function main() {
  const langs = process.argv.length > 2 ? process.argv.slice(2) : LANGUAGES;

  console.log("╔═══════════════════════════════════════╗");
  console.log("║   TCGdex Catalog Seeder               ║");
  console.log("╚═══════════════════════════════════════╝");
  console.log(`  Supabase: ${supabaseUrl}`);
  console.log(`  Languages: ${langs.join(", ")}`);
  console.log(
    `  Concurrency: ${FETCH_CONCURRENCY} | DB batch: ${DB_BATCH_SIZE}`,
  );

  const start = Date.now();

  try {
    for (const lang of langs) {
      await seedLanguage(lang);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `\n✓ All seeding complete in ${elapsed}s (${langs.join(", ")})`,
    );
  } catch (err) {
    console.error("\n✗ Seeding failed:", err);
    process.exit(1);
  }
}

main();
