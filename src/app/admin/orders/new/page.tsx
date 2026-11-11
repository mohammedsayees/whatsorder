import Link from "next/link";
import { ArrowLeft, CircleCheck, Clock3 } from "lucide-react";
import { StaffOrderEntry } from "@/components/admin/StaffOrderEntry";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { enabledFulfilmentTypes } from "@/lib/fulfilment";
import { getCurrentShiftView } from "@/lib/shift-data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { getSelectableCreditCustomers } from "@/lib/customer-credit-data";

export default async function NewStaffOrderPage() {
  const session = await requireRestaurantAdmin();
  const [menu, optionCatalog, currentShift, creditCustomers] = await Promise.all([
    getMenu(session.restaurantId, { admin: true }),
    getMenuOptionCatalog(session.restaurantId, { admin: true }),
    getCurrentShiftView(session),
    getSelectableCreditCustomers(session.restaurant)
  ]);
  const orderTypes = enabledFulfilmentTypes(session.restaurant);

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
          <h1 className="text-lg font-black leading-tight">New order</h1>
          <p className="text-xs font-semibold text-stone-500">{session.restaurant.name}</p>
        </div>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${currentShift?.shift ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {currentShift?.shift ? <CircleCheck size={14} /> : <Clock3 size={14} />}
          {currentShift?.shift ? "Cash shift open" : "No cash shift"}
        </span>
      </header>

      {!currentShift?.shift ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
          No cash shift is open. You can still take the order, but open a shift
          first if you want completed cash sales counted in the shift summary.
        </p>
      ) : null}

      {orderTypes.length === 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          No order types are enabled for this restaurant. Enable at least one in
          Settings before taking orders.
        </p>
      ) : (
        <div>
          <StaffOrderEntry
            canManageCredit={session.role !== "staff"}
            creditCustomers={creditCustomers}
            deliveryFee={session.restaurant.delivery_fee}
            key={`${session.restaurantId}:${session.userId}`}
            menu={menu}
            optionCatalog={optionCatalog}
            orderTypes={orderTypes}
            restaurant={session.restaurant}
            staffUserId={session.userId}
          />
        </div>
      )}
    </main>
  );
}
