import { OrderList } from "@/components/admin/OrderList";
import { getCustomers, getOrders } from "@/lib/data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function AdminOrdersPage() {
  const { restaurant } = await requireRestaurantAdmin();

  const [orders, customers] = await Promise.all([getOrders(restaurant.id), getCustomers(restaurant.id)]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Orders</h1>
      <p className="mt-2 text-stone-600">
        Update statuses as orders move through the kitchen and delivery flow.
      </p>
      <div className="mt-6">
        <OrderList customers={customers} orders={orders} />
      </div>
    </main>
  );
}
