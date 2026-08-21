import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PriceHistoryChart } from "./price-history-chart";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PriceHistoryChart", () => {
  it("explains that real history is still being collected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          availablePeriods: [],
          chartData: [],
          currency: "EUR",
          historyStatus: "empty",
          period: "30d",
          recommendation: null,
          source: "CARDMARKET_TCGDEX",
          stats: { observations: 0, range: null, volatility: 0 },
          variant: "normal",
        }),
        { status: 200 },
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PriceHistoryChart cardKey="fr-base1-4" variant="normal" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Historique en constitution")).toBeTruthy();
    expect(
      screen.getByText(/Aucune extrapolation n’est affichée/),
    ).toBeTruthy();
  });
});
