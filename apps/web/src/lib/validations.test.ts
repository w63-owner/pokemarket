import { describe, it, expect } from "vitest";
import {
  checkoutSchema,
  listingCreateSchema,
  shippingSchema,
  reviewSchema,
  disputeSchema,
} from "./validations";

describe("checkoutSchema", () => {
  const valid = {
    listing_id: "11111111-1111-4111-8111-111111111111",
    shipping_country: "FR",
    shipping_address_line: "1 rue de la Paix",
    shipping_address_city: "Paris",
    shipping_address_postcode: "75001",
  };

  it("accepts a fully valid payload", () => {
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects non-UUID listing_id", () => {
    expect(
      checkoutSchema.safeParse({ ...valid, listing_id: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects non-supported shipping country", () => {
    expect(
      checkoutSchema.safeParse({ ...valid, shipping_country: "ZZ" }).success,
    ).toBe(false);
  });

  it("rejects empty address line", () => {
    expect(
      checkoutSchema.safeParse({ ...valid, shipping_address_line: "" }).success,
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(
      checkoutSchema.safeParse({ listing_id: valid.listing_id }).success,
    ).toBe(false);
  });
});

describe("listingCreateSchema", () => {
  const baseValid = {
    title: "Charizard Base Set Holo",
    price_seller: 100,
    condition: "NEAR_MINT",
    is_graded: false,
    delivery_weight_class: "S",
    cover_image_url: "https://images.example/recto.png",
    back_image_url: "https://images.example/verso.png",
  } as const;

  it("accepts a non-graded valid listing", () => {
    expect(listingCreateSchema.safeParse(baseValid).success).toBe(true);
  });

  it("rejects negative price", () => {
    expect(
      listingCreateSchema.safeParse({ ...baseValid, price_seller: -1 }).success,
    ).toBe(false);
  });

  it("rejects zero price", () => {
    expect(
      listingCreateSchema.safeParse({ ...baseValid, price_seller: 0 }).success,
    ).toBe(false);
  });

  it("graded listing requires grading_company AND grade_note", () => {
    expect(
      listingCreateSchema.safeParse({
        ...baseValid,
        is_graded: true,
        // missing grading_company / grade_note
        condition: undefined,
      }).success,
    ).toBe(false);
  });

  it("non-graded listing requires condition", () => {
    expect(
      listingCreateSchema.safeParse({
        ...baseValid,
        is_graded: false,
        condition: undefined,
      } as Record<string, unknown>).success,
    ).toBe(false);
  });

  it("rejects non-URL cover image", () => {
    expect(
      listingCreateSchema.safeParse({
        ...baseValid,
        cover_image_url: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("rejects too-short title", () => {
    expect(
      listingCreateSchema.safeParse({ ...baseValid, title: "ab" }).success,
    ).toBe(false);
  });

  it("rejects grade outside 1..10", () => {
    expect(
      listingCreateSchema.safeParse({
        ...baseValid,
        is_graded: true,
        grading_company: "PSA",
        grade_note: 11,
      } as Record<string, unknown>).success,
    ).toBe(false);

    expect(
      listingCreateSchema.safeParse({
        ...baseValid,
        is_graded: true,
        grading_company: "PSA",
        grade_note: 0,
      } as Record<string, unknown>).success,
    ).toBe(false);
  });
});

describe("shippingSchema", () => {
  it("accepts tracking number with no URL", () => {
    expect(
      shippingSchema.safeParse({ tracking_number: "TRACK123" }).success,
    ).toBe(true);
  });

  it("accepts empty string for tracking_url", () => {
    expect(
      shippingSchema.safeParse({
        tracking_number: "TRACK123",
        tracking_url: "",
      }).success,
    ).toBe(true);
  });

  it("rejects empty tracking number", () => {
    expect(shippingSchema.safeParse({ tracking_number: "" }).success).toBe(
      false,
    );
  });

  it("rejects malformed tracking_url", () => {
    expect(
      shippingSchema.safeParse({
        tracking_number: "TRACK123",
        tracking_url: "not-a-url",
      }).success,
    ).toBe(false);
  });
});

describe("reviewSchema", () => {
  it("accepts 1..5 ratings", () => {
    for (const r of [1, 2, 3, 4, 5]) {
      expect(reviewSchema.safeParse({ rating: r }).success).toBe(true);
    }
  });
  it("rejects rating 0 or 6", () => {
    expect(reviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false);
  });
  it("rejects non-integer ratings", () => {
    expect(reviewSchema.safeParse({ rating: 4.5 }).success).toBe(false);
  });
});

describe("disputeSchema", () => {
  it("rejects too-short description", () => {
    expect(
      disputeSchema.safeParse({ reason: "DAMAGED_CARD", description: "abc" })
        .success,
    ).toBe(false);
  });
  it("rejects unknown reason", () => {
    expect(
      disputeSchema.safeParse({
        reason: "ITEM_NOT_RECEIVED",
        description: "...".repeat(20),
      }).success,
    ).toBe(false);
  });
  it("accepts a thorough description with valid reason", () => {
    expect(
      disputeSchema.safeParse({
        reason: "DAMAGED_CARD",
        description: "Carte arrivée pliée et déchirée au coin.",
      }).success,
    ).toBe(true);
  });
});
