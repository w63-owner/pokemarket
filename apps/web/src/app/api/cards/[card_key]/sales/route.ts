import * as Sentry from "@sentry/nextjs";
import {
  cardKeySchema,
  type CardmarketVariant,
  type DeckDealrRecentSale,
  type DeckDealrSalesResponse,
} from "@deckdealr/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createPublicClient } from "@/lib/supabase/public";

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";
const MINIMUM_VOLUME = 3;
const CONDITIONS = new Set([
  "MINT",
  "NEAR_MINT",
  "EXCELLENT",
  "GOOD",
  "LIGHT_PLAYED",
  "PLAYED",
  "POOR",
]);

function parseVariant(value: string | null): CardmarketVariant | null {
  return value === "normal" || value === "holo" ? value : null;
}

function parseRecentSales(value: unknown): DeckDealrRecentSale[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];

    const sale = entry as Record<string, unknown>;
    const price = Number(sale.price);
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      typeof sale.sold_at !== "string"
    ) {
      return [];
    }

    return [
      {
        condition: typeof sale.condition === "string" ? sale.condition : null,
        grade_note:
          sale.grade_note == null || !Number.isFinite(Number(sale.grade_note))
            ? null
            : Number(sale.grade_note),
        grading_company:
          typeof sale.grading_company === "string"
            ? sale.grading_company
            : null,
        is_graded: sale.is_graded === true,
        price,
        sold_at: sale.sold_at,
        variant: parseVariant(
          typeof sale.variant === "string" ? sale.variant : null,
        ),
      },
    ];
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_key: string }> },
) {
  const { card_key: rawCardKey } = await params;
  const cardKey = cardKeySchema.safeParse(rawCardKey);
  const rawVariant = request.nextUrl.searchParams.get("variant");
  const variant = parseVariant(rawVariant) ?? "normal";
  const rawCondition = request.nextUrl.searchParams.get("condition");
  const rawIsGraded = request.nextUrl.searchParams.get("isGraded");
  const isGraded = rawIsGraded === "true";
  const condition = isGraded ? null : (rawCondition ?? "NEAR_MINT");
  const gradingCompany = isGraded
    ? request.nextUrl.searchParams.get("gradingCompany")?.toUpperCase() || null
    : null;
  const rawGradeNote = request.nextUrl.searchParams.get("gradeNote");
  const gradeNote =
    isGraded && rawGradeNote !== null ? Number(rawGradeNote) : null;

  if (!cardKey.success) {
    return NextResponse.json(
      { error: "Identifiant de carte invalide." },
      { status: 400 },
    );
  }

  if (rawVariant !== null && parseVariant(rawVariant) === null) {
    return NextResponse.json(
      { error: "Variante de carte invalide." },
      { status: 400 },
    );
  }

  if (
    rawIsGraded !== null &&
    rawIsGraded !== "true" &&
    rawIsGraded !== "false"
  ) {
    return NextResponse.json(
      { error: "Filtre de gradation invalide." },
      { status: 400 },
    );
  }

  if (
    (!isGraded && (condition === null || !CONDITIONS.has(condition))) ||
    (isGraded &&
      ((gradingCompany !== null &&
        !/^[A-Z0-9 -]{2,32}$/.test(gradingCompany)) ||
        (gradeNote !== null &&
          (!Number.isFinite(gradeNote) || gradeNote < 1 || gradeNote > 10))))
  ) {
    return NextResponse.json(
      { error: "Filtres de comparaison invalides." },
      { status: 400 },
    );
  }

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_deckdealr_sales_summary", {
      p_card_key: cardKey.data,
      p_condition: condition ?? undefined,
      p_grade_note: gradeNote ?? undefined,
      p_grading_company: gradingCompany ?? undefined,
      p_is_graded: isGraded,
      p_variant: variant,
      p_limit: 12,
    });

    if (error) throw error;

    const summary = data?.[0];
    const salesVolume = Number(summary?.sales_volume ?? 0);
    const response: DeckDealrSalesResponse = {
      median_price:
        summary?.median_price == null ? null : Number(summary.median_price),
      average_price:
        summary?.average_price == null ? null : Number(summary.average_price),
      sales_volume: salesVolume,
      last_sold_at: summary?.last_sold_at ?? null,
      recent_sales: parseRecentSales(summary?.recent_sales),
      has_sufficient_volume: salesVolume >= MINIMUM_VOLUME,
      minimum_volume: MINIMUM_VOLUME,
      currency: "EUR",
      filters: {
        condition,
        grade_note: gradeNote,
        grading_company: gradingCompany,
        is_graded: isGraded,
        variant,
      },
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Les ventes DeckDealr sont momentanément indisponibles." },
      { status: 500 },
    );
  }
}
