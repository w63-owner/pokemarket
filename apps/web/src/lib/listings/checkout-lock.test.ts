import { describe, expect, it } from "vitest";
import {
  listingLockForBuyer,
  listingUnlockAfterCheckout,
} from "./checkout-lock";

describe("listingLockForBuyer", () => {
  it("binds LOCKED to the checkout buyer", () => {
    expect(listingLockForBuyer("buyer-1")).toEqual({
      status: "LOCKED",
      reserved_for: "buyer-1",
    });
  });
});

describe("listingUnlockAfterCheckout", () => {
  it("clears reserved_for when returning to ACTIVE", () => {
    expect(listingUnlockAfterCheckout("ACTIVE")).toEqual({
      status: "ACTIVE",
      reserved_for: null,
    });
  });

  it("keeps reserved_for when an accepted offer returns to RESERVED", () => {
    expect(listingUnlockAfterCheckout("RESERVED")).toEqual({
      status: "RESERVED",
    });
  });
});
