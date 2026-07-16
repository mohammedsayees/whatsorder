import Link from "next/link";
import { formatLineOptions } from "@/lib/cart-line";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantDateTime } from "@/lib/date-time";
import type { Customer, Order, Restaurant } from "@/lib/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { NewOrderAlertCard } from "@/components/admin/NewOrderAlerts";
import { OrderStatusActions } from "@/components/admin/OrderStatusActions";
import { PaymentMethodControl } from "@/components/admin/PaymentMethodControl";
import { RequestFeedbackButton } from "@/components/admin/RequestFeedbackButton";
import { OrderPrintActions } from "@/components/admin/OrderPrintActions";
import { CarFront, Gift, MapPin, PlusCircle, ShoppingBag, Truck, Utensils } from "lucide-react";
import type { OrderPaymentChange } from "@/lib/data";

export function OrderList({
  orders,
  restaurant,
  customers = [],
  paymentChanges = {}
}: {
  orders: Order[];
  restaurant: Restaurant;
  customers?: Customer[];
  paymentChanges?: Record<string, OrderPaymentChange>;
}) {
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
        return (
          <NewOrderAlertCard key={order.id} orderId={order.id}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black">{order.customer_name}</h3>
                  <StatusBadge status={order.status} />
                  {order.parent_order_id ? (
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-800">
                      Add-on #{order.parent_order_id.slice(-8).toUpperCase()}
                    </span>
                  ) : null}
                  {order.payment_method === null && order.status !== "Cancelled" ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                      Unpaid
                    </span>
                  ) : null}
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
                  {formatRestaurantDateTime(order.created_at, restaurant)}
                </p>
                <div className="mt-3 space-y-1 text-sm">
                  {order.items.map((item, index) => (
                    // Index in the key: the same item can appear on several
                    // lines with different option configurations.
                    <div key={`${order.id}-${index}-${item.item_id}`}>
                      <p>
                        {item.quantity}x {item.name}
                      </p>
                      {formatLineOptions(item.options) ? (
                        <p className="pl-4 text-xs text-stone-500">
                          {formatLineOptions(item.options)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {fulfilmentType === "delivery" ? (
                  <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                    <p>
                      <span className="font-bold text-stone-800">Area:</span>{" "}
                      {order.delivery_area}
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
                {order.notes ? (
                  <p className="mt-1 text-sm text-stone-500">Notes: {order.notes}</p>
                ) : null}
              </div>
              <div className="min-w-56">
                <p className="text-right text-xl font-black">{formatCurrency(order.total, restaurant)}</p>
                {order.status === "Completed" && Number(order.points_earned ?? 0) > 0 ? (
                  <p className="mt-1 flex items-center justify-end gap-1 text-sm font-bold text-leaf">
                    <Gift size={15} />
                    {order.points_earned} points earned
                  </p>
                ) : null}
                {order.status !== "Cancelled" &&
                !(order.status === "Completed" && order.payment_method === null) ? (
                  <Link
                    className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-leaf px-4 py-2.5 text-sm font-black text-leaf hover:bg-mint"
                    href={`/admin/orders/${order.id}/add-items`}
                  >
                    <PlusCircle size={16} />
                    Add items
                  </Link>
                ) : null}
                <OrderStatusActions
                  countryCode={restaurant.country_code}
                  fulfilmentType={fulfilmentType}
                  key={`${order.id}-${order.status}`}
                  orderId={order.id}
                  paymentMethod={order.payment_method}
                  status={order.status}
                />
                {order.payment_method ? (
                  <PaymentMethodControl
                    change={paymentChanges[order.id] ?? null}
                    countryCode={restaurant.country_code}
                    orderId={order.id}
                    paymentMethod={order.payment_method}
                  />
                ) : null}
                <OrderPrintActions order={order} restaurant={restaurant} />
                {order.status === "Completed" ? (
                  <RequestFeedbackButton orderId={order.id} />
                ) : null}
              </div>
            </div>
          </NewOrderAlertCard>
        );
      })}
    </div>
  );
}
