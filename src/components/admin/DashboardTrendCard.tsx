import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { DashboardTrend, DashboardTrendRange, Restaurant } from "@/lib/types";

export type DashboardTrendMetric = "sales" | "orders";

const rangeOptions: Array<{
  value: DashboardTrendRange;
  label: string;
  heading: string;
}> = [
  { value: "7d", label: "7 days", heading: "Last 7 days" },
  { value: "30d", label: "30 days", heading: "Last 30 days" },
  { value: "mtd", label: "This month", heading: "This month" }
];

const metricOptions: Array<{ value: DashboardTrendMetric; label: string }> = [
  { value: "sales", label: "Sales" },
  { value: "orders", label: "Orders" }
];

function trendHref(metric: DashboardTrendMetric, range: DashboardTrendRange) {
  return `/admin?metric=${metric}&range=${range}`;
}

// Carries the selected window into /admin/reports, which owns arbitrary
// period exploration (custom dates, payments/products/customers tabs, export).
function reportsHref(range: DashboardTrendRange, trend: DashboardTrend) {
  if (range === "mtd") {
    return "/admin/reports?preset=this_month&tab=sales";
  }
  if (range === "30d") {
    const start = trend.days[0]?.date;
    const end = trend.days[trend.days.length - 1]?.date;
    if (start && end) {
      return `/admin/reports?preset=custom&start=${start}&end=${end}&tab=sales`;
    }
  }
  return "/admin/reports?preset=last_7_days&tab=sales";
}

function pillClass(active: boolean) {
  return `focus-ring rounded-full px-3 py-1 text-xs font-bold transition ${
    active
      ? "bg-ink text-white"
      : "border border-stone-200 text-stone-500 hover:border-stone-300 hover:text-ink"
  }`;
}

function weekdayLabel(isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString("en-GB", { weekday: "short" });
}

function dayOfMonth(isoDate: string) {
  return Number(isoDate.slice(8, 10));
}

function isMonday(isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.getDay() === 1;
}

export function DashboardTrendCard({
  trend,
  restaurant,
  range,
  metric
}: {
  trend: DashboardTrend;
  restaurant: Restaurant;
  range: DashboardTrendRange;
  metric: DashboardTrendMetric;
}) {
  const values = trend.days.map((day) => (metric === "sales" ? day.sales : day.orders));
  const max = Math.max(...values, 0);
  const compact = trend.days.length > 10;
  const heading =
    rangeOptions.find((option) => option.value === range)?.heading ?? "Last 7 days";
  const lastIndex = trend.days.length - 1;

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black">{heading}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1" role="group" aria-label="Chart metric">
            {metricOptions.map((option) => (
              <Link
                aria-current={metric === option.value ? "page" : undefined}
                className={pillClass(metric === option.value)}
                href={trendHref(option.value, range)}
                key={option.value}
              >
                {option.label}
              </Link>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Chart period">
            {rangeOptions.map((option) => (
              <Link
                aria-current={range === option.value ? "page" : undefined}
                className={pillClass(range === option.value)}
                href={trendHref(metric, option.value)}
                key={option.value}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div
        aria-label={`${metric === "sales" ? "Sales" : "Orders"} per day, ${heading.toLowerCase()}`}
        className={`mt-5 flex h-36 items-end ${compact ? "gap-[3px]" : "gap-2 sm:gap-3"}`}
        role="img"
      >
        {trend.days.map((day, index) => {
          const value = metric === "sales" ? day.sales : day.orders;
          const pct = max > 0 ? (value / max) * 100 : 0;
          const isToday = index === lastIndex;
          const label =
            metric === "sales"
              ? formatCurrency(Math.round(day.sales), restaurant)
              : String(day.orders);

          return (
            <div
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1 self-stretch"
              key={day.date}
              title={`${day.date}: ${label}`}
            >
              {!compact ? (
                <span className="max-w-full truncate text-[11px] font-semibold text-stone-400">
                  {metric === "sales" ? Math.round(day.sales).toLocaleString() : day.orders}
                </span>
              ) : null}
              <div
                className={`w-full rounded-t ${compact ? "" : "max-w-11"} ${
                  isToday ? "bg-leaf" : "bg-leaf/40"
                }`}
                style={{ height: `${pct}%`, minHeight: "3px" }}
              />
              <span
                className={`h-4 truncate text-[11px] ${
                  isToday ? "font-bold text-stone-600" : "font-semibold text-stone-400"
                }`}
              >
                {compact
                  ? isToday || isMonday(day.date)
                    ? dayOfMonth(day.date)
                    : " "
                  : isToday
                    ? "Today"
                    : weekdayLabel(day.date)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
        <p className="text-xs font-medium text-stone-500">
          {trend.topItem
            ? `Top seller in this period: ${trend.topItem} · ${trend.topItemQuantity} sold`
            : "No completed sales in this period yet"}
        </p>
        <Link
          className="focus-ring flex items-center gap-1 rounded text-xs font-black text-leaf"
          href={reportsHref(range, trend)}
        >
          All periods
          <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}
