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

const statusTabs: { label: string; value: AdminOrderStatusView }[] = [
  { label: "All active", value: "active" },
  { label: "New", value: "new" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Out for delivery", value: "out_for_delivery" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" }
];

const fulfilmentTabs: { label: string; value: OrderFulfilmentView }[] = [
  { label: "All", value: "all" },
  { label: "Delivery", value: "delivery" },
  { label: "Takeaway", value: "takeaway" },
  { label: "Dine-in", value: "dine_in" },
  { label: "Bring to My Car", value: "car_pickup" }
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
  status
}: {
  fulfilment: OrderFulfilmentView;
  page?: number;
  q: string;
  sort: "oldest" | "overdue";
  status: AdminOrderStatusView;
}) {
  const params = new URLSearchParams({ fulfilment, page: String(page), sort, status });
  if (q) params.set("q", q);
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
  }>;
}) {
  const [session, query] = await Promise.all([
    requireRestaurantAdmin(),
    searchParams
  ]);
  const { restaurant } = session;
  const status = statusTabs.some((tab) => tab.value === query.status)
    ? (query.status as AdminOrderStatusView)
    : "active";
  const fulfilment = fulfilmentTabs.some((tab) => tab.value === query.fulfilment)
    ? (query.fulfilment as OrderFulfilmentView)
    : "all";
  const sort = query.sort === "overdue" ? "overdue" : "oldest";
  const q = query.q?.trim().slice(0, 80) ?? "";
  const requestedPage = positivePage(query.page);
  const isOperational = status !== "completed" && status !== "cancelled";

  const [ordersPage, currentShift] = await Promise.all([
    getAdminOrdersPage(restaurant.id, {
      fulfilment,
      search: q,
      sort,
      page: requestedPage,
      pageSize: 25,
      status
    }),
    getCurrentShiftView(session)
  ]);
  const fulfilmentCounts = ordersPage.fulfilmentCounts;

  if (ordersPage.totalPages > 0 && requestedPage > ordersPage.totalPages) {
    redirect(
      ordersHref({ fulfilment, page: ordersPage.totalPages, q, sort, status })
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
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Order status">
          {statusTabs.map((tab) => (
            <Link
              aria-current={status === tab.value ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-black ${
                status === tab.value
                ? "bg-ink text-white shadow-sm"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
              href={ordersHref({ fulfilment, q, sort, status: tab.value })}
              key={tab.value}
            >
              {tab.label}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  status === tab.value ? "bg-white/20" : "bg-white"
                }`}
              >
                {ordersPage.statusCounts[tab.value]}
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-center">
          <form action="/admin/orders" className="flex min-w-0 gap-2" method="get" role="search">
            <input name="status" type="hidden" value={status} />
            <input name="fulfilment" type="hidden" value={fulfilment} />
            <input name="sort" type="hidden" value={sort} />
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
            <button
              className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-black text-white"
              type="submit"
            >
              Search
            </button>
            {q ? (
              <Link
                aria-label="Clear order search"
                className="focus-ring inline-flex items-center justify-center rounded-lg border border-stone-200 px-3 text-stone-500 hover:bg-stone-50"
                href={ordersHref({ fulfilment, q: "", sort, status })}
              >
                <X size={17} />
              </Link>
            ) : null}
          </form>

          <div aria-label="Order fulfilment type" className="flex gap-2 overflow-x-auto">
            {fulfilmentTabs.map((tab) => (
              <Link
                aria-current={fulfilment === tab.value ? "page" : undefined}
                className={`inline-flex whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-black ${
                  fulfilment === tab.value
                    ? "border-leaf bg-mint text-leaf"
                    : "border-stone-200 text-stone-600 hover:bg-stone-50"
                }`}
                href={ordersHref({ fulfilment: tab.value, q, sort, status })}
                key={tab.value}
              >
                {tab.label}
                <span className="ml-1.5 text-[11px] opacity-70">
                  {fulfilmentCounts[tab.value]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {isOperational ? (
        <div className="mt-3 flex gap-2" aria-label="Order priority">
          {(["oldest", "overdue"] as const).map((value) => (
            <Link
              aria-current={sort === value ? "page" : undefined}
              className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                sort === value ? "border-leaf bg-mint text-leaf" : "bg-white text-stone-600"
              }`}
              href={ordersHref({ fulfilment, q, sort: value, status })}
              key={value}
            >
              {value === "overdue" ? "Overdue first" : "Oldest first"}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mt-5">
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
              {q ? "Try a different order number, customer or phone." : "Try another status or fulfilment type."}
            </p>
          </div>
        )}
      </div>

      <PaginationNav
        basePath="/admin/orders"
        page={ordersPage.page}
        pageSize={ordersPage.pageSize}
        query={{ fulfilment, q, status, sort }}
        total={ordersPage.total}
        totalPages={ordersPage.totalPages}
      />
    </main>
  );
}
