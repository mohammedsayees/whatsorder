import { OrderList } from "@/components/admin/OrderList";
import { getDefaultRestaurant, getOrders } from "@/lib/data";

export default async function AdminOrdersPage() {
  const restaurant = await getDefaultRestaurant();

  if (!restaurant) {
    return null;
  }

  const orders = await getOrders(restaurant.id);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Orders</h1>
      <p className="mt-2 text-stone-600">
        Update statuses as orders move through the kitchen and delivery flow.
      </p>
      <div className="mt-6">
        <OrderList orders={orders} />
      </div>
    </main>
  );
}
