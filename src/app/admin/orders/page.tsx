import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderList } from "@/components/admin/OrderList";
import { PaginationNav } from "@/components/admin/PaginationNav";
import { CurrentShiftBanner } from "@/components/admin/CurrentShiftBanner";
import {
  getCustomersByPhones,
  getOrderFulfilmentCounts,
  getOrdersPage,
  type OrderFulfilmentView,
  type OrderStatusView
} from "@/lib/data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { getCurrentShiftView } from "@/lib/shift-data";

const statusTabs: { label: string; value: OrderStatusView }[] = [
  { label: "Active", value: "active" },
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

export default async function AdminOrdersPage({
  searchParams
}: {
  searchParams: Promise<{ fulfilment?: string; page?: string; status?: string }>;
}) {
  const session = await requireRestaurantAdmin();
  const { restaurant } = session;
  const query = await searchParams;
  const status = statusTabs.some((tab) => tab.value === query.status)
    ? (query.status as OrderStatusView)
    : "active";
  const fulfilment = fulfilmentTabs.some((tab) => tab.value === query.fulfilment)
    ? (query.fulfilment as OrderFulfilmentView)
    : "all";
  const requestedPage = positivePage(query.page);

  const [ordersPage, fulfilmentCounts, currentShift] = await Promise.all([
    getOrdersPage(restaurant.id, {
      fulfilment,
      page: requestedPage,
      pageSize: 25,
      status
    }),
    getOrderFulfilmentCounts(restaurant.id, status),
    getCurrentShiftView(session)
  ]);

  if (ordersPage.totalPages > 0 && requestedPage > ordersPage.totalPages) {
    redirect(
      `/admin/orders?status=${status}&fulfilment=${fulfilment}&page=${ordersPage.totalPages}`
    );
  }

  const customers = await getCustomersByPhones(
    restaurant.id,
    ordersPage.items.map((order) => order.customer_phone)
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Orders</h1>
      <p className="mt-2 text-stone-600">
        Update statuses as orders move through the kitchen and delivery flow.
      </p>
      <CurrentShiftBanner currentShift={currentShift} />

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Order status">
          {statusTabs.map((tab) => (
            <Link
              aria-current={status === tab.value ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-black ${
                status === tab.value
                  ? "bg-ink text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
              href={`/admin/orders?status=${tab.value}&fulfilment=${fulfilment}&page=1`}
              key={tab.value}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div
          aria-label="Order fulfilment type"
          className="mt-4 flex gap-2 overflow-x-auto border-t border-stone-100 pt-4"
        >
          {fulfilmentTabs.map((tab) => (
            <Link
              aria-current={fulfilment === tab.value ? "page" : undefined}
              className={`inline-flex whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-black ${
                fulfilment === tab.value
                  ? "border-leaf bg-mint text-leaf"
                  : "border-stone-200 text-stone-600 hover:bg-stone-50"
              }`}
              href={`/admin/orders?status=${status}&fulfilment=${tab.value}&page=1`}
              key={tab.value}
            >
              {tab.label}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  fulfilment === tab.value ? "bg-white/70" : "bg-stone-100"
                }`}
              >
                {fulfilmentCounts[tab.value]}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-5">
        {ordersPage.items.length > 0 ? (
          <OrderList
            customers={customers}
            orders={ordersPage.items}
            restaurant={restaurant}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white px-5 py-14 text-center">
            <p className="font-black">No orders in this view</p>
            <p className="mt-1 text-sm text-stone-500">
              Try another status or fulfilment type.
            </p>
          </div>
        )}
      </div>

      <PaginationNav
        basePath="/admin/orders"
        page={ordersPage.page}
        pageSize={ordersPage.pageSize}
        query={{ fulfilment, status }}
        total={ordersPage.total}
        totalPages={ordersPage.totalPages}
      />
    </main>
  );
}
