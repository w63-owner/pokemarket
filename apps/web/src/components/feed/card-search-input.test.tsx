import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CardSearchInput, type CardSuggestion } from "./card-search-input";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  m: { div: "div" },
}));

const suggestion: CardSuggestion = {
  card_key: "fr-base1-4",
  name: "Dracaufeu",
  set_id: "base1",
  set_name: "Set de Base",
  series_id: "base",
  series_name: "Base",
  local_id: "4",
  set_official_count: 102,
  rarity: "Rare",
  language: "fr",
  image_url: null,
};

function SearchHarness({
  onSelect,
}: {
  onSelect: (card: CardSuggestion) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <CardSearchInput
      value={value}
      onChange={setValue}
      onClear={() => setValue("")}
      onSubmit={() => undefined}
      onSelectCard={onSelect}
      selectFirstOnSubmit
    />
  );
}

function renderSearch(onSelect: (card: CardSuggestion) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchHarness onSelect={onSelect} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [suggestion] }),
    }),
  );
});

describe("CardSearchInput", () => {
  it("exposes rich results and opens the highlighted card with the keyboard", async () => {
    const onSelect = vi.fn();
    renderSearch(onSelect);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "Dracaufeu" } });

    const option = await screen.findByRole("option");
    expect(option.textContent).toContain("Dracaufeu");
    expect(option.textContent).toContain("Set de Base");
    expect(option.textContent).toContain("4/102");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(option.getAttribute("aria-selected")).toBe("true");
    const form = input.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(onSelect).toHaveBeenCalledWith(suggestion);
  });

  it("supports selecting a result by touch or pointer", async () => {
    const onSelect = vi.fn();
    renderSearch(onSelect);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Dracaufeu" },
    });
    const optionButton = await screen.findByRole("button", {
      name: /Dracaufeu/,
    });
    fireEvent.mouseDown(optionButton);

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(suggestion));
  });
});
