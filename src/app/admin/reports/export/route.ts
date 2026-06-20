import { getCustomersForReport, getOrdersForReport } from "@/lib/data";
import {
  buildRestaurantReport,
  reportToCsv,
  resolveReportRange,
  type ReportTab
} from "@/lib/reports";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

const exportableTabs: ReportTab[] = [
  "overview",
  "sales",
  "payments",
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
    url.searchParams.get("end") ?? undefined
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
  const csv = reportToCsv(tab, buildRestaurantReport(orders, customers));
  const filename = `whatsorder-${restaurant.slug}-${tab}-${range.startDate}-to-${range.endDate}.csv`;

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
