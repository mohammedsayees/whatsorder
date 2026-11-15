import { describe, expect, it } from "vitest";
import { demoOrders, demoRestaurant } from "@/lib/demo-data";
import { renderKotCorrectionTicket } from "@/lib/order-print";

describe("renderKotCorrectionTicket", () => {
  it("prints only removed quantities with an escaped reason", () => {
    const order = demoOrders[0];
    const removedItems = [{ ...order.items[0], quantity: 1 }];
    const html = renderKotCorrectionTicket({
      order,
      printedAt: "2026-11-15T10:00:00.000Z",
      reason: "Customer requested <remove>",
      removedItems,
      restaurant: demoRestaurant
    });

    expect(html).toContain("KOT CORRECTION / REMOVE");
    expect(html).toContain("REMOVE THESE ITEMS");
    expect(html).toContain("Customer requested &lt;remove&gt;");
    expect(html).toContain(`${removedItems[0].name}`);
    expect(html).not.toContain("ORDER RECEIPT");
  });
});
