import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));

import { acceptOffer, createOffer, rejectOffer } from "./offers";
import { createDispute, shipOrder } from "./transactions";

describe("messaging business events", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.rpc.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
  });

  it("routes web offer mutations through server endpoints", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            offer: {
              id: "offer-1",
              listing_id: "listing-1",
              buyer_id: "user-1",
              offer_amount: 10,
              status: "PENDING",
              conversation_id: "conversation-1",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValue(new Response(JSON.stringify({ success: true })));

    await expect(
      createOffer("listing-1", 10, "conversation-1"),
    ).resolves.toMatchObject({ id: "offer-1" });
    await expect(
      acceptOffer("offer-1", "listing-1", "buyer-1", 10, "conversation-1"),
    ).resolves.toBeUndefined();
    await expect(
      rejectOffer("offer-2", "conversation-1"),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/offers/create",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/offers/accept",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/offers/reject",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the correlated RPC for disputes", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    await createDispute(
      "transaction-1",
      "other",
      " Description valide ",
      "conversation-1",
    );

    expect(mocks.rpc).toHaveBeenCalledWith("create_dispute", {
      p_transaction_id: "transaction-1",
      p_reason: "other",
      p_description: "Description valide",
      p_conversation_id: "conversation-1",
    });
  });

  it("uses the correlated RPC for shipping", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));

    await shipOrder(
      "transaction-1",
      "TRACK-1",
      "carrier.example/track",
      "conversation-1",
    );

    expect(mocks.rpc).toHaveBeenCalledWith("ship_order", {
      p_transaction_id: "transaction-1",
      p_tracking_number: "TRACK-1",
      p_tracking_url: "https://carrier.example/track",
      p_conversation_id: "conversation-1",
    });
  });
});
