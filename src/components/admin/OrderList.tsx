import { updateOrderStatusAction } from "@/app/actions";
import { formatAED } from "@/lib/currency";
import type { Order, OrderStatus } from "@/lib/types";
import { StatusBadge } from "@/components/shared/StatusBadge";

const statuses: OrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
  "Out for Delivery",
  "Completed",
  "Cancelled"
];

export function OrderList({ orders }: { orders: Order[] }) {
  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={order.id}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black">{order.customer_name}</h3>
                <StatusBadge status={order.status} />
              </div>
              <p className="mt-1 text-sm text-stone-500">
                {order.customer_phone} · {order.delivery_area} · {new Date(order.created_at).toLocaleString("en-AE")}
              </p>
              <div className="mt-3 space-y-1 text-sm">
                {order.items.map((item) => (
                  <p key={`${order.id}-${item.item_id}`}>
                    {item.quantity}x {item.name}
                  </p>
                ))}
              </div>
              <p className="mt-3 text-sm text-stone-600">{order.delivery_address}</p>
              {order.notes ? <p className="mt-1 text-sm text-stone-500">Notes: {order.notes}</p> : null}
            </div>
            <div className="min-w-56">
              <p className="text-right text-xl font-black">{formatAED(order.total)}</p>
              <form action={updateOrderStatusAction} className="mt-3 flex gap-2">
                <input name="order_id" type="hidden" value={order.id} />
                <select
                  className="focus-ring min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                  defaultValue={order.status}
                  name="status"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <button className="focus-ring rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white" type="submit">
                  Save
                </button>
              </form>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
