import { describe, expect, it } from "vitest";
import { inferServingStyle } from "@/lib/ai/google-image";

describe("inferServingStyle", () => {
  it("maps burgers to a burger box or plate", () => {
    expect(inferServingStyle("Zinger Burger", "Burgers")).toContain("burger");
  });

  it("maps fries to a 550ml takeaway container", () => {
    expect(inferServingStyle("Loaded Fries", "Snacks")).toBe("550ml takeaway container");
  });

  it("maps rolls/porotta/sandwiches/wraps to a paper wrap or plate", () => {
    expect(inferServingStyle("Oman Chips Porotta", "Rolls")).toBe("paper wrap or plate");
    expect(inferServingStyle("Chicken Sandwich", "Snacks")).toBe("paper wrap or plate");
  });

  it("maps hot drinks to a paper cup or glass cup", () => {
    expect(inferServingStyle("Karak Tea", "Tea & Hot Drinks")).toBe("paper cup or glass cup");
    expect(inferServingStyle("Cappuccino", "Coffee")).toBe("paper cup or glass cup");
  });

  it("maps cold drinks to a glass or takeaway cup", () => {
    expect(inferServingStyle("Fresh Lime Juice", "Juices")).toBe("glass or takeaway cup");
    expect(inferServingStyle("Mango Shake", "Shakes")).toBe("glass or takeaway cup");
  });

  it("maps desserts to a dessert plate", () => {
    expect(inferServingStyle("Kunafa", "Desserts")).toBe("dessert plate");
  });

  it("falls back to a restaurant serving plate", () => {
    expect(inferServingStyle("Mystery Special", "Mains")).toBe("restaurant serving plate");
  });

  it("matches on category as well as product name", () => {
    expect(inferServingStyle("House Special", "Loaded Fries")).toBe("550ml takeaway container");
  });
});
