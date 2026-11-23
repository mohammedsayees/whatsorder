import { describe, expect, it } from "vitest";
import { buildShareMessage, buildShareUrl } from "@/lib/share-message";

const restaurant = {
  name: "Chai Xpress",
  name_ar: "تشاي إكسبرس",
  address: "Rawdha3, Ajman, UAE",
  address_ar: "الروضة ٣، عجمان",
  delivery_fee: 0,
  currency_code: "AED" as const,
  locale: "en-AE" as const
};
const url = "https://whatsorder.app/r/chaixpress?src=share";

describe("buildShareUrl", () => {
  it("keeps only origin + path and tags the share source", () => {
    expect(buildShareUrl("https://whatsorder.app/r/chaixpress?table=5&type=dine_in#x")).toBe(url);
  });
});

describe("referral share link", () => {
  it("uses the sender's code as the src token", () => {
    expect(buildShareUrl("https://whatsorder.app/r/chaixpress?table=5", "AB12cd")).toBe(
      "https://whatsorder.app/r/chaixpress?src=ref-ab12cd"
    );
  });

  it("falls back to the plain share tag for a missing or malformed code", () => {
    expect(buildShareUrl("https://whatsorder.app/r/chaixpress", null)).toBe(url);
    expect(buildShareUrl("https://whatsorder.app/r/chaixpress", "x y")).toBe(url);
  });

  it("mentions the friend's bonus points in both languages, only when given", () => {
    const base = { restaurant, offers: [], url };
    expect(buildShareMessage({ ...base, language: "en", bonusPoints: 20 })).toContain(
      "Get 20 bonus points on your first order"
    );
    expect(buildShareMessage({ ...base, language: "ar", bonusPoints: 20 })).toContain("20 نقطة مكافأة");
    expect(buildShareMessage({ ...base, language: "en" })).not.toContain("bonus points");
  });
});

describe("buildShareMessage", () => {
  it("English: name, area, pitch, link and WhatsOrder credit", () => {
    const msg = buildShareMessage({ restaurant, language: "en", offers: [], url });
    expect(msg).toContain("Chai Xpress – Rawdha3, Ajman");
    expect(msg).toContain("Order directly from the restaurant");
    expect(msg).toContain(url);
    expect(msg.trimEnd().endsWith("Powered by WhatsOrder")).toBe(true);
  });

  it("Arabic: uses Arabic name, address and copy", () => {
    const msg = buildShareMessage({ restaurant, language: "ar", offers: [], url });
    expect(msg).toContain("تشاي إكسبرس – الروضة ٣، عجمان");
    expect(msg).toContain("اطلب مباشرة من المطعم");
    expect(msg).toContain(url);
  });

  it("falls back to English fields when Arabic ones are missing", () => {
    const msg = buildShareMessage({
      restaurant: { ...restaurant, name_ar: null, address_ar: null },
      language: "ar",
      offers: [],
      url
    });
    expect(msg).toContain("Chai Xpress – Rawdha3, Ajman");
  });

  it("shows the first live offer with its price, localised title", () => {
    const offers = [{ title: "Karak + Samosa", title_ar: "كرك وسمبوسة", promotional_price: 5 }];
    expect(buildShareMessage({ restaurant, language: "en", offers, url })).toContain(
      "🎁 Karak + Samosa ·"
    );
    expect(buildShareMessage({ restaurant, language: "ar", offers, url })).toContain("🎁 كرك وسمبوسة ·");
  });

  it("falls back to free delivery, and omits the line when there is nothing to promote", () => {
    expect(buildShareMessage({ restaurant, language: "en", offers: [], url })).toContain(
      "🚚 Free delivery"
    );
    const paid = buildShareMessage({
      restaurant: { ...restaurant, delivery_fee: 5 },
      language: "en",
      offers: [],
      url
    });
    expect(paid).not.toContain("🎁");
    expect(paid).not.toContain("🚚");
  });
});
