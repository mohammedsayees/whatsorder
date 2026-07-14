import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("restaurant operational reliability boundaries", () => {
  it("prints independently of audit telemetry persistence", () => {
    const printActions = source("src/components/admin/OrderPrintActions.tsx");
    const printFunction = printActions.slice(printActions.indexOf("function print("));
    const printSchedule = printFunction.indexOf("window.setTimeout(() =>");
    const trackingCall = printFunction.indexOf("void recordOrderPrintEventsAction(");

    expect(printSchedule).toBeGreaterThan(-1);
    expect(trackingCall).toBeGreaterThan(printSchedule);
    expect(printActions).toContain(
      'setPrintError("The print opened, but tracking could not be saved.")'
    );
  });

  it("keeps browser storage failures from crashing cart hydration and writes", () => {
    const cartProvider = source("src/components/customer/CartProvider.tsx");

    expect(cartProvider).toContain("parseAndValidateCart(saved)");
    expect(cartProvider).toContain("window.localStorage.removeItem(storageKey)");
    expect(cartProvider).toContain("setIsReady(true)");
    expect(cartProvider).toContain('window.addEventListener("storage", handleStorage)');
  });

  it("serializes only the public feedback DTO", () => {
    const feedback = source("src/lib/feedback.ts");
    const types = source("src/lib/types.ts");

    expect(feedback).toContain(
      '.select("id,rating,comment,customer_display_name")'
    );
    expect(types).toContain("export type PublicCustomerFeedback = Pick<");
    expect(types).toContain("reviews: PublicCustomerFeedback[]");
  });
});
