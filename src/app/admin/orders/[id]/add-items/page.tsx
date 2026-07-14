import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StaffOrderEntry } from "@/components/admin/StaffOrderEntry";
import { formatCurrency } from "@/lib/currency";
import { getMenu, getMenuOptionCatalog, getOrderForAdmin } from "@/lib/data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function AddOrderItemsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRestaurantAdmin();
  const { id } = await params;
  const [order, menu, optionCatalog] = await Promise.all([
    getOrderForAdmin(session.restaurantId, id),
    getMenu(session.restaurantId, { admin: true }),
    getMenuOptionCatalog(session.restaurantId, { admin: true })
  ]);

  if (!order || order.status === "Cancelled") {
    notFound();
  }

  const createsSeparateOrder = order.payment_method !== null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        className="focus-ring inline-flex items-center gap-1 text-sm font-bold text-stone-500 hover:text-ink"
        href="/admin/orders"
      >
        <ArrowLeft size={16} />
        Back to orders
      </Link>
      <h1 className="mt-2 text-3xl font-black">Add items</h1>
      <p className="mt-2 text-stone-600">
        Order #{order.id.slice(-8).toUpperCase()} · {order.customer_name} · Current total {formatCurrency(order.total, session.restaurant)}
      </p>
      <div
        className={`mt-4 rounded-lg border px-4 py-3 text-sm font-bold ${
          createsSeparateOrder
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >
        {createsSeparateOrder
          ? "Payment is already recorded. These items will become a separate unpaid add-on order, with no second delivery fee."
          : "This ticket is unpaid. The verified items and total will be added to the existing order."}
      </div>

      <div className="mt-6">
        <StaffOrderEntry
          addToOrder={order}
          deliveryFee={0}
          menu={menu}
          optionCatalog={optionCatalog}
          orderTypes={[order.fulfilment_type]}
          restaurant={session.restaurant}
        />
      </div>
    </main>
  );
}
