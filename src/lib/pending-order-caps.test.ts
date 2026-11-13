import { describe, expect, it } from "vitest";

import {
  MAX_PENDING_ORDERS_PER_PHONE,
  MAX_PENDING_ORDERS_PER_RESTAURANT,
  pendingOrderCapDecision
} from "./pending-order-caps";

describe("pendingOrderCapDecision", () => {
  const base = { alreadySubmitted: false, pendingForPhone: 0, pendingForRestaurant: 0 };

  it("allows ordinary orders", () => {
    expect(pendingOrderCapDecision(base)).toBe("allowed");
    expect(
      pendingOrderCapDecision({ ...base, pendingForPhone: MAX_PENDING_ORDERS_PER_PHONE - 1 })
    ).toBe("allowed");
  });

  it("stops one phone from piling up unaccepted orders", () => {
    expect(
      pendingOrderCapDecision({ ...base, pendingForPhone: MAX_PENDING_ORDERS_PER_PHONE })
    ).toBe("phone_limit");
  });

  it("stops the restaurant queue from being flooded across many phones", () => {
    expect(
      pendingOrderCapDecision({ ...base, pendingForRestaurant: MAX_PENDING_ORDERS_PER_RESTAURANT })
    ).toBe("restaurant_limit");
  });

  it("never blocks a resubmission of an order that already exists", () => {
    expect(
      pendingOrderCapDecision({
        alreadySubmitted: true,
        pendingForPhone: 99,
        pendingForRestaurant: 999
      })
    ).toBe("allowed");
  });
});
