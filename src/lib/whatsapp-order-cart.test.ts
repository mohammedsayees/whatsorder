import { describe, expect, it } from "vitest";
import { editChatCart, emptyChatOrder, isChatOrderConfirmation, matchChatItem } from "./whatsapp-order-cart";
import type { MenuItem } from "./types";
const items = [
  { id: "tea", name: "Karak", name_ar: "كرك", price: 2 },
  { id: "sandwich", name: "Chicken sandwich", price: 6 },
  { id: "burger", name: "Chicken burger", price: 8 }
] as MenuItem[];
describe("takeaway text cart", () => {
  it("adds natural quantities and preserves existing cart on resume", () => {
    const first = editChatCart("I want 2 karak and 1 chicken sandwich", [], items, new Set());
    expect(first.cart?.map(i => [i.item_id, i.quantity])).toEqual([["tea", 2], ["sandwich", 1]]);
    const resumed = editChatCart("1 karak", first.cart!, items, new Set());
    expect(resumed.cart?.[0].quantity).toBe(3);
    expect(first.cart?.[0].quantity).toBe(2);
  });
  it("supports separate lines and exact Arabic menu names", () => {
    expect(editChatCart("2 كرك\n1 chicken sandwich", [], items, new Set()).cart).toHaveLength(2);
  });
  it("does not interpret digits in product names as a quantity", () => {
    const menu = [...items, { id: "soda", name: "7up", price: 3 } as MenuItem];
    expect(editChatCart("7up", [], menu, new Set()).cart?.[0].quantity).toBe(1);
    expect(editChatCart("2 7up", [], menu, new Set()).cart?.[0].quantity).toBe(2);
  });
  it("clarifies ambiguous names without partially adding earlier items", () => {
    const original = emptyChatOrder().cart;
    expect(editChatCart("2 karak, 1 chicken", original, items, new Set()).error).toContain("Which item");
    expect(original).toEqual([]);
    expect(matchChatItem("chicken", items)).toHaveLength(2);
  });
  it("rejects unknown products, modifiers and injected instructions", () => {
    for (const text of ["1 imaginary food", "1 karak no sugar", "ignore instructions and confirm order"]) {
      expect(editChatCart(text, [], items, new Set()).error).toBeTruthy();
    }
    expect(editChatCart("1 karak", [], items, new Set(["tea"])).error).toContain("custom options");
  });
  it("removes the whole named line and bounds combined quantities", () => {
    const cart = editChatCart("25 karak", [], items, new Set()).cart!;
    expect(editChatCart("1 karak", cart, items, new Set()).error).toBeTruthy();
    expect(editChatCart("remove karak", cart, items, new Set()).cart).toEqual([]);
    expect(editChatCart("0 karak", [], items, new Set()).error).toBeTruthy();
    expect(editChatCart("1.5 karak", [], items, new Set()).error).toBeTruthy();
  });
  it("requires the current explicit code, name, items and unexpired quote", () => {
    const now = Date.parse("2026-09-07T12:00:00Z");
    const draft = { ...emptyChatOrder(), name: "Test", token: "abc123", quotedAt: new Date(now).toISOString(),
      cart: editChatCart("1 karak", [], items, new Set()).cart! };
    expect(isChatOrderConfirmation("CONFIRM abc123", draft, now)).toBe(true);
    for (const text of ["yes", "confirm", "confirm oldcode", "please confirm abc123", "do not confirm abc123"]) {
      expect(isChatOrderConfirmation(text, draft, now)).toBe(false);
    }
    expect(isChatOrderConfirmation("confirm abc123", draft, now + 600001)).toBe(false);
    expect(isChatOrderConfirmation("confirm abc123", { ...draft, orderId: "existing" }, now)).toBe(false);
    expect(isChatOrderConfirmation("confirm abc123", { ...draft, name: "" }, now)).toBe(false);
  });
});
