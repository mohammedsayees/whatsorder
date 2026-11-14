import { describe, expect, it } from "vitest";

import { directionRuns, hasArabic, paragraphDirection, visualWordOrder } from "./bidi";

describe("bidi", () => {
  it("detects Arabic", () => {
    expect(hasArabic("Karak Chai")).toBe(false);
    expect(hasArabic("شاي كرك")).toBe(true);
  });

  it("takes the paragraph direction from the first strong character", () => {
    expect(paragraphDirection("شاي كرك")).toBe("rtl");
    expect(paragraphDirection("Karak كرك")).toBe("ltr");
    expect(paragraphDirection("12 شاي")).toBe("rtl");
  });

  it("orders a pure Arabic line right to left", () => {
    // Logical: مقهى (1) شاي (2) إكسبريس (3) → visual, left to right: 3 2 1.
    expect(visualWordOrder("مقهى شاي إكسبريس")).toEqual(["إكسبريس", "شاي", "مقهى"]);
  });

  it("keeps Latin runs left to right inside an Arabic line", () => {
    expect(visualWordOrder("مقهى Chai Xpress")).toEqual(["Chai", "Xpress", "مقهى"]);
  });

  it("reverses an Arabic run inside a Latin line", () => {
    expect(visualWordOrder("Karak كرك الأصلي")).toEqual(["Karak", "الأصلي", "كرك"]);
  });

  it("attaches numbers to the surrounding run", () => {
    expect(visualWordOrder("واحد ١٢ اثنان")).toEqual(["اثنان", "١٢", "واحد"]);
    expect(directionRuns("AED 12").runs).toEqual([{ direction: "ltr", words: ["AED", "12"] }]);
  });

  it("leaves Latin text untouched", () => {
    expect(visualWordOrder("The cup Al Ain runs on")).toEqual(["The", "cup", "Al", "Ain", "runs", "on"]);
  });
});
