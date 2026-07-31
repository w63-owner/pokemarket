import { beforeEach, describe, expect, it, vi } from "vitest";

import { acceptOffer, createOffer, rejectOffer } from "./offers";

describe("offer API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the offer created by the server route", async () => {
    const offer = {
      id: "offer-1",
      listing_id: "listing-1",
      buyer_id: "buyer-1",
      offer_amount: 25,
      status: "PENDING",
      conversation_id: "conversation-1",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ offer }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      createOffer("listing-1", 25, "conversation-1"),
    ).resolves.toMatchObject(offer);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/offers/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          listing_id: "listing-1",
          amount: 25,
          conversation_id: "conversation-1",
        }),
      }),
    );
  });

  it("surfaces a create error returned by the server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Offre invalide" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      createOffer("listing-1", 25, "conversation-1"),
    ).rejects.toThrow("Offre invalide");
  });

  it("accepts an offer through the protected server route", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ success: true })));

    await expect(
      acceptOffer("offer-1", "listing-1", "buyer-1", 25, "conversation-1"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/offers/accept",
      expect.objectContaining({
        body: JSON.stringify({
          offer_id: "offer-1",
          conversation_id: "conversation-1",
        }),
      }),
    );
  });

  it("rejects an offer through the protected server route", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ success: true })));

    await expect(
      rejectOffer("offer-1", "conversation-1"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/offers/reject",
      expect.objectContaining({
        body: JSON.stringify({
          offer_id: "offer-1",
          conversation_id: "conversation-1",
        }),
      }),
    );
  });
});
