import { FALLBACK_SHIPPING_COST } from "@deckdealr/shared";
import { supabase } from "@/lib/supabase";
import { fetchShippingCost } from "./shipping";

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const mockFrom = jest.mocked(supabase.from);

function mockMatrixRow(
  price: number | null,
  error: { message: string } | null = null,
) {
  const maybeSingle = jest.fn().mockResolvedValue({
    data: price == null ? null : { price },
    error,
  });
  const builder: { eq: jest.Mock; maybeSingle: jest.Mock } = {
    eq: jest.fn(),
    maybeSingle,
  };
  builder.eq.mockReturnValue(builder);
  mockFrom.mockReturnValue({
    select: jest.fn(() => builder),
  } as never);
  return builder;
}

describe("fetchShippingCost", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads the matrix price for the selected destination", async () => {
    const { eq } = mockMatrixRow(4.9);

    await expect(fetchShippingCost("be", "standard")).resolves.toBe(4.9);

    expect(mockFrom).toHaveBeenCalledWith("shipping_matrix");
    expect(eq).toHaveBeenCalledWith("origin_country", "FR");
    expect(eq).toHaveBeenCalledWith("dest_country", "BE");
    expect(eq).toHaveBeenCalledWith("weight_class", "S");
  });

  it("falls back when the route is missing", async () => {
    mockMatrixRow(null);

    await expect(fetchShippingCost("CH", "S")).resolves.toBe(
      FALLBACK_SHIPPING_COST,
    );
  });
});
