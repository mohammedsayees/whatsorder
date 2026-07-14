import { describe, expect, it } from "vitest";
import {
  isOfferOrderable,
  verifyCartAgainstMenu,
  verifyCombinedOfferLimits
} from "./order-pricing";
import type {
  CartLine,
  CartLineOption,
  MenuItem,
  MenuOffer,
  MenuOptionCatalog,
  MenuWithCategories
} from "./types";

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

describe("verifyCombinedOfferLimits", () => {
  it("rejects an addition that takes an amended order over its offer cap", () => {
    const existing = offerCartLine();
    const added = offerCartLine().map((line) => ({ ...line, quantity: 4 }));

    const result = verifyCombinedOfferLimits(existing, added, [
      buildOffer({ max_quantity_per_order: 5 })
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("limited to 5");
    }
  });

  it("allows an addition whose combined offer quantity remains within the cap", () => {
    const existing = offerCartLine();
    const added = offerCartLine().map((line) => ({ ...line, quantity: 3 }));

    expect(
      verifyCombinedOfferLimits(existing, added, [
        buildOffer({ max_quantity_per_order: 5 })
      ])
    ).toEqual({ ok: true });
  });
});

// ── Option groups ────────────────────────────────────────────────────────────

function buildCatalog(overrides: Partial<MenuOptionCatalog> = {}): MenuOptionCatalog {
  return {
    groups: [
      {
        id: "grp-size",
        restaurant_id: RESTAURANT_ID,
        name: "Size",
        name_ar: null,
        min_select: 1,
        max_select: 1,
        display_order: 0,
        created_at: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "grp-extras",
        restaurant_id: RESTAURANT_ID,
        name: "Extras",
        name_ar: null,
        min_select: 0,
        max_select: 2,
        display_order: 1,
        created_at: "2026-01-01T00:00:00.000Z"
      }
    ],
    options: [
      {
        id: "opt-small",
        restaurant_id: RESTAURANT_ID,
        group_id: "grp-size",
        name: "Small",
        name_ar: null,
        price_delta: 0,
        is_available: true,
        display_order: 0,
        created_at: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "opt-large",
        restaurant_id: RESTAURANT_ID,
        group_id: "grp-size",
        name: "Large",
        name_ar: "كبير",
        price_delta: 3,
        is_available: true,
        display_order: 1,
        created_at: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "opt-saffron",
        restaurant_id: RESTAURANT_ID,
        group_id: "grp-extras",
        name: "Add saffron",
        name_ar: null,
        price_delta: 2,
        is_available: true,
        display_order: 0,
        created_at: "2026-01-01T00:00:00.000Z"
      }
    ],
    links: [
      {
        id: "link-1",
        restaurant_id: RESTAURANT_ID,
        menu_item_id: "item-1",
        group_id: "grp-size",
        display_order: 0
      },
      {
        id: "link-2",
        restaurant_id: RESTAURANT_ID,
        menu_item_id: "item-1",
        group_id: "grp-extras",
        display_order: 1
      }
    ],
    ...overrides
  };
}

function optionLine(
  options: CartLineOption[],
  overrides: Partial<CartLine> = {}
): CartLine {
  return {
    item_id: "item-1",
    name: "Karak Chai",
    name_ar: null,
    quantity: 1,
    price: 0,
    options,
    ...overrides
  };
}

const largeSelection: CartLineOption = {
  option_id: "opt-large",
  group_id: "grp-size",
  name: "Large",
  name_ar: null,
  price_delta: 3
};

const smallSelection: CartLineOption = {
  option_id: "opt-small",
  group_id: "grp-size",
  name: "Small",
  name_ar: null,
  price_delta: 0
};

const saffronSelection: CartLineOption = {
  option_id: "opt-saffron",
  group_id: "grp-extras",
  name: "Add saffron",
  name_ar: null,
  price_delta: 2
};

describe("verifyCartAgainstMenu option verification", () => {
  it("re-prices from DB deltas, ignoring forged client values", () => {
    const forged = [
      optionLine([
        { ...largeSelection, price_delta: -999 },
        { ...saffronSelection, price_delta: -999 }
      ])
    ];
    const result = verifyCartAgainstMenu(forged, buildMenu(), [], buildCatalog());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0].price).toBe(10); // 5 base + 3 large + 2 saffron
      expect(result.items[0].options).toEqual([
        expect.objectContaining({ option_id: "opt-large", price_delta: 3 }),
        expect.objectContaining({ option_id: "opt-saffron", price_delta: 2 })
      ]);
    }
  });

  it("applies option deltas on top of an offer's promotional price", () => {
    const result = verifyCartAgainstMenu(
      [optionLine([largeSelection], { offer_id: "offer-1", quantity: 2 })],
      buildMenu(),
      [buildOffer()],
      buildCatalog()
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0].price).toBe(6); // 3 promo + 3 large
      expect(result.subtotal).toBe(12);
    }
  });

  it("rejects an option from a group not linked to the item", () => {
    const catalog = buildCatalog();
    catalog.links = catalog.links.filter((link) => link.group_id !== "grp-extras");
    const result = verifyCartAgainstMenu(
      [optionLine([smallSelection, saffronSelection])],
      buildMenu(),
      [],
      catalog
    );

    expect(result.ok).toBe(false);
  });

  it("rejects an unavailable option", () => {
    const catalog = buildCatalog();
    catalog.options = catalog.options.map((option) =>
      option.id === "opt-large" ? { ...option, is_available: false } : option
    );
    const result = verifyCartAgainstMenu(
      [optionLine([largeSelection])],
      buildMenu(),
      [],
      catalog
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a line missing its required variant group", () => {
    const result = verifyCartAgainstMenu(
      [optionLine([])],
      buildMenu(),
      [],
      buildCatalog()
    );

    expect(result.ok).toBe(false);
  });

  it("skips a required group whose options are all unavailable", () => {
    const catalog = buildCatalog();
    catalog.options = catalog.options.map((option) =>
      option.group_id === "grp-size" ? { ...option, is_available: false } : option
    );
    const result = verifyCartAgainstMenu(
      [optionLine([])],
      buildMenu(),
      [],
      catalog
    );

    expect(result.ok).toBe(true);
  });

  it("rejects selections beyond a group's max_select", () => {
    const result = verifyCartAgainstMenu(
      [optionLine([smallSelection, largeSelection])],
      buildMenu(),
      [],
      buildCatalog()
    );

    expect(result.ok).toBe(false); // Size is min 1 / max 1
  });

  it("rejects duplicate options on one line", () => {
    const result = verifyCartAgainstMenu(
      [optionLine([smallSelection, { ...saffronSelection }, { ...saffronSelection }])],
      buildMenu(),
      [],
      buildCatalog()
    );

    expect(result.ok).toBe(false);
  });

  it("clamps a negative-delta unit price at zero", () => {
    const catalog = buildCatalog();
    catalog.options = catalog.options.map((option) =>
      option.id === "opt-small" ? { ...option, price_delta: -20 } : option
    );
    const result = verifyCartAgainstMenu(
      [optionLine([{ ...smallSelection, price_delta: -20 }])],
      buildMenu(),
      [],
      catalog
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0].price).toBe(0);
    }
  });

  it("enforces the offer cap on the aggregate across configured lines", () => {
    const offer = buildOffer({ max_quantity_per_order: 2 });
    const result = verifyCartAgainstMenu(
      [
        optionLine([smallSelection], { offer_id: "offer-1", quantity: 2 }),
        optionLine([largeSelection], { offer_id: "offer-1", quantity: 2 })
      ],
      buildMenu(),
      [offer],
      buildCatalog()
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("limited to 2");
    }
  });

  it("leaves legacy optionless carts untouched when the item has no groups", () => {
    const result = verifyCartAgainstMenu(
      [
        {
          item_id: "item-1",
          name: "Karak Chai",
          name_ar: null,
          quantity: 1,
          price: 5
        }
      ],
      buildMenu(),
      [],
      { groups: [], options: [], links: [] }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0].price).toBe(5);
      expect(result.items[0]).not.toHaveProperty("options");
    }
  });
});
