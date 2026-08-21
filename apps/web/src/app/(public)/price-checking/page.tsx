"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import { BarChart3, Search, ShieldCheck, Sparkles } from "lucide-react";

import { CardSearchInput } from "@/components/feed/card-search-input";

export default function PriceCheckingPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  return (
    <main className="bg-background min-h-svh">
      <section className="relative overflow-hidden border-b">
        <div className="bg-primary/10 absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full blur-3xl" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-12 text-center sm:py-16">
          <m.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-primary/10 text-primary mb-4 rounded-2xl p-3"
          >
            <BarChart3 className="size-7" aria-hidden="true" />
          </m.div>
          <m.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-heading text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Cote des cartes
          </m.h1>
          <p className="text-muted-foreground mt-3 max-w-xl text-sm leading-6 sm:text-base">
            Retrouvez la cote Cardmarket actuelle d’une carte française, avec sa
            variante et la date de mise à jour de la source.
          </p>

          <div className="mt-8 w-full max-w-2xl">
            <CardSearchInput
              value={query}
              onChange={setQuery}
              onClear={() => setQuery("")}
              onSubmit={() => undefined}
              onSelectCard={(card) =>
                router.push(
                  `/price-checking/${encodeURIComponent(card.card_key)}`,
                )
              }
              selectFirstOnSubmit
              placeholder="Nom, extension ou numéro (ex. Dracaufeu 4/102)…"
              noResultsHint="Essayez un autre nom, une extension ou un numéro."
            />
          </div>
          <div className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Source distincte des annonces et ventes PokeMarket
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-3xl gap-4 px-4 py-8 sm:grid-cols-2">
        <div className="bg-card rounded-2xl border p-5">
          <Sparkles className="text-primary size-5" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">Une cote lisible</h2>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Prix tendance, moyenne actuelle et moyenne sur 30 jours, sans
            estimation artificielle.
          </p>
        </div>
        <div className="bg-card rounded-2xl border p-5">
          <Search className="text-primary size-5" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">Le bon tirage, rapidement</h2>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Image, extension et numéro permettent de distinguer les cartes au
            clavier comme au toucher.
          </p>
        </div>
      </section>
    </main>
  );
}
