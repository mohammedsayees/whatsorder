import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StaffOrderEntry } from "@/components/admin/StaffOrderEntry";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { enabledFulfilmentTypes } from "@/lib/fulfilment";
import { getCurrentShiftView } from "@/lib/shift-data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function NewStaffOrderPage() {
  const session = await requireRestaurantAdmin();
  const [menu, optionCatalog, currentShift] = await Promise.all([
    getMenu(session.restaurantId, { admin: true }),
    getMenuOptionCatalog(session.restaurantId, { admin: true }),
    getCurrentShiftView(session)
  ]);
  const orderTypes = enabledFulfilmentTypes(session.restaurant);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        className="focus-ring inline-flex items-center gap-1 text-sm font-bold text-stone-500 hover:text-ink"
        href="/admin/orders"
      >
        <ArrowLeft size={16} />
        Back to orders
      </Link>
      <h1 className="mt-2 text-3xl font-black">New order</h1>
      <p className="mt-2 text-stone-600">
        Punch in a walk-in or phone order. It joins the same queue as customer
        orders{currentShift?.shift ? " and the current cash shift" : ""}.
      </p>

      {!currentShift?.shift ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          No cash shift is open. You can still take the order, but open a shift
          first if you want completed cash sales counted in the shift summary.
        </p>
      ) : null}

      {orderTypes.length === 0 ? (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          No order types are enabled for this restaurant. Enable at least one in
          Settings before taking orders.
        </p>
      ) : (
        <div className="mt-6">
          <StaffOrderEntry
            deliveryFee={session.restaurant.delivery_fee}
            menu={menu}
            optionCatalog={optionCatalog}
            orderTypes={orderTypes}
            restaurant={session.restaurant}
          />
        </div>
      )}
    </main>
  );
}
