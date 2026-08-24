"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  ImageIcon,
  Search,
  ShieldCheck,
  Tag,
} from "lucide-react";
import {
  queryKeys,
  type CardMarketDetailResponse,
  type CardmarketVariant,
  type CardmarketVariantQuote,
} from "@deckdealr/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceHistoryChart } from "@/components/listing/price-history-chart";
import { DeckDealrSales } from "./deckdealr-sales";

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

async function fetchCardMarketDetail(
  cardKey: string,
): Promise<CardMarketDetailResponse> {
  const response = await fetch(`/api/cards/${encodeURIComponent(cardKey)}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body && typeof body.error === "string"
        ? body.error
        : "Impossible de charger cette cote.",
    );
  }
  return response.json();
}

function formatPrice(value: number | null, currency: string): string {
  if (value == null) return "Indisponible";
  if (currency === "EUR") return currencyFormatter.format(value);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(value);
}

function formatFreshness(updatedAt: string | null): string {
  if (!updatedAt) return "Date de mise à jour indisponible";
  return `Mise à jour le ${new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(updatedAt))}`;
}

function QuoteMetric({
  label,
  value,
  currency,
}: {
  label: string;
  value: number | null;
  currency: string;
}) {
  return (
    <div className="bg-muted/50 rounded-xl p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">
        {formatPrice(value, currency)}
      </dd>
    </div>
  );
}

function PriceBlock({
  quote,
  currency,
}: {
  quote: CardmarketVariantQuote;
  currency: string;
}) {
  if (quote.current == null) {
    return (
      <div className="border-border bg-muted/30 rounded-2xl border border-dashed px-5 py-8 text-center">
        <BarChart3
          className="text-muted-foreground mx-auto size-7"
          aria-hidden="true"
        />
        <h2 className="mt-3 font-semibold">Prix non disponible</h2>
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
          Cardmarket ne fournit pas encore de cote exploitable pour cette
          variante. Aucun prix fictif n’est affiché.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-primary/5 border-primary/20 rounded-2xl border p-5">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Cote tendance actuelle
        </p>
        <p className="font-heading mt-2 text-4xl font-bold tracking-tight">
          {formatPrice(quote.current, currency)}
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
        <QuoteMetric
          label="Prix tendance"
          value={quote.trend}
          currency={currency}
        />
        <QuoteMetric
          label="Prix moyen"
          value={quote.average}
          currency={currency}
        />
        <QuoteMetric
          label="Moyenne 30 j"
          value={quote.average30}
          currency={currency}
        />
      </dl>
    </>
  );
}

export function CardMarketDetailClient({ cardKey }: { cardKey: string }) {
  const [chosenVariant, setChosenVariant] = useState<CardmarketVariant | null>(
    null,
  );
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: queryKeys.cardMarket.detail(cardKey),
    queryFn: () => fetchCardMarketDetail(cardKey),
    staleTime: 15 * 60 * 1000,
  });

  if (isLoading) return <CardMarketDetailSkeleton />;

  if (error || !data) {
    return (
      <main className="mx-auto flex min-h-[70svh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <div className="bg-destructive/10 text-destructive rounded-full p-4">
          <AlertCircle className="size-7" aria-hidden="true" />
        </div>
        <h1 className="font-heading mt-4 text-xl font-bold">
          Cote indisponible
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {error instanceof Error ? error.message : "Une erreur est survenue."}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" render={<Link href="/price-checking" />}>
            Nouvelle recherche
          </Button>
          <Button onClick={() => void refetch()}>Réessayer</Button>
        </div>
      </main>
    );
  }

  const { card } = data;
  const selectedVariant = card.available_variants.includes(
    chosenVariant ?? "normal",
  )
    ? (chosenVariant ?? "normal")
    : card.available_variants[0];
  const quote = card.pricing?.[selectedVariant] ?? {
    variant: selectedVariant,
    current: null,
    trend: null,
    average: null,
    average30: null,
  };
  const number =
    card.local_id && card.set_official_count
      ? `${card.local_id}/${card.set_official_count}`
      : card.local_id;
  const searchHref = `/search?q=${encodeURIComponent(
    [card.name, number].filter(Boolean).join(" "),
  )}`;
  const sellHref = `/sell?card_key=${encodeURIComponent(card.card_key)}`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:py-8">
      <Button
        variant="ghost"
        render={<Link href="/price-checking" />}
        className="-ml-2"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Rechercher une autre carte
      </Button>

      <div className="mt-4 grid gap-7 md:grid-cols-[minmax(240px,360px)_1fr] md:gap-10">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="bg-muted relative aspect-[5/7] overflow-hidden rounded-2xl border shadow-sm">
            {card.image_url ? (
              <Image
                src={card.image_url}
                alt={`Carte ${card.name}`}
                fill
                sizes="(max-width: 768px) 90vw, 360px"
                className="object-contain"
                placeholder="blur"
                blurDataURL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
                preload
              />
            ) : (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
                <ImageIcon className="size-8" aria-hidden="true" />
                <span className="text-sm">Visuel indisponible</span>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {card.set_name ?? "Extension inconnue"}
            </Badge>
            {number && <Badge variant="outline">N° {number}</Badge>}
            {card.rarity && <Badge variant="outline">{card.rarity}</Badge>}
          </div>
          <h1 className="font-heading mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {card.name}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {[card.series_name, card.illustrator].filter(Boolean).join(" · ")}
          </p>

          <section className="mt-7 space-y-4" aria-labelledby="market-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="market-title" className="font-semibold">
                  Cardmarket via TCGdex
                </h2>
                <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  {formatFreshness(card.pricing?.updatedAt ?? null)}
                </p>
              </div>
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Donnée externe
              </div>
            </div>

            {card.available_variants.length > 1 && (
              <div
                className="bg-muted inline-flex rounded-xl p-1"
                role="group"
                aria-label="Variante de la carte"
              >
                {card.available_variants.map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => setChosenVariant(variant)}
                    aria-pressed={selectedVariant === variant}
                    className="aria-pressed:bg-background aria-pressed:text-foreground text-muted-foreground rounded-lg px-4 py-2 text-sm font-medium transition-colors aria-pressed:shadow-sm"
                  >
                    {variant === "holo" ? "Holographique" : "Normale"}
                  </button>
                ))}
              </div>
            )}

            <PriceBlock
              quote={quote}
              currency={card.pricing?.currency ?? "EUR"}
            />
          </section>

          <PriceHistoryChart
            cardKey={card.card_key}
            variant={selectedVariant}
          />

          <DeckDealrSales cardKey={card.card_key} variant={selectedVariant} />

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              variant="outline"
              render={<Link href={searchHref} />}
            >
              <Search className="size-4" aria-hidden="true" />
              Voir les annonces
            </Button>
            <Button size="lg" render={<Link href={sellHref} />}>
              <Tag className="size-4" aria-hidden="true" />
              Vendre cette carte
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function CardMarketDetailSkeleton() {
  return (
    <main
      className="mx-auto w-full max-w-5xl px-4 py-8"
      aria-busy="true"
      aria-label="Chargement de la cote"
    >
      <Skeleton className="h-8 w-48" />
      <div className="mt-6 grid gap-7 md:grid-cols-[minmax(240px,360px)_1fr] md:gap-10">
        <Skeleton className="mx-auto aspect-[5/7] w-full max-w-[360px] rounded-2xl" />
        <div className="space-y-5">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
