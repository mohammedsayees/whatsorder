import { describe, expect, it } from "vitest";
import { orderSource, orderSourceLabel, parseOrderSourceView } from "./order-source";

describe("order source", () => {
  it("labels each source for staff", () => {
    expect(orderSourceLabel("customer")).toBe("Menu link");
    expect(orderSourceLabel("staff")).toBe("Staff");
    expect(orderSourceLabel("whatsapp_chat")).toBe("WhatsApp chat");
  });

  it("treats missing or unknown sources as the customer menu link", () => {
    expect(orderSource({})).toBe("customer");
    expect(orderSource({ source: "whatsapp_chat" })).toBe("whatsapp_chat");
    expect(orderSource({ source: "fax" as never })).toBe("customer");
  });

  it("accepts only known filter values from the URL", () => {
    expect(parseOrderSourceView("whatsapp_chat")).toBe("whatsapp_chat");
    expect(parseOrderSourceView("staff")).toBe("staff");
    expect(parseOrderSourceView(undefined)).toBe("all");
    expect(parseOrderSourceView("'; drop table orders")).toBe("all");
  });
});
