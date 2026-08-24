"use client";

import { useQuery } from "@tanstack/react-query";
import { Info, RefreshCw, ShoppingBag, TrendingUp } from "lucide-react";
import { useState } from "react";
import {
  queryKeys,
  type CardmarketVariant,
  type DeckDealrSalesResponse,
} from "@deckdealr/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CARD_CONDITIONS,
  CONDITION_LABELS,
  GRADING_COMPANIES,
  type CardCondition,
} from "@/lib/constants";

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

async function fetchDeckDealrSales(
  cardKey: string,
  variant: CardmarketVariant,
  condition: string | null,
  isGraded: boolean,
  gradingCompany: string | null,
  gradeNote: number | null,
): Promise<DeckDealrSalesResponse> {
  const params = new URLSearchParams({
    isGraded: String(isGraded),
    variant,
  });
  if (condition) params.set("condition", condition);
  if (gradingCompany) params.set("gradingCompany", gradingCompany);
  if (gradeNote != null) params.set("gradeNote", String(gradeNote));
  const response = await fetch(
    `/api/cards/${encodeURIComponent(cardKey)}/sales?${params}`,
  );

  if (!response.ok) {
    throw new Error("Impossible de charger les ventes DeckDealr.");
  }

  return response.json();
}

export function DeckDealrSales({
  cardKey,
  variant,
}: {
  cardKey: string;
  variant: CardmarketVariant;
}) {
  const [condition, setCondition] = useState("NEAR_MINT");
  const [isGraded, setIsGraded] = useState(false);
  const [gradingCompany, setGradingCompany] = useState<string>(
    GRADING_COMPANIES[0] ?? "PCA",
  );
  const [gradeNote, setGradeNote] = useState(10);
  const filters = {
    condition: isGraded ? null : condition,
    gradeNote: isGraded ? gradeNote : null,
    gradingCompany: isGraded ? gradingCompany : null,
    isGraded,
    variant,
  };
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: queryKeys.deckDealrSales.summary(cardKey, filters),
    queryFn: () =>
      fetchDeckDealrSales(
        cardKey,
        variant,
        filters.condition,
        isGraded,
        filters.gradingCompany,
        filters.gradeNote,
      ),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <DeckDealrSalesSkeleton />;
  }

  if (error || !data) {
    return (
      <section
        className="border-border mt-8 rounded-2xl border p-5"
        aria-labelledby="deckdealr-sales-title"
      >
        <h2
          id="deckdealr-sales-title"
          className="flex items-center gap-2 font-semibold"
        >
          <ShoppingBag className="size-4" aria-hidden="true" />
          Ventes sur DeckDealr
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Les ventes réelles sont temporairement indisponibles.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void refetch()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Réessayer
        </Button>
      </section>
    );
  }

  return (
    <section
      className="border-border mt-8 rounded-2xl border p-5"
      aria-labelledby="deckdealr-sales-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="deckdealr-sales-title"
            className="flex items-center gap-2 font-semibold"
          >
            <ShoppingBag className="size-4" aria-hidden="true" />
            Ventes sur DeckDealr
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Prix carte réellement conclu, hors livraison
          </p>
        </div>
        <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium">
          {data.sales_volume} vente{data.sales_volume > 1 ? "s" : ""}
        </span>
      </div>

      <fieldset className="mt-4 space-y-3">
        <legend className="text-sm font-medium">Ventes comparables</legend>
        <div
          className="bg-muted inline-flex rounded-xl p-1"
          role="group"
          aria-label="Type de gradation"
        >
          <button
            type="button"
            onClick={() => setIsGraded(false)}
            aria-pressed={!isGraded}
            className="aria-pressed:bg-background aria-pressed:text-foreground text-muted-foreground rounded-lg px-3 py-2 text-sm font-medium transition-colors aria-pressed:shadow-sm"
          >
            Non gradées
          </button>
          <button
            type="button"
            onClick={() => setIsGraded(true)}
            aria-pressed={isGraded}
            className="aria-pressed:bg-background aria-pressed:text-foreground text-muted-foreground rounded-lg px-3 py-2 text-sm font-medium transition-colors aria-pressed:shadow-sm"
          >
            Gradées
          </button>
        </div>

        {!isGraded ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">État</span>
            <select
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              className="border-input bg-background h-10 rounded-lg border px-3"
            >
              {CARD_CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_LABELS[value as CardCondition]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Organisme</span>
              <select
                value={gradingCompany}
                onChange={(event) => setGradingCompany(event.target.value)}
                className="border-input bg-background h-10 rounded-lg border px-3"
              >
                {GRADING_COMPANIES.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Note</span>
              <select
                value={gradeNote}
                onChange={(event) => setGradeNote(Number(event.target.value))}
                className="border-input bg-background h-10 rounded-lg border px-3"
              >
                {Array.from({ length: 19 }, (_, index) => 10 - index * 0.5).map(
                  (note) => (
                    <option key={note} value={note}>
                      {note}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        )}
      </fieldset>

      {!data.has_sufficient_volume ? (
        <div className="bg-muted/40 mt-4 rounded-xl p-4">
          <Info className="text-muted-foreground size-5" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium">Historique en constitution</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Il faut au moins {data.minimum_volume} ventes comparables pour
            afficher une cote fiable. Aucune annonce ni donnée fictive n’est
            utilisée.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <div className="bg-primary/5 border-primary/15 rounded-xl border p-3">
              <dt className="text-muted-foreground text-xs">Prix médian</dt>
              <dd className="mt-1 text-lg font-bold">
                {currencyFormatter.format(data.median_price ?? 0)}
              </dd>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <dt className="text-muted-foreground text-xs">Prix moyen</dt>
              <dd className="mt-1 text-lg font-semibold">
                {currencyFormatter.format(data.average_price ?? 0)}
              </dd>
            </div>
          </dl>

          {data.recent_sales.length > 0 && (
            <div className="mt-5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <TrendingUp className="size-4" aria-hidden="true" />
                Ventes récentes
              </p>
              <ul className="mt-2 divide-y text-sm">
                {data.recent_sales
                  .slice(-5)
                  .reverse()
                  .map((sale) => (
                    <li
                      key={`${sale.sold_at}-${sale.price}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <time
                        dateTime={sale.sold_at}
                        className="text-muted-foreground"
                      >
                        {dateFormatter.format(new Date(sale.sold_at))}
                      </time>
                      <span className="font-medium">
                        {currencyFormatter.format(sale.price)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DeckDealrSalesSkeleton() {
  return (
    <section
      className="border-border mt-8 rounded-2xl border p-5"
      aria-label="Chargement des ventes DeckDealr"
      aria-busy="true"
    >
      <Skeleton className="h-5 w-48" />
      <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </section>
  );
}
