import { describe, expect, it } from "vitest";
import {
  asOnlinePaymentFilter,
  buildOnlinePaymentsReport,
  onlinePaymentsToCsv,
  orderReference,
  type OnlinePaymentOrderRow
} from "@/lib/online-payments-report";

function row(overrides: Partial<OnlinePaymentOrderRow>): OnlinePaymentOrderRow {
  return {
    id: "8baae95d-d124-4ba7-a832-ac69273afd84",
    customer_name: "Aisha",
    fulfilment_type: "delivery",
    total: "12.50",
    status: "Completed",
    online_payment_status: "paid",
    online_paid_at: "2026-11-23T05:00:00Z",
    created_at: "2026-11-23T04:58:00Z",
    ...overrides
  };
}

describe("online payments report", () => {
  it("uses the reference customers see", () => {
    expect(orderReference("8baae95d-d124-4ba7-a832-ac69273afd84")).toBe("273AFD84");
  });

  it("totals each status bucket and keeps money exact", () => {
    const report = buildOnlinePaymentsReport([
      row({ id: "a-00000001", total: "10.10" }),
      row({ id: "a-00000002", total: 0.2 }),
      row({ id: "a-00000003", online_payment_status: "pending", status: "New", total: 5, online_paid_at: null }),
      row({ id: "a-00000004", online_payment_status: "expired", total: 7, online_paid_at: null }),
      row({ id: "a-00000005", online_payment_status: "failed", total: 3, online_paid_at: null }),
      row({ id: "a-00000006", online_payment_status: "refunded", total: 9 })
    ]);

    expect(report.paid).toEqual({ count: 2, amount: 10.3 });
    expect(report.pending).toEqual({ count: 1, amount: 5 });
    expect(report.notCompleted).toEqual({ count: 2, amount: 10 });
    expect(report.refunded).toEqual({ count: 1, amount: 9 });
    expect(report.collected).toBe(10.3);
    expect(report.entries).toHaveLength(6);
  });

  it("does not count a cancelled order as still awaiting payment", () => {
    const report = buildOnlinePaymentsReport([
      row({ online_payment_status: "pending", status: "Cancelled", online_paid_at: null })
    ]);
    expect(report.pending.count).toBe(0);
    expect(report.notCompleted.count).toBe(1);
    expect(report.entries[0].paymentLabel).toBe("Online payment not completed");
  });

  it("ignores cash orders and unknown statuses", () => {
    const report = buildOnlinePaymentsReport([
      row({ online_payment_status: null }),
      row({ online_payment_status: "weird" })
    ]);
    expect(report.entries).toHaveLength(0);
    expect(report.paid.count).toBe(0);
  });

  it("filters the list but keeps period totals, newest first", () => {
    const rows = [
      row({ id: "b-00000001", created_at: "2026-11-23T04:00:00Z" }),
      row({ id: "b-00000002", created_at: "2026-11-23T06:00:00Z" }),
      row({ id: "b-00000003", online_payment_status: "expired", online_paid_at: null })
    ];
    const paid = buildOnlinePaymentsReport(rows, "paid");
    expect(paid.entries.map((entry) => entry.orderId)).toEqual(["b-00000002", "b-00000001"]);
    expect(paid.notCompleted.count).toBe(1);
    expect(buildOnlinePaymentsReport(rows, "not_completed").entries.map((entry) => entry.orderId)).toEqual([
      "b-00000003"
    ]);
  });

  it("accepts only known filters from the URL", () => {
    expect(asOnlinePaymentFilter("refunded")).toBe("refunded");
    expect(asOnlinePaymentFilter("drop table")).toBe("all");
    expect(asOnlinePaymentFilter(undefined)).toBe("all");
  });

  it("exports CSV with formula-safe customer names", () => {
    const report = buildOnlinePaymentsReport([row({ customer_name: "=HYPERLINK(\"x\")" })]);
    const csv = onlinePaymentsToCsv(report, (value) => `T${value.slice(11, 16)}`);
    const [header, line] = csv.split("\n");
    expect(header).toBe("Placed,Order reference,Customer,Fulfilment,Amount,Online payment,Paid at,Order status");
    expect(line).toContain("273AFD84");
    expect(line).toContain("12.50");
    expect(line).toContain("Paid online");
    expect(line).toContain("T05:00");
    expect(line).toContain("'=HYPERLINK");
  });
});
