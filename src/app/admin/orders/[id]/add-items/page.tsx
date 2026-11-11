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
  const [session, { id }] = await Promise.all([
    requireRestaurantAdmin(),
    params
  ]);
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
    <main className="min-h-[calc(100dvh-3.75rem)] bg-stone-100 p-3">
      <header className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-sm">
        <Link
          className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100 hover:text-ink"
          href="/admin/orders"
        >
          <ArrowLeft size={17} />
          Orders
        </Link>
        <div className="h-7 w-px bg-stone-200" />
        <div>
          <h1 className="text-lg font-black leading-tight">Add items · #{order.id.slice(-8).toUpperCase()}</h1>
          <p className="text-xs font-semibold text-stone-500">{order.customer_name} · Current total {formatCurrency(order.total, session.restaurant)}</p>
        </div>
      </header>
      <div
        className={`mb-3 rounded-lg border px-4 py-2 text-sm font-bold ${
          createsSeparateOrder
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >
        {createsSeparateOrder
          ? "Payment is already recorded. These items will become a separate unpaid add-on order, with no second delivery fee."
          : "This ticket is unpaid. The verified items and total will be added to the existing order."}
      </div>

      <div>
        <StaffOrderEntry
          key={`${session.restaurantId}:${session.userId}`}
          staffUserId={session.userId}
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
