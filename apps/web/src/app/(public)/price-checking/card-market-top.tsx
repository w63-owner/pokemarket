"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  ImageIcon,
  Trophy,
} from "lucide-react";
import {
  queryKeys,
  type CardMarketTopResponse,
  type CardmarketVariant,
} from "@deckdealr/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

async function fetchCardMarketTop(): Promise<CardMarketTopResponse> {
  const response = await fetch("/api/cards/top");
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body && typeof body.error === "string"
        ? body.error
        : "Impossible de charger le classement.",
    );
  }
  return response.json();
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(price);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function variantLabel(variant: CardmarketVariant): string {
  return variant === "holo" ? "Holographique" : "Normale";
}

export function CardMarketTop() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: queryKeys.cardMarket.top(),
    queryFn: fetchCardMarketTop,
    staleTime: 15 * 60 * 1000,
  });

  if (isLoading) return <CardMarketTopSkeleton />;

  if (error) {
    return (
      <section
        className="mx-auto max-w-5xl px-4 py-10"
        aria-labelledby="cardmarket-top-title"
      >
        <div className="border-destructive/30 bg-destructive/5 rounded-2xl border p-6 text-center">
          <AlertCircle
            className="text-destructive mx-auto size-7"
            aria-hidden="true"
          />
          <h2 id="cardmarket-top-title" className="mt-3 font-semibold">
            Classement indisponible
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {error instanceof Error
              ? error.message
              : "Une erreur est survenue."}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => void refetch()}
          >
            Réessayer
          </Button>
        </div>
      </section>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <section
        className="mx-auto max-w-5xl px-4 py-10"
        aria-labelledby="cardmarket-top-title"
      >
        <div className="bg-muted/30 rounded-2xl border border-dashed p-8 text-center">
          <BarChart3
            className="text-muted-foreground mx-auto size-8"
            aria-hidden="true"
          />
          <h2 id="cardmarket-top-title" className="mt-3 font-semibold">
            Le classement se prépare
          </h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm leading-6">
            Les premiers prix Cardmarket réels sont en cours de collecte. Aucun
            classement fictif ne sera affiché.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="mx-auto max-w-5xl px-4 py-10 sm:py-12"
      aria-labelledby="cardmarket-top-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-primary flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4" aria-hidden="true" />
            Marché français
          </div>
          <h2
            id="cardmarket-top-title"
            className="font-heading mt-1 text-2xl font-bold tracking-tight sm:text-3xl"
          >
            Top 10 des cartes les plus chères
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Cote Cardmarket actuelle via TCGdex, cartes non gradées.
          </p>
        </div>
        {data.snapshot_date && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            Relevé du {formatDate(data.snapshot_date)}
          </p>
        )}
      </div>

      <ol className="mt-6 grid gap-3 md:grid-cols-2">
        {data.entries.map((entry) => {
          const number =
            entry.local_id && entry.set_official_count
              ? `${entry.local_id}/${entry.set_official_count}`
              : entry.local_id;

          return (
            <li key={entry.card_key}>
              <Link
                href={`/price-checking/${encodeURIComponent(entry.card_key)}`}
                className="bg-card hover:border-primary/40 focus-visible:ring-ring grid min-h-28 grid-cols-[2.5rem_4.5rem_1fr] items-center gap-3 rounded-2xl border p-3 transition-colors outline-none focus-visible:ring-2"
              >
                <span
                  className={
                    entry.rank <= 3
                      ? "bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-sm font-bold"
                      : "text-muted-foreground text-center text-sm font-semibold"
                  }
                  aria-label={`Rang ${entry.rank}`}
                >
                  {entry.rank}
                </span>

                <span className="bg-muted relative block aspect-[5/7] overflow-hidden rounded-lg border">
                  {entry.image_url ? (
                    <Image
                      src={entry.image_url}
                      alt=""
                      fill
                      sizes="72px"
                      className="object-contain"
                      placeholder="blur"
                      blurDataURL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
                    />
                  ) : (
                    <span className="text-muted-foreground flex h-full items-center justify-center">
                      <ImageIcon className="size-5" aria-hidden="true" />
                    </span>
                  )}
                </span>

                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {entry.name}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                    {[entry.set_name, number].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-primary text-lg font-bold">
                      {formatPrice(entry.price, entry.currency)}
                    </span>
                    <Badge variant="secondary">
                      {variantLabel(entry.variant)}
                    </Badge>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CardMarketTopSkeleton() {
  return (
    <section
      className="mx-auto max-w-5xl px-4 py-10 sm:py-12"
      aria-busy="true"
      aria-label="Chargement du classement Cardmarket"
    >
      <Skeleton className="h-5 w-36" />
      <Skeleton className="mt-3 h-8 w-80 max-w-full" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
    </section>
  );
}
