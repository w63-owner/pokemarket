import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckoutClient } from "./checkout-client";
import type { ShippingCountry } from "@/lib/constants";

vi.mock("framer-motion", () => ({ m: { div: "div" } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/layout/mobile-header", () => ({
  MobileHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));
vi.mock("@/components/checkout/countdown-timer", () => ({
  CountdownTimer: () => <div>Temps restant pour finaliser</div>,
}));
vi.mock("@/components/checkout/address-autocomplete", () => ({
  AddressAutocomplete: () => <input aria-label="Adresse" />,
}));

const shippingQuotes: Record<ShippingCountry, number> = {
  FR: 2.5,
  BE: 4.9,
  ES: 5.9,
  CH: 7.9,
  LU: 4.9,
  DE: 5.9,
  IT: 5.9,
};

describe("CheckoutClient", () => {
  it("uses the default shipping country quote for the displayed total", () => {
    render(
      <CheckoutClient
        listing={{
          id: "listing-1",
          title: "Charizard",
          cover_image_url: null,
          display_price: 50,
          condition: "NEAR_MINT",
          is_graded: false,
          grading_company: null,
          grade_note: null,
          card_series: "Base Set",
          delivery_weight_class: "S",
        }}
        effectivePrice={50}
        shippingQuotes={shippingQuotes}
        defaultShipping={{
          addressLine: "1 rue de la Paix",
          city: "Bruxelles",
          postcode: "1000",
          country: "BE",
        }}
      />,
    );

    expect(screen.getByText(/4,90/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Payer.*54,90/ })).toBeDefined();
  });
});
