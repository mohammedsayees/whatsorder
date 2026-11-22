import { describe, expect, it } from "vitest";
import { reconcileCartWithMenu } from "./cart-reconcile";
import type { ResolvedOptionGroup } from "./menu-option-groups";

const item = (id: string, price: number, available = true) =>
  ({ id, category_id: "c", name: id, name_ar: null, price, is_available: available, is_featured: false,
    description: null, description_ar: null, image_url: null }) as never;
const sizeGroups: ResolvedOptionGroup[] = [{
  group: { id: "size", name: "Size", name_ar: null, min_select: 1, max_select: 1, display_order: 0 },
  options: [
    { id: "m", group_id: "size", name: "Medium", name_ar: null, price_delta: 1, is_available: true, display_order: 0 },
    { id: "l", group_id: "size", name: "Large", name_ar: null, price_delta: 3, is_available: true, display_order: 1 }
  ]
}];
const medium = { option_id: "m", group_id: "size", name: "Medium", price_delta: 1 };

describe("reconcileCartWithMenu", () => {
  it("refreshes prices and option deltas from the live menu", () => {
    const result = reconcileCartWithMenu(
      [{ item_id: "karak", name: "karak", price: 2, quantity: 2, options: [{ ...medium, price_delta: 0.5 }] }],
      { items: [item("karak", 1.5)], offers: [], groupsByItemId: new Map([["karak", sizeGroups]]) }
    );
    expect(result.removed).toEqual([]);
    expect(result.repriced).toBe(1);
    expect(result.lines[0]).toMatchObject({ price: 2.5, quantity: 2, options: [{ option_id: "m", price_delta: 1 }] });
    expect(result.changed).toBe(true);
  });

  it("drops sold-out items, ended offers and changed options", () => {
    const result = reconcileCartWithMenu(
      [
        { item_id: "gone", name: "gone", price: 1, quantity: 1 },
        { item_id: "off", name: "off", price: 3, quantity: 1 },
        { item_id: "promo", name: "promo", price: 5, quantity: 1, offer_id: "ended" },
        { item_id: "karak", name: "karak", price: 1, quantity: 1 },
        { item_id: "karak", name: "karak", price: 2, quantity: 1, options: [{ option_id: "x", group_id: "size", name: "XL", price_delta: 1 }] }
      ],
      { items: [item("off", 3, false), item("promo", 5), item("karak", 1)], offers: [], groupsByItemId: new Map([["karak", sizeGroups]]) }
    );
    expect(result.lines).toEqual([]);
    expect(result.removed.map((line) => line.item_id)).toEqual(["gone", "off", "promo", "karak", "karak"]);
  });

  it("leaves an up-to-date cart untouched", () => {
    const lines = [
      { item_id: "water", name: "water", name_ar: null, price: 1, quantity: 3 },
      { item_id: "karak", name: "karak", name_ar: null, price: 2, quantity: 1, options: [{ ...medium, name_ar: null }] }
    ];
    const result = reconcileCartWithMenu(lines, {
      items: [item("water", 1), item("karak", 1)], offers: [], groupsByItemId: new Map([["karak", sizeGroups]])
    });
    expect(result).toEqual({ lines, removed: [], repriced: 0, changed: false });
  });

  it("keeps offer lines while the offer runs, at its price and cap", () => {
    const offer = { id: "o1", menu_item_id: "promo", promotional_price: 4, max_quantity_per_order: 2 } as never;
    const result = reconcileCartWithMenu(
      [{ item_id: "promo", name: "promo", price: 5, quantity: 1, offer_id: "o1", offer_max_quantity: 5 }],
      { items: [item("promo", 6)], offers: [offer], groupsByItemId: new Map() }
    );
    expect(result.lines[0]).toMatchObject({ price: 4, offer_max_quantity: 2 });
  });
});

describe("reconcileNotice", () => {
  it("names removed items and mentions price updates", async () => {
    const { reconcileNotice } = await import("./cart-reconcile");
    const removed = [{ item_id: "a", name: "Karak Tea", name_ar: "كرك", price: 1, quantity: 1 }];
    expect(reconcileNotice({ lines: [], removed, repriced: 1, changed: true }, "en")).toBe(
      "Removed from your cart because it's no longer available or its options changed: Karak Tea. Prices in your cart were updated."
    );
    expect(reconcileNotice({ lines: [], removed, repriced: 0, changed: true }, "ar")).toContain("كرك");
    expect(reconcileNotice({ lines: [], removed: [], repriced: 0, changed: true }, "en")).toBeNull();
  });
});
