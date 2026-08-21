import { describe, expect, it } from "vitest";

import { snapshotsFromCardDetail } from "./collector";

describe("snapshotsFromCardDetail", () => {
  it("creates one daily snapshot per priced variant", () => {
    const now = new Date("2026-08-21T23:45:00.000Z");
    const snapshots = snapshotsFromCardDetail(
      "fr-base1-4",
      {
        pricing: {
          cardmarket: {
            unit: "EUR",
            trend: 210,
            avg: 205,
            "trend-holo": 350,
          },
        },
      },
      now,
    );

    expect(snapshots).toEqual([
      expect.objectContaining({
        card_key: "fr-base1-4",
        price: 210,
        snapshot_date: "2026-08-21",
        source: "CARDMARKET_TCGDEX",
        variant: "normal",
      }),
      expect.objectContaining({
        card_key: "fr-base1-4",
        price: 350,
        snapshot_date: "2026-08-21",
        source: "CARDMARKET_TCGDEX",
        variant: "holo",
      }),
    ]);
  });

  it("omits unavailable variants instead of inventing a price", () => {
    const snapshots = snapshotsFromCardDetail(
      "fr-base1-4",
      {
        pricing: {
          cardmarket: {
            unit: "EUR",
            trend: 0,
            avg: 0,
            avg30: 0,
            "trend-holo": 120,
          },
        },
      },
      new Date("2026-08-21T10:00:00.000Z"),
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      variant: "holo",
      price: 120,
    });
  });

  it("keeps the same idempotency key for repeated runs on one UTC day", () => {
    const detail = {
      pricing: { cardmarket: { unit: "EUR", trend: 210 } },
    };
    const firstRun = snapshotsFromCardDetail(
      "fr-base1-4",
      detail,
      new Date("2026-08-21T01:00:00.000Z"),
    )[0];
    const secondRun = snapshotsFromCardDetail(
      "fr-base1-4",
      detail,
      new Date("2026-08-21T22:00:00.000Z"),
    )[0];
    const conflictKey = (snapshot: typeof firstRun) => [
      snapshot.card_key,
      snapshot.variant,
      snapshot.source,
      snapshot.snapshot_date,
    ];

    expect(conflictKey(secondRun)).toEqual(conflictKey(firstRun));
  });
});
