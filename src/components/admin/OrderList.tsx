import { updateOrderStatusAction } from "@/app/actions";
import { formatAED } from "@/lib/currency";
import type { Customer, Order, OrderStatus } from "@/lib/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RequestFeedbackButton } from "@/components/admin/RequestFeedbackButton";
import { CarFront, Gift, MapPin, ShoppingBag, Truck, Utensils } from "lucide-react";

const statuses: OrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
  "Ready to Serve",
  "Out for Delivery",
  "Completed",
  "Cancelled"
];

export function OrderList({ orders, customers = [] }: { orders: Order[]; customers?: Customer[] }) {
  const customersByPhone = new Map(customers.map((customer) => [customer.phone, customer]));

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const customer = customersByPhone.get(order.customer_phone);
        const isRepeatCustomer = Number(customer?.total_orders ?? 0) > 1;
        const fulfilmentType = order.fulfilment_type ?? "delivery";
        const fulfilment =
          fulfilmentType === "delivery"
            ? { label: "Delivery", icon: Truck, className: "bg-blue-50 text-blue-700" }
            : fulfilmentType === "takeaway"
              ? {
                  label: "Takeaway",
                  icon: ShoppingBag,
                  className: "bg-amber-50 text-amber-800"
                }
              : fulfilmentType === "car_pickup"
                ? {
                  label: "Car Pickup",
                  icon: CarFront,
                  className: "bg-violet-50 text-violet-700"
                  }
                : {
                    label: "Dine In",
                    icon: Utensils,
                    className: "bg-emerald-50 text-emerald-700"
                  };
        const FulfilmentIcon = fulfilment.icon;
        const availableStatuses =
          fulfilmentType === "delivery"
            ? statuses.filter((status) => status !== "Ready to Serve")
            : fulfilmentType === "dine_in"
              ? statuses.filter((status) => status !== "Out for Delivery")
              : statuses.filter(
                  (status) => status !== "Out for Delivery" && status !== "Ready to Serve"
                );

        return (
          <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm" key={order.id}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black">{order.customer_name}</h3>
                <StatusBadge status={order.status} />
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${fulfilment.className}`}
                >
                  <FulfilmentIcon size={13} />
                  {fulfilment.label}
                </span>
                <span
                  className={
                    isRepeatCustomer
                      ? "rounded-full bg-mint/20 px-2.5 py-1 text-xs font-black text-leaf"
                      : "rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-600"
                  }
                >
                  {isRepeatCustomer ? "Repeat customer" : "New customer"}
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-500">
                {order.customer_phone}
                {order.delivery_area ? ` · ${order.delivery_area}` : ""} ·{" "}
                {new Date(order.created_at).toLocaleString("en-AE")}
              </p>
              <div className="mt-3 space-y-1 text-sm">
                {order.items.map((item) => (
                  <p key={`${order.id}-${item.item_id}`}>
                    {item.quantity}x {item.name}
                  </p>
                ))}
              </div>
              {fulfilmentType === "delivery" ? (
                <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                  <p>
                    <span className="font-bold text-stone-800">Area:</span> {order.delivery_area}
                  </p>
                  <p className="mt-1">
                    <span className="font-bold text-stone-800">Address:</span>{" "}
                    {order.delivery_address}
                  </p>
                  <p className="mt-1">
                    <span className="font-bold text-stone-800">Landmark:</span>{" "}
                    {order.delivery_landmark || "Not provided"}
                  </p>
                  {order.delivery_google_maps_url ? (
                    <a
                      className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full bg-leaf px-3 py-2 text-xs font-black text-white"
                      href={order.delivery_google_maps_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <MapPin size={14} />
                      Open in Google Maps
                    </a>
                  ) : null}
                </div>
              ) : fulfilmentType === "car_pickup" ? (
                <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
                  <p className="text-base font-black">
                    Plate: {order.car_plate_number || "Not provided"}
                  </p>
                  <p className="mt-1">
                    Car: {order.car_description || "No colour/model provided"}
                  </p>
                </div>
              ) : fulfilmentType === "dine_in" ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                  <p className="text-base font-black">
                    Table: {order.table_number || "Not provided"}
                  </p>
                </div>
              ) : null}
              {order.notes ? <p className="mt-1 text-sm text-stone-500">Notes: {order.notes}</p> : null}
            </div>
            <div className="min-w-56">
              <p className="text-right text-xl font-black">{formatAED(order.total)}</p>
              {order.status === "Completed" && Number(order.points_earned ?? 0) > 0 ? (
                <p className="mt-1 flex items-center justify-end gap-1 text-sm font-bold text-leaf">
                  <Gift size={15} />
                  {order.points_earned} points earned
                </p>
              ) : null}
              <form action={updateOrderStatusAction} className="mt-3 flex gap-2">
                <input name="order_id" type="hidden" value={order.id} />
                <select
                  className="focus-ring min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                  defaultValue={order.status}
                  name="status"
                >
                  {availableStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <button className="focus-ring rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white" type="submit">
                  Save
                </button>
              </form>
              {order.status === "Completed" ? (
                <RequestFeedbackButton orderId={order.id} />
              ) : null}
            </div>
          </div>
          </article>
      );
      })}
    </div>
  );
}
