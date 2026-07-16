import Link from "next/link";
import { Download, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantDate, formatRestaurantShortDateTime } from "@/lib/date-time";
import {
  getCustomersForReport,
  getOrdersForReport
} from "@/lib/data";
import {
  buildRestaurantReport,
  getFulfilmentReportLabel,
  resolveReportRange,
  type ReportPreset,
  type ReportTab
} from "@/lib/reports";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

const reportTabs: Array<{ label: string; value: ReportTab }> = [
  { label: "Overview", value: "overview" },
  { label: "Sales", value: "sales" },
  { label: "Payments", value: "payments" },
  { label: "Products", value: "products" },
  { label: "Customers", value: "customers" },
  { label: "Fulfilment", value: "fulfilment" }
];

const presets: Array<{ label: string; value: ReportPreset }> = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last_7_days" },
  { label: "This month", value: "this_month" },
  { label: "Previous month", value: "previous_month" },
  { label: "Custom", value: "custom" }
];

function reportHref(
  tab: ReportTab,
  range: ReturnType<typeof resolveReportRange>
) {
  const query = new URLSearchParams({
    end: range.endDate,
    preset: range.preset,
    start: range.startDate,
    tab
  });
  return `/admin/reports?${query.toString()}`;
}

function PercentageBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
      <div
        className="h-full rounded-full bg-leaf"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function EmptyReport() {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <p className="font-black">No completed sales in this period</p>
      <p className="mt-1 text-sm text-stone-500">
        Choose another date range or complete an order to populate this report.
      </p>
    </div>
  );
}

