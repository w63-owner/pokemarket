import { beforeEach, describe, expect, it, vi } from "vitest";

type MatrixRow = { dest_country: string; price: number | string };

const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

import { getShippingCost, getShippingCostsByDestination } from "./shipping";

function mockMatrixResult(
  data: MatrixRow[] | null,
  error: { message: string } | null = null,
) {
  const result = { data, error };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  from.mockReturnValue(builder);
  return builder;
}

describe("shipping matrix lookup", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("indexes matrix rows by destination country", async () => {
    mockMatrixResult([
      { dest_country: "FR", price: 2.5 },
      { dest_country: "BE", price: "4.90" },
    ]);

    await expect(
      getShippingCostsByDestination("FR", "standard"),
    ).resolves.toEqual({
      FR: 2.5,
      BE: 4.9,
    });
  });

  it("charges the selected destination instead of a hardcoded FR rate", async () => {
    mockMatrixResult([
      { dest_country: "FR", price: 2.5 },
      { dest_country: "CH", price: 7.9 },
    ]);

    await expect(getShippingCost("FR", "CH", "S")).resolves.toBe(7.9);
    await expect(getShippingCost("FR", "FR", "S")).resolves.toBe(2.5);
  });

  it("falls back when the destination is missing", async () => {
    mockMatrixResult([{ dest_country: "FR", price: 2.5 }]);

    await expect(getShippingCost("FR", "IT", "S")).resolves.toBe(0.02);
  });
});
