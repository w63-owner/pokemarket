/**
 * Checkout lock helpers.
 *
 * Direct (no-offer) checkout must set `reserved_for` when flipping ACTIVE →
 * LOCKED. RLS only lets the reserved buyer read LOCKED listings, and both
 * checkout pages and listing CTAs treat LOCKED + null reserved_for as
 * "another buyer" — so omitting it 404s the listing after Stripe cancel and
 * blocks retry until the lock expires.
 */

export function listingLockForBuyer(buyerId: string) {
  return { status: "LOCKED" as const, reserved_for: buyerId };
}

export function listingUnlockAfterCheckout(nextStatus: "ACTIVE" | "RESERVED") {
  return nextStatus === "ACTIVE"
    ? { status: "ACTIVE" as const, reserved_for: null }
    : { status: "RESERVED" as const };
}