export default async function AdminReportsPage({
  searchParams
}: {
  searchParams: Promise<{
    end?: string;
    preset?: string;
    start?: string;
    tab?: string;
  }>;
}) {
  const [{ restaurant }, query] = await Promise.all([
    requireRestaurantRole(["restaurant_admin", "owner", "manager"]),
    searchParams
  ]);
  const money = (value: number) => formatCurrency(value, restaurant);
  const formatDate = (value: string | Date) => formatRestaurantDate(value, restaurant);
  const formatDateTime = (value: string | Date) =>
    formatRestaurantShortDateTime(value, restaurant);
  const activeTab = reportTabs.some((tab) => tab.value === query.tab)
    ? (query.tab as ReportTab)
    : "overview";
  const range = resolveReportRange(
    query.preset,
    query.start,
    query.end,
    new Date(),
    restaurant
  );
  const orders = await getOrdersForReport(
    restaurant.id,
    range.startIso,
    range.endExclusiveIso
  );
  const customerPhones = [
    ...new Set(
      orders
        .filter((order) => order.status === "Completed")
        .map((order) => order.customer_phone)
    )
  ];
  const customers = await getCustomersForReport(restaurant.id, customerPhones);
  const report = buildRestaurantReport(orders, customers, restaurant);
  const exportQuery = new URLSearchParams({
    end: range.endDate,
    preset: range.preset,
    start: range.startDate,
    tab: activeTab
  });
  const maximumDailySales = Math.max(
    1,
    ...report.salesRows.map((row) => row.sales)
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black">Reports</h1>
          <p className="mt-2 text-stone-600">
            Completed-order reporting in UAE time. Payment values show selected methods, not bank
            settlement.
          </p>
        </div>
        <a
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-black text-white"
          href={`/admin/reports/export?${exportQuery.toString()}`}
        >
          <Download size={17} />
          Export {reportTabs.find((tab) => tab.value === activeTab)?.label} CSV
        </a>
      </div>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {presets.map((preset) => (
            <Link
              aria-current={range.preset === preset.value ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-2 text-sm font-black ${
                range.preset === preset.value
                  ? "bg-ink text-white"
                  : "bg-stone-100 text-stone-600"
              }`}
              href={`/admin/reports?tab=${activeTab}&preset=${preset.value}${
                preset.value === "custom"
                  ? `&start=${range.startDate}&end=${range.endDate}`
                  : ""
              }`}
              key={preset.value}
            >
              {preset.label}
            </Link>
          ))}
        </div>

        <form className="mt-4 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-[1fr_1fr_auto]" method="get">
          <input name="tab" type="hidden" value={activeTab} />
          <input name="preset" type="hidden" value="custom" />
          <label className="text-sm font-bold text-stone-600">
            From
            <input
              className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5"
              defaultValue={range.startDate}
              name="start"
              required
              type="date"
            />
          </label>
          <label className="text-sm font-bold text-stone-600">
            To
            <input
              className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5"
              defaultValue={range.endDate}
              name="end"
              required
              type="date"
            />
          </label>
          <button
            className="self-end rounded-lg bg-leaf px-5 py-2.5 text-sm font-black text-white"
            type="submit"
          >
            Apply dates
          </button>
        </form>
        <p className="mt-3 text-sm font-semibold text-stone-500">
          Reporting period: {range.label}
        </p>
      </section>

      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Report type">
        {reportTabs.map((tab) => (
          <Link
            aria-current={activeTab === tab.value ? "page" : undefined}
            className={`shrink-0 rounded-lg border px-4 py-2.5 text-sm font-black ${
              activeTab === tab.value
                ? "border-leaf bg-mint text-leaf"
                : "border-stone-200 bg-white text-stone-600"
            }`}
            href={reportHref(tab.value, range)}
            key={tab.value}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Completed orders", report.completedOrders],
          ["Completed sales", money(report.sales)],
          ["Average order", money(report.averageOrderValue)],
          ["Cancelled orders", report.cancelledOrders]
        ].map(([label, value]) => (
          <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={label}>
            <p className="text-sm font-bold text-stone-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
          </div>
        ))}
      </section>

      <div className="mt-5">
        {activeTab === "overview" ? (
          report.completedOrders === 0 ? (
            <EmptyReport />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <h2 className="font-black">Sales trend</h2>
                <div className="mt-4 space-y-4">
                  {report.salesRows.map((row) => (
                    <div key={row.date}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold">{formatDate(`${row.date}T00:00:00+04:00`)}</span>
                        <span className="font-black">{money(row.sales)}</span>
                      </div>
                      <PercentageBar value={(row.sales / maximumDailySales) * 100} />
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <h2 className="font-black">Top products</h2>
                <div className="mt-4 space-y-3">
                  {report.productRows.slice(0, 5).map((product) => (
                    <div className="flex items-center justify-between gap-3" key={product.itemId}>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-50 text-sm font-black text-amber-700">
                          {product.rank}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-black">{product.name}</p>
                          <p className="text-xs text-stone-500">{product.quantity} sold</p>
                        </div>
                      </div>
                      <span className="font-black">{money(product.sales)}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <h2 className="font-black">Fulfilment mix</h2>
                <div className="mt-4 space-y-4">
                  {report.fulfilmentRows.map((row) => (
                    <div key={row.fulfilment}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="font-bold">{getFulfilmentReportLabel(row.fulfilment)}</span>
                        <span className="font-black">{row.orderCount} · {money(row.amount)}</span>
                      </div>
                      <PercentageBar value={row.salesShare} />
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <h2 className="font-black">Customer summary</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-stone-50 p-3">
                    <p className="text-stone-500">Unique customers</p>
                    <p className="text-xl font-black">{report.uniqueCustomers}</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-3">
                    <p className="text-stone-500">Repeat in period</p>
                    <p className="text-xl font-black">{report.repeatCustomers}</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-3">
                    <p className="text-stone-500">One order in period</p>
                    <p className="text-xl font-black">{report.newCustomers}</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-3">
                    <p className="text-stone-500">Marketing consent</p>
                    <p className="text-xl font-black">{report.marketingConsentCustomers}</p>
                  </div>
                </div>
              </section>
            </div>
          )
        ) : null}

        {activeTab === "sales" ? (
          report.salesRows.length === 0 ? (
            <EmptyReport />
          ) : (
            <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Orders</th>
                      <th className="px-4 py-3">Sales</th>
                      <th className="px-4 py-3">Average order</th>
                      <th className="px-4 py-3">Delivery fees</th>
                      <th className="px-4 py-3">Discounts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {report.salesRows.map((row) => (
                      <tr key={row.date}>
                        <td className="px-4 py-3 font-bold">{formatDate(`${row.date}T00:00:00+04:00`)}</td>
                        <td className="px-4 py-3">{row.orders}</td>
                        <td className="px-4 py-3 font-black">{money(row.sales)}</td>
                        <td className="px-4 py-3">{money(row.averageOrderValue)}</td>
                        <td className="px-4 py-3">{money(row.deliveryFees)}</td>
                        <td className="px-4 py-3">{money(row.discounts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        ) : null}

        {activeTab === "payments" ? (
          report.paymentRows.length === 0 ? (
            <EmptyReport />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {report.paymentRows.map((row) => (
                <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm" key={row.method}>
                  <h2 className="font-black">{row.method}</h2>
                  <p className="mt-3 text-2xl font-black">{money(row.amount)}</p>
                  <p className="mt-1 text-sm text-stone-500">{row.orderCount} completed orders · {row.salesShare.toFixed(1)}% of sales</p>
                  <PercentageBar value={row.salesShare} />
                </section>
              ))}
            </div>
          )
        ) : null}

        {activeTab === "products" ? (
          report.productRows.length === 0 ? (
            <EmptyReport />
          ) : (
            <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Qty sold</th>
                      <th className="px-4 py-3">Orders</th>
                      <th className="px-4 py-3">Sales</th>
                      <th className="px-4 py-3">Avg price</th>
                      <th className="px-4 py-3">Share</th>
                      <th className="px-4 py-3">Last sold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {report.productRows.map((row) => (
                      <tr key={row.itemId}>
                        <td className="px-4 py-3 font-black">#{row.rank}</td>
                        <td className="px-4 py-3 font-black">{row.name}</td>
                        <td className="px-4 py-3">{row.quantity}</td>
                        <td className="px-4 py-3">{row.orderCount}</td>
                        <td className="px-4 py-3 font-black">{money(row.sales)}</td>
                        <td className="px-4 py-3">{money(row.averageSellingPrice)}</td>
                        <td className="px-4 py-3">{row.salesShare.toFixed(1)}%</td>
                        <td className="px-4 py-3">{formatDateTime(row.lastSoldAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        ) : null}

        {activeTab === "customers" ? (
          report.customerRows.length === 0 ? (
            <EmptyReport />
          ) : (
            <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Orders in period</th>
                      <th className="px-4 py-3">Spend</th>
                      <th className="px-4 py-3">Marketing consent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {report.customerRows.map((row) => (
                      <tr key={row.phone}>
                        <td className="px-4 py-3 font-black">{row.name}</td>
                        <td className="px-4 py-3">{row.phone}</td>
                        <td className="px-4 py-3">{row.completedOrders}</td>
                        <td className="px-4 py-3 font-black">{money(row.spend)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.marketingConsent ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                            {row.marketingConsent ? "Opted in" : "Not opted in"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        ) : null}

        {activeTab === "fulfilment" ? (
          report.fulfilmentRows.length === 0 ? (
            <EmptyReport />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {report.fulfilmentRows.map((row) => (
                <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm" key={row.fulfilment}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-black">{getFulfilmentReportLabel(row.fulfilment)}</h2>
                    <TrendingUp className="text-leaf" size={18} />
                  </div>
                  <p className="mt-3 text-2xl font-black">{money(row.amount)}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {row.orderCount} orders · {money(row.averageOrderValue)} average
                  </p>
                  <PercentageBar value={row.salesShare} />
                  <p className="mt-2 text-xs font-bold text-stone-500">{row.salesShare.toFixed(1)}% of completed sales</p>
                </section>
              ))}
            </div>
          )
        ) : null}
      </div>

      <p className="mt-5 text-xs leading-5 text-stone-500">
        Reports are generated from the current order records at {formatDateTime(new Date())}.
        Product revenue uses the item names and prices saved with each order, so later menu edits do
        not rewrite historical sales.
      </p>
    </main>
  );
}
