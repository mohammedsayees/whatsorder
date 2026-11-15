import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { OrderItemReductionForm } from "@/components/admin/OrderItemReductionForm";
import { formatCurrency } from "@/lib/currency";
import { getOrderForAdmin } from "@/lib/data";
import { canReduceStaffOrderItems } from "@/lib/order-item-reductions";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function EditOrderItemsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, { id }] = await Promise.all([
    requireRestaurantAdmin(),
    params
  ]);
  const order = await getOrderForAdmin(session.restaurantId, id);

  if (!order) notFound();

  return (
    <main className="min-h-[calc(100dvh-3.75rem)] bg-stone-100 p-3">
      <header className="mx-auto mb-3 flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-sm">
        <Link
          className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100 hover:text-ink"
          href="/admin/orders"
        >
          <ArrowLeft size={17} /> Orders
        </Link>
        <div className="h-7 w-px bg-stone-200" />
        <div>
          <h1 className="text-lg font-black leading-tight">
            Remove items · #{order.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-xs font-semibold text-stone-500">
            {order.customer_name} · Current total {formatCurrency(order.total, session.restaurant)}
          </p>
        </div>
      </header>

      {canReduceStaffOrderItems(order) ? (
        <OrderItemReductionForm order={order} restaurant={session.restaurant} />
      ) : (
        <section className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-black">This order cannot be reduced here</h2>
          <p className="mt-2 text-sm font-semibold">
            Only active, unpaid staff-punched orders with at least one item remaining can be changed.
            Paid orders require a refund workflow; completed and cancelled orders remain locked.
          </p>
        </section>
      )}
    </main>
  );
}
