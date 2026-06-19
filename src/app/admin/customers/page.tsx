import { MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { PaginationNav } from "@/components/admin/PaginationNav";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatAED } from "@/lib/currency";
import { formatUaeDate, formatUaeDateTime } from "@/lib/date-time";
import { getCustomersPage, getOrdersForCustomerPhones } from "@/lib/data";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

function positivePage(value?: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function AdminCustomersPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { restaurant } = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const query = await searchParams;
  const customersPage = await getCustomersPage(restaurant.id, {
    page: positivePage(query.page),
    pageSize: 25
  });

  if (
    customersPage.totalPages > 0 &&
    customersPage.page > customersPage.totalPages
  ) {
    redirect(`/admin/customers?page=${customersPage.totalPages}`);
  }

  const orders = await getOrdersForCustomerPhones(
    restaurant.id,
    customersPage.items.map((customer) => customer.phone)
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Customers</h1>
      <p className="mt-2 text-stone-600">
        Customer history is captured from checkout, including marketing consent.
      </p>

      <div className="mt-6 grid gap-4">
        {customersPage.items.map((customer) => {
          const history = orders.filter((order) => order.customer_phone === customer.phone);
          const totalOrders = customer.total_orders || history.length;
          const totalSpend = customer.total_spend || history.reduce((sum, order) => sum + order.total, 0);

          return (
            <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={customer.id}>
              <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black">{customer.name}</h2>
                    {totalOrders > 1 ? (
                      <span className="rounded-full bg-mint/20 px-2.5 py-1 text-xs font-black text-leaf">
                        Repeat customer
                      </span>
                    ) : (
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-600">
                        New customer
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-stone-500">{customer.phone}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Orders</p>
                      <p className="text-xl font-black">{totalOrders}</p>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Total spend</p>
                      <p className="text-xl font-black">{formatAED(totalSpend)}</p>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Loyalty points</p>
                      <p className="text-xl font-black text-leaf">{customer.loyalty_points_balance}</p>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="text-stone-500">Last order</p>
                      <p className="font-bold">
                        {customer.last_order_at
                          ? formatUaeDate(customer.last_order_at)
                          : "Not recorded"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                    <p>
                      <span className="font-bold text-stone-800">Area:</span> {customer.delivery_area}
                    </p>
                    <p className="mt-1">
                      <span className="font-bold text-stone-800">Address:</span> {customer.delivery_address}
                    </p>
                    <p className="mt-1">
                      <span className="font-bold text-stone-800">Landmark:</span>{" "}
                      {customer.default_landmark || "Not provided"}
                    </p>
                    {customer.default_google_maps_url ? (
                      <a
                        className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full bg-leaf px-3 py-2 text-xs font-black text-white"
                        href={customer.default_google_maps_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <MapPin size={14} />
                        Open in Google Maps
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs font-semibold text-stone-500">
                    {customer.consent_order_processing ? "Order-processing consent saved" : "Consent not recorded"} ·{" "}
                    {customer.marketing_opt_in ? "Marketing opt-in" : "No marketing consent"}
                  </p>
                </div>

                <div>
                  <h3 className="font-black">Order history</h3>
                  <div className="mt-3 space-y-3">
                    {history.length > 0 ? (
                      history.map((order) => (
                        <div className="rounded-lg border border-stone-200 p-3 text-sm" key={order.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <StatusBadge status={order.status} />
                            <span className="font-black">{formatAED(order.total)}</span>
                          </div>
                          <p className="mt-2 text-stone-500">
                            {formatUaeDateTime(order.created_at)}
                          </p>
                          <p className="mt-2 text-stone-700">
                            {order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
                          </p>
                          {Number(order.points_earned ?? 0) > 0 ? (
                            <p className="mt-2 font-bold text-leaf">{order.points_earned} points earned</p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-500">No orders found.</p>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {customersPage.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white px-5 py-14 text-center">
            <p className="font-black">No customers found</p>
            <p className="mt-1 text-sm text-stone-500">
              Customer profiles will appear after orders are placed.
            </p>
          </div>
        ) : null}
      </div>

      <PaginationNav
        basePath="/admin/customers"
        page={customersPage.page}
        pageSize={customersPage.pageSize}
        total={customersPage.total}
        totalPages={customersPage.totalPages}
      />

      <p className="mt-5 text-sm leading-6 text-stone-500">
        {/* Future campaigns can segment customers by delivery area, spend, and marketing consent. */}
        Loyalty points and campaigns can build on this customer table once restaurants are ready for
        repeat-order incentives.
      </p>
    </main>
  );
}
