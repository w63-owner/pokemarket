import { requireUserId } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase";
import { createListing, updateListing } from "./listings";

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentUserId: jest.fn(),
  requireUserId: jest.fn(),
}));

jest.mock("@/lib/storage/upload-image", () => ({
  contentTypeToExt: jest.fn(() => "jpg"),
  uploadImageFromUri: jest.fn(),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const mockRequireUserId = jest.mocked(requireUserId);
const mockFrom = jest.mocked(supabase.from);

const identifiedListingInput = {
  title: "Dracaufeu Base Set",
  price_seller: 120,
  condition: "NEAR_MINT",
  is_graded: false,
  delivery_weight_class: "S",
  cover_image_url: "https://images.example/recto.png",
  back_image_url: "https://images.example/verso.png",
  card_ref_id: "fr-base1-4",
} as const;

function mockListingWrite(result: { data: unknown; error: null }) {
  const single = jest.fn().mockResolvedValue(result);
  const select = jest.fn(() => ({ single }));
  const insert = jest.fn(() => ({ select }));
  const update = jest.fn(() => ({
    eq: jest.fn(() => ({
      eq: jest.fn(() => ({ select })),
    })),
  }));

  mockFrom.mockReturnValue({
    insert,
    update,
  } as never);

  return { insert, update };
}

describe("mobile listing persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireUserId.mockResolvedValue("seller-1");
  });

  it("rejects an identified catalog card without a printing variant", async () => {
    await expect(createListing(identifiedListingInput)).rejects.toThrow(
      "La variante est requise pour une carte identifiée",
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("persists the selected variant with the listing", async () => {
    const listing = { id: "listing-1", ...identifiedListingInput };
    const { insert } = mockListingWrite({ data: listing, error: null });

    await expect(
      createListing({ ...identifiedListingInput, card_variant: "holo" }),
    ).resolves.toEqual(listing);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        card_ref_id: "fr-base1-4",
        card_variant: "holo",
        seller_id: "seller-1",
      }),
    );
  });

  it("keeps the variant when a seller edits a listing", async () => {
    const listing = { id: "listing-1", card_variant: "normal" };
    const { update } = mockListingWrite({ data: listing, error: null });

    await expect(
      updateListing({
        id: "listing-1",
        title: "Dracaufeu Base Set",
        price_seller: 120,
        condition: "NEAR_MINT",
        is_graded: false,
        cover_image_url: "https://images.example/recto.png",
        back_image_url: "https://images.example/verso.png",
        card_variant: "normal",
      }),
    ).resolves.toEqual(listing);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ card_variant: "normal" }),
    );
  });
});
