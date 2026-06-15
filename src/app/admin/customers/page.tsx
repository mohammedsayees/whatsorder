import { formatAED } from "@/lib/currency";
import { getCustomers, getDefaultRestaurant, getOrders } from "@/lib/data";

export default async function AdminCustomersPage() {
  const restaurant = await getDefaultRestaurant();

  if (!restaurant) {
    return null;
  }

  const [customers, orders] = await Promise.all([getCustomers(restaurant.id), getOrders(restaurant.id)]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Customers</h1>
      <p className="mt-2 text-stone-600">
        Customer history is captured from checkout, including marketing consent.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.8fr] gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm font-black text-stone-600 max-md:hidden">
          <span>Customer</span>
          <span>Area</span>
          <span>Orders</span>
          <span>Total spend</span>
        </div>
        <div className="divide-y divide-stone-200">
          {customers.map((customer) => {
            const history = orders.filter((order) => order.customer_phone === customer.phone);

            return (
              <article className="grid gap-2 px-4 py-4 md:grid-cols-[1.1fr_1fr_0.8fr_0.8fr]" key={customer.id}>
                <div>
                  <p className="font-black">{customer.name}</p>
                  <p className="text-sm text-stone-500">{customer.phone}</p>
                  <p className="mt-1 text-xs font-semibold text-leaf">
                    {customer.marketing_opt_in ? "Marketing opt-in" : "No marketing consent"}
                  </p>
                </div>
                <p className="text-sm text-stone-600">{customer.delivery_area}</p>
                <p className="font-bold">{customer.total_orders || history.length}</p>
                <p className="font-bold">
                  {formatAED(customer.total_spend || history.reduce((sum, order) => sum + order.total, 0))}
                </p>
              </article>
            );
          })}
        </div>
      </div>

      <p className="mt-5 text-sm leading-6 text-stone-500">
        {/* Future campaigns can segment customers by delivery area, spend, and marketing consent. */}
        Loyalty points and campaigns can build on this customer table once restaurants are ready for
        repeat-order incentives.
      </p>
    </main>
  );
}
