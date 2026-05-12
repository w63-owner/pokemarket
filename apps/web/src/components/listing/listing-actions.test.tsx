import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingActions } from "./listing-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/api/conversations", () => ({
  fetchOrCreateConversation: vi.fn(),
}));
vi.mock("@/actions/listings", () => ({
  deleteListingAction: vi.fn(),
}));
vi.mock("framer-motion", () => ({ m: { div: "div" } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("ListingActions — buyer-side state rendering", () => {
  it("ACTIVE listing shows Contacter + Acheter <price>", () => {
    render(
      <ListingActions
        listingId="L1"
        mode="buyer"
        currentPrice={42.5}
        listingStatus="ACTIVE"
      />,
    );
    expect(screen.getByText(/Contacter/)).toBeDefined();
    expect(screen.getByText(/Acheter.*42/)).toBeDefined();
  });

  it("SOLD listing hides all CTAs and shows status pill", () => {
    render(
      <ListingActions
        listingId="L1"
        mode="buyer"
        currentPrice={42.5}
        listingStatus="SOLD"
      />,
    );
    expect(screen.getByText(/Annonce vendue/)).toBeDefined();
    expect(screen.queryByText(/Acheter/)).toBeNull();
    expect(screen.queryByText(/Contacter/)).toBeNull();
  });

  it("RESERVED for someone else: only Contacter button + warning pill", () => {
    render(
      <ListingActions
        listingId="L1"
        mode="buyer"
        currentPrice={42.5}
        listingStatus="RESERVED"
        isReservedForViewer={false}
      />,
    );
    expect(screen.getByText(/Réservée à un autre/)).toBeDefined();
    expect(screen.getByText(/Contacter le vendeur/)).toBeDefined();
    expect(screen.queryByText(/Acheter/)).toBeNull();
  });

  it("LOCKED for someone else: payment-in-progress pill + Contacter only", () => {
    render(
      <ListingActions
        listingId="L1"
        mode="buyer"
        currentPrice={42.5}
        listingStatus="LOCKED"
        isReservedForViewer={false}
      />,
    );
    expect(screen.getByText(/Paiement en cours/)).toBeDefined();
    expect(screen.queryByText(/Acheter/)).toBeNull();
  });

  it("RESERVED for the current viewer: Acheter button uses RESERVED PRICE not current price", () => {
    render(
      <ListingActions
        listingId="L1"
        mode="buyer"
        currentPrice={50}
        listingStatus="RESERVED"
        isReservedForViewer={true}
        reservedPrice={30}
      />,
    );
    // Should show the discounted reserved price, not 50
    expect(screen.getByText(/Acheter.*30/)).toBeDefined();
    expect(screen.queryByText(/Acheter.*50/)).toBeNull();
  });

  it("seller mode shows Edit + Delete (no Buy)", () => {
    render(
      <ListingActions
        listingId="L1"
        mode="seller"
        currentPrice={42.5}
        listingStatus="ACTIVE"
      />,
    );
    expect(screen.getByText(/Modifier/)).toBeDefined();
    expect(screen.getByText(/Supprimer/)).toBeDefined();
    expect(screen.queryByText(/Acheter/)).toBeNull();
  });
});
