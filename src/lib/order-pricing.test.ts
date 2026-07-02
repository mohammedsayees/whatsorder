import { describe, expect, it } from "vitest";
import { isOfferOrderable, verifyCartAgainstMenu } from "./order-pricing";
import type { CartLine, MenuItem, MenuOffer, MenuWithCategories } from "./types";

const RESTAURANT_ID = "00000000-0000-4000-8000-000000000001";

function buildMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "item-1",
    restaurant_id: RESTAURANT_ID,
    category_id: "category-1",
    name: "Karak Chai",
    name_ar: null,
    description: null,
    description_ar: null,
    price: 5,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  } as MenuItem;
}

function buildOffer(overrides: Partial<MenuOffer> = {}): MenuOffer {
  return {
    id: "offer-1",
    restaurant_id: RESTAURANT_ID,
    menu_item_id: "item-1",
    title: "Karak deal",
    title_ar: null,
    description: null,
    description_ar: null,
    promotional_price: 3,
    max_quantity_per_order: 5,
    starts_at: null,
    ends_at: null,
    display_order: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function buildMenu(): MenuWithCategories {
  return { categories: [], items: [buildMenuItem()] };
}

function offerCartLine(): CartLine[] {
  return [
    {
      item_id: "item-1",
      offer_id: "offer-1",
      name: "Karak Chai",
      name_ar: null,
      quantity: 2,
      price: 3
    }
  ];
}

describe("isOfferOrderable", () => {
  const now = new Date("2026-07-02T12:00:00.000Z");

  it("allows an active offer with no window", () => {
    expect(isOfferOrderable(buildOffer(), now)).toBe(true);
  });

  it("allows an active offer inside its window", () => {
    const offer = buildOffer({
      starts_at: "2026-07-01T00:00:00.000Z",
      ends_at: "2026-07-03T00:00:00.000Z"
    });
    expect(isOfferOrderable(offer, now)).toBe(true);
  });

  it("blocks an inactive offer", () => {
    expect(isOfferOrderable(buildOffer({ is_active: false }), now)).toBe(false);
  });

  it("blocks an offer before its start date", () => {
    const offer = buildOffer({ starts_at: "2026-07-03T00:00:00.000Z" });
    expect(isOfferOrderable(offer, now)).toBe(false);
  });

  it("blocks an offer after its end date", () => {
    const offer = buildOffer({ ends_at: "2026-07-01T23:59:59.000Z" });
    expect(isOfferOrderable(offer, now)).toBe(false);
  });
});

describe("verifyCartAgainstMenu offer windows", () => {
  it("prices an in-window offer at the promotional price", () => {
    const result = verifyCartAgainstMenu(offerCartLine(), buildMenu(), [
      buildOffer()
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0].price).toBe(3);
      expect(result.subtotal).toBe(6);
    }
  });

  it("rejects a cart referencing an expired offer", () => {
    const expired = buildOffer({ ends_at: "2026-01-02T00:00:00.000Z" });
    const result = verifyCartAgainstMenu(offerCartLine(), buildMenu(), [expired]);

    expect(result.ok).toBe(false);
  });

  it("rejects a cart referencing an inactive offer", () => {
    const inactive = buildOffer({ is_active: false });
    const result = verifyCartAgainstMenu(offerCartLine(), buildMenu(), [inactive]);

    expect(result.ok).toBe(false);
  });

  it("rejects a cart referencing an offer that has not started", () => {
    const future = buildOffer({ starts_at: "2100-01-01T00:00:00.000Z" });
    const result = verifyCartAgainstMenu(offerCartLine(), buildMenu(), [future]);

    expect(result.ok).toBe(false);
  });

  it("still prices non-offer lines from the live menu", () => {
    const result = verifyCartAgainstMenu(
      [
        {
          item_id: "item-1",
          name: "Karak Chai",
          name_ar: null,
          quantity: 1,
          price: 0.01
        }
      ],
      buildMenu(),
      []
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0].price).toBe(5);
    }
  });
});
