import { describe, expect, it } from "vitest";
import { submitPrintKinds } from "@/lib/staff-submit-print";

describe("submitPrintKinds", () => {
  it("always prints the KOT for Send KOT", () => {
    expect(submitPrintKinds({ action: "kitchen", printKot: false, printCustomerBill: false })).toEqual(["kot"]);
  });

  it("prints the KOT for a paid sale by default", () => {
    expect(submitPrintKinds({ action: "paid_cash", printKot: true, printCustomerBill: false })).toEqual(["kot"]);
  });

  it("skips the KOT for a paid sale when unticked", () => {
    expect(submitPrintKinds({ action: "paid_card", printKot: false, printCustomerBill: false })).toEqual([]);
  });

  it("prints the bill and KOT together when both are ticked", () => {
    expect(submitPrintKinds({ action: "paid_cash", printKot: true, printCustomerBill: true })).toEqual(["receipt", "kot"]);
  });

  it("prints only the bill when KOT is unticked", () => {
    expect(submitPrintKinds({ action: "paid_credit", printKot: false, printCustomerBill: true })).toEqual(["receipt"]);
  });
});
