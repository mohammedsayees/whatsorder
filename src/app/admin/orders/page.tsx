import { NotificationDeliveryStatus } from "@/components/admin/NotificationDeliveryStatus";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { OrderList } from "@/components/admin/OrderList";
import { PaginationNav } from "@/components/admin/PaginationNav";
import { CurrentShiftBanner } from "@/components/admin/CurrentShiftBanner";
import {
  getCustomersByPhones,
  getAdminOrdersPage,
  getOrderPaymentChanges,
  type AdminOrderStatusView,
  type OrderFulfilmentView
} from "@/lib/data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { getCurrentShiftView } from "@/lib/shift-data";
import {
  getDeliveryRiders,
  getLatestOrderRiderAssignments
} from "@/lib/rider-data";
import { getCustomerCreditSummariesForOrders } from "@/lib/customer-credit-data";
import { parseOrderSourceView, type OrderSourceView } from "@/lib/order-source";

const primaryStatusTabs: { label: string; value: "active" | "completed" | "cancelled" }[] = [
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" }
];

const operationalStatusOptions: { label: string; value: AdminOrderStatusView }[] = [
  { label: "All statuses", value: "active" },
  { label: "New", value: "new" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Out for delivery", value: "out_for_delivery" }
];

const fulfilmentTabs: { label: string; value: OrderFulfilmentView }[] = [
  { label: "All", value: "all" },
  { label: "Delivery", value: "delivery" },
  { label: "Takeaway", value: "takeaway" },
  { label: "Dine-in", value: "dine_in" },
  { label: "Bring to My Car", value: "car_pickup" }
];

const sourceOptions: { label: string; value: OrderSourceView }[] = [
  { label: "All sources", value: "all" },
  { label: "Menu link", value: "customer" },
  { label: "Staff", value: "staff" },
  { label: "WhatsApp chat", value: "whatsapp_chat" }
];

function positivePage(value?: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function ordersHref({
  fulfilment,
  page = 1,
  q,
  sort,
  source,
  status
}: {
  fulfilment: OrderFulfilmentView;
  page?: number;
  q: string;
  sort: "oldest" | "overdue";
  source: OrderSourceView;
  status: AdminOrderStatusView;
}) {
  const params = new URLSearchParams({ fulfilment, page: String(page), sort, status });
  if (q) params.set("q", q);
  if (source !== "all") params.set("source", source);
  return `/admin/orders?${params.toString()}`;
}

export default async function AdminOrdersPage({
  searchParams
}: {
  searchParams: Promise<{
    fulfilment?: string;
    page?: string;
    q?: string;
    status?: string;
    sort?: string;
    source?: string;
  }>;
}) {
  const [session, query] = await Promise.all([
    requireRestaurantAdmin(),
    searchParams
  ]);
  const { restaurant } = session;
  const allStatusOptions = [...primaryStatusTabs, ...operationalStatusOptions];
  const status = allStatusOptions.some((tab) => tab.value === query.status)
    ? (query.status as AdminOrderStatusView)
    : "active";
  const fulfilment = fulfilmentTabs.some((tab) => tab.value === query.fulfilment)
    ? (query.fulfilment as OrderFulfilmentView)
    : "all";
  const sort = query.sort === "overdue" ? "overdue" : "oldest";
  const source = parseOrderSourceView(query.source);
  const q = query.q?.trim().slice(0, 80) ?? "";
  const requestedPage = positivePage(query.page);
  const isOperational = status !== "completed" && status !== "cancelled";
  const primaryStatus = isOperational ? "active" : status;

  const [ordersPage, currentShift] = await Promise.all([
    getAdminOrdersPage(restaurant.id, {
      fulfilment,
      search: q,
      sort,
      source,
      page: requestedPage,
      pageSize: 25,
      status
    }),
    getCurrentShiftView(session)
  ]);
  if (ordersPage.totalPages > 0 && requestedPage > ordersPage.totalPages) {
    redirect(
      ordersHref({ fulfilment, page: ordersPage.totalPages, q, sort, source, status })
    );
  }

  const orderIds = ordersPage.items.map((order) => order.id);
  const [customers, paymentChanges, riders, riderAssignments, customerCredit] = await Promise.all([
    getCustomersByPhones(
      restaurant.id,
      ordersPage.items.map((order) => order.customer_phone)
    ),
    getOrderPaymentChanges(
      restaurant.id,
      orderIds
    ),
    getDeliveryRiders(restaurant.id),
    getLatestOrderRiderAssignments(restaurant.id, orderIds),
    getCustomerCreditSummariesForOrders(restaurant, ordersPage.items)
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Orders</h1>
          <p className="mt-1 text-sm font-semibold text-stone-500">
            Work the oldest and overdue tickets first.
          </p>
        </div>
        <Link
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-3 font-black text-white"
          href="/admin/orders/new"
        >
          <Plus size={18} />
          New order
        </Link>
      </div>
      <NotificationDeliveryStatus restaurantId={restaurant.id} />
      <CurrentShiftBanner currentShift={currentShift} restaurant={restaurant} />

      <section className="sticky top-0 z-20 mt-4 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex gap-2" aria-label="Order status">
          {primaryStatusTabs.map((tab) => (
            <Link
              aria-current={primaryStatus === tab.value ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-black ${
                primaryStatus === tab.value
                ? "bg-ink text-white shadow-sm"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
              href={ordersHref({ fulfilment, q, sort, source, status: tab.value })}
              key={tab.value}
            >
              {tab.label}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  primaryStatus === tab.value ? "bg-white/20" : "bg-white"
                }`}
              >
                {ordersPage.statusCounts[tab.value]}
              </span>
            </Link>
          ))}
        </div>

        <form
          action="/admin/orders"
          className="mt-3 grid gap-2 border-t border-stone-100 pt-3 sm:grid-cols-2 lg:grid-cols-[minmax(13rem,1fr)_auto_auto_auto_auto_auto]"
          method="get"
          role="search"
        >
          {!isOperational ? <input name="status" type="hidden" value={status} /> : null}
          <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search orders</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                size={17}
              />
              <input
                className="focus-ring w-full rounded-lg border border-stone-200 py-2.5 pl-10 pr-3 text-sm font-semibold"
                defaultValue={q}
                maxLength={80}
                name="q"
                placeholder="Order #, customer or phone"
                type="search"
              />
          </label>
          {isOperational ? (
            <label>
                <span className="sr-only">Order status</span>
                <select
                  className="focus-ring h-full w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm font-black text-stone-700"
                  defaultValue={status}
                  name="status"
                >
                  {operationalStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
            </label>
          ) : null}
          <label>
              <span className="sr-only">Order type</span>
              <select
                className="focus-ring h-full w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm font-black text-stone-700"
                defaultValue={fulfilment}
                name="fulfilment"
              >
                {fulfilmentTabs.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
          </label>
          <label>
              <span className="sr-only">Order source</span>
              <select
                className="focus-ring h-full w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm font-black text-stone-700"
                defaultValue={source}
                name="source"
              >
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
          </label>
          {isOperational ? (
            <label>
                <span className="sr-only">Order sorting</span>
                <select
                  className="focus-ring h-full w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm font-black text-stone-700"
                  defaultValue={sort}
                  name="sort"
                >
                  <option value="oldest">Oldest first</option>
                  <option value="overdue">Overdue first</option>
                </select>
            </label>
          ) : <input name="sort" type="hidden" value={sort} />}
          <div className="flex gap-2">
              <button
                className="focus-ring flex-1 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white"
                type="submit"
              >
                Apply
              </button>
              {q ? (
                <Link
                  aria-label="Clear order search"
                  className="focus-ring inline-flex items-center justify-center rounded-lg border border-stone-200 px-3 text-stone-500 hover:bg-stone-50"
                  href={ordersHref({ fulfilment, q: "", sort, source, status })}
                >
                  <X size={17} />
                </Link>
              ) : null}
          </div>
        </form>
      </section>
      <div className="mt-3">
        {ordersPage.items.length > 0 ? (
          <OrderList
            customers={customers}
            customerCredit={customerCredit}
            orders={ordersPage.items}
            paymentChanges={paymentChanges}
            restaurant={restaurant}
            riderAssignments={riderAssignments}
            riders={riders}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white px-5 py-14 text-center">
            <p className="font-black">No orders in this view</p>
            <p className="mt-1 text-sm text-stone-500">
              {q ? "Try a different order number, customer or phone." : "Try another status, order type or source."}
            </p>
          </div>
        )}
      </div>

      <PaginationNav
        basePath="/admin/orders"
        page={ordersPage.page}
        pageSize={ordersPage.pageSize}
        query={{ fulfilment, q, status, sort, ...(source !== "all" ? { source } : {}) }}
        total={ordersPage.total}
        totalPages={ordersPage.totalPages}
      />
    </main>
  );
}
