import { getCustomersForReport, getOrdersForReport } from "@/lib/data";
import {
  buildRestaurantReport,
  csvCell,
  reportToCsv,
  resolveReportRange,
  type ReportTab
} from "@/lib/reports";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { getOtherIncomeForReport } from "@/lib/business-day-data";
import { otherIncomeCategoryLabels, otherIncomePaymentLabels } from "@/lib/business-day";

const exportableTabs: ReportTab[] = [
  "overview",
  "sales",
  "payments",
  "other_income",
  "products",
  "customers",
  "fulfilment"
];

export async function GET(request: Request) {
  const { restaurant } = await requireRestaurantRole([
    "restaurant_admin",
    "owner",
    "manager"
  ]);
  const url = new URL(request.url);
  const requestedTab = url.searchParams.get("tab");
  const tab = exportableTabs.includes(requestedTab as ReportTab)
    ? (requestedTab as ReportTab)
    : "overview";
  const range = resolveReportRange(
    url.searchParams.get("preset") ?? undefined,
    url.searchParams.get("start") ?? undefined,
    url.searchParams.get("end") ?? undefined,
    new Date(),
    restaurant
  );
  const orders = await getOrdersForReport(
    restaurant.id,
    range.startIso,
    range.endExclusiveIso
  );
  const phones = [
    ...new Set(
      orders
        .filter((order) => order.status === "Completed")
        .map((order) => order.customer_phone)
    )
  ];
  const customers = await getCustomersForReport(restaurant.id, phones);
  const csv = tab === "other_income"
    ? [
        ["Recorded", "Category", "Description", "Payment method", "Reference", "Amount"],
        ...(await getOtherIncomeForReport(
          restaurant.id, range.startIso, range.endExclusiveIso
        )).map((entry) => [
          entry.recorded_at,
          otherIncomeCategoryLabels[entry.category],
          entry.description,
          otherIncomePaymentLabels[entry.payment_method],
          entry.reference ?? "",
          Number(entry.amount).toFixed(2)
        ])
      ].map((row) => row.map(csvCell).join(",")).join("\n")
    : reportToCsv(tab, buildRestaurantReport(orders, customers, restaurant));
  const filename = `whatsorder-${restaurant.slug}-${tab}-${range.startDate}-to-${range.endDate}.csv`;

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
