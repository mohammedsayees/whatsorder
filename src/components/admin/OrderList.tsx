import { OrderTimer } from "./OrderTimer";
import { orderTarget, orderTiming } from "@/lib/order-timing";
import Link from "next/link";
import { formatLineOptions } from "@/lib/cart-line";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import type {
  Customer,
  DeliveryRider,
  Order,
  OrderRiderAssignment,
  Restaurant
} from "@/lib/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { NewOrderAlertCard } from "@/components/admin/NewOrderAlerts";
import {
  CancelOrderAction,
  OrderStatusActions
} from "@/components/admin/OrderStatusActions";
import { PaymentMethodControl } from "@/components/admin/PaymentMethodControl";
import { RequestFeedbackButton } from "@/components/admin/RequestFeedbackButton";
import { OrderPrintActions } from "@/components/admin/OrderPrintActions";
import {
  CarFront,
  ChevronDown,
  Gift,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  PlusCircle,
  ShoppingBag,
  Truck,
  Utensils
} from "lucide-react";
import type { OrderPaymentChange } from "@/lib/data";
import { RiderAssignmentControl } from "@/components/admin/RiderAssignmentControl";
import type { CustomerCreditMaps } from "@/lib/customer-credit-data";
import { orderSource } from "@/lib/order-source";

export function OrderList({
  orders,
  restaurant,
  riders = [],
  riderAssignments = {},
  customers = [],
  customerCredit = { byCustomerId: {}, byPhone: {} },
  paymentChanges = {}
}: {
  orders: Order[];
  restaurant: Restaurant;
  riders?: DeliveryRider[];
  riderAssignments?: Record<string, OrderRiderAssignment>;
  customers?: Customer[];
  customerCredit?: CustomerCreditMaps;
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
        const target = orderTarget(restaurant, fulfilmentType);
        const timing = orderTiming(order, target, Date.now());
        const shortOrderId = order.id.slice(-8).toUpperCase();
        const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
        const canAddItems =
          order.status !== "Cancelled" &&
          !(order.status === "Completed" && order.payment_method === null);
        const isOperational = !["Completed", "Cancelled"].includes(order.status);

        return (
          <NewOrderAlertCard
            key={order.id}
            orderId={order.id}
            urgent={timing.tone === "red"}
          >
            <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-stone-500">#{shortOrderId}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${fulfilment.className}`}
                  >
                    <FulfilmentIcon size={13} />
                    {fulfilment.label}
                  </span>
                  <StatusBadge status={order.status} />
                  <OrderTimer order={order} target={target} />
                  {order.parent_order_id ? (
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-800">
                      Add-on #{order.parent_order_id.slice(-8).toUpperCase()}
                    </span>
                  ) : null}
                  {orderSource(order) === "whatsapp_chat" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
                      <MessageCircle aria-hidden="true" size={13} />
                      WhatsApp chat
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-black">{order.customer_name}</h3>
                  <span className="text-sm font-bold text-stone-500">
                    {fulfilmentType === "dine_in" && order.table_number
                      ? `Table ${order.table_number}`
                      : order.delivery_area || order.customer_phone}
                  </span>
                  <span className="text-xs font-semibold text-stone-400">
                    {formatRestaurantShortDateTime(order.created_at, restaurant)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-stone-700">
                  {order.items.slice(0, 3).map((item, index) => (
                    <span key={`${order.id}-summary-${index}-${item.item_id}`}>
                      {item.quantity}× {item.name}
                    </span>
                  ))}
                  {order.items.length > 3 ? (
                    <span className="text-stone-400">+{order.items.length - 3} more</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs font-semibold text-stone-400">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                  {isRepeatCustomer ? " · Repeat customer" : " · New customer"}
                </p>
              </div>

              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3 lg:justify-end">
                  <span className={`text-xs font-black ${order.payment_method ? "text-emerald-700" : "text-amber-700"}`}>
                    {order.payment_method ? `Paid · ${order.payment_method.replace(" on Delivery", "")}` : "Unpaid"}
                  </span>
                  <p className="text-lg font-black">{formatCurrency(order.total, restaurant)}</p>
                </div>
                {order.status === "Completed" && Number(order.points_earned ?? 0) > 0 ? (
                  <p className="mt-1 flex items-center justify-end gap-1 text-sm font-bold text-leaf">
                    <Gift size={15} />
                    {order.points_earned} points earned
                  </p>
                ) : null}
                {isOperational ? (
                  <OrderStatusActions
                    credit={
                      (order.customer_id
                        ? customerCredit.byCustomerId[order.customer_id]
                        : undefined) ?? customerCredit.byPhone[order.customer_phone]
                    }
                    countryCode={restaurant.country_code}
                    fulfilmentType={fulfilmentType}
                    key={`${order.id}-${order.status}`}
                    orderId={order.id}
                    orderTotal={Number(order.total)}
                    paymentMethod={order.payment_method}
                    showCancel={false}
                    status={order.status}
                  />
                ) : null}
              </div>
            </div>

            <details className="group border-t border-stone-100 bg-stone-50/70">
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-end gap-1.5 px-3 py-1.5 text-xs font-black text-stone-500 hover:bg-stone-100 [&::-webkit-details-marker]:hidden">
                <MoreHorizontal size={15} />
                More
                <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
              </summary>
              <div className="grid gap-4 border-t border-stone-100 bg-white p-4 lg:grid-cols-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-stone-400">Items</p>
                  <div className="mt-2 space-y-1 text-sm">
                    {order.items.map((item, index) => (
                      <div key={`${order.id}-${index}-${item.item_id}`}>
                        <p className="font-bold">{item.quantity}× {item.name}</p>
                        {formatLineOptions(item.options) ? (
                          <p className="pl-4 text-xs text-stone-500">{formatLineOptions(item.options)}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {order.notes ? <p className="mt-3 text-sm text-stone-600"><strong>Notes:</strong> {order.notes}</p> : null}
                </div>

                <div className="text-sm text-stone-600">
                  <p className="text-xs font-black uppercase tracking-wide text-stone-400">Customer</p>
                  <p className="mt-2"><strong className="text-stone-800">Phone:</strong> {order.customer_phone}</p>
                  {fulfilmentType === "delivery" ? (
                    <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
                      <p><strong className="text-stone-800">Area:</strong> {order.delivery_area}</p>
                      <p className="mt-1"><strong className="text-stone-800">Address:</strong> {order.delivery_address}</p>
                      <p className="mt-1"><strong className="text-stone-800">Landmark:</strong> {order.delivery_landmark || "Not provided"}</p>
                      {order.delivery_google_maps_url ? (
                        <a className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full bg-leaf px-3 py-2 text-xs font-black text-white" href={order.delivery_google_maps_url} rel="noreferrer" target="_blank">
                          <MapPin size={14} /> Open in Google Maps
                        </a>
                      ) : null}
                    </div>
                  ) : fulfilmentType === "car_pickup" ? (
                    <div className="mt-2 rounded-lg bg-violet-50 p-3 text-violet-900">
                      <p className="font-black">Plate: {order.car_plate_number || "Not provided"}</p>
                      <p className="mt-1">Car: {order.car_description || "No colour/model provided"}</p>
                    </div>
                  ) : fulfilmentType === "dine_in" ? (
                    <p className="mt-2 rounded-lg bg-emerald-50 p-3 font-black text-emerald-900">Table: {order.table_number || "Not provided"}</p>
                  ) : null}
                  {fulfilmentType === "delivery" && isOperational ? (
                    <RiderAssignmentControl
                      assignment={riderAssignments[order.id]}
                      orderId={order.id}
                      riders={riders}
                    />
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-stone-400">Actions</p>
                  {canAddItems ? (
                    <Link
                      className="focus-ring mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-leaf px-4 py-2 text-sm font-black text-leaf hover:bg-mint"
                      href={`/admin/orders/${order.id}/add-items`}
                    >
                      <PlusCircle size={16} />
                      Add items
                    </Link>
                  ) : null}
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
                  {isOperational ? <CancelOrderAction orderId={order.id} /> : null}
                </div>
              </div>
            </details>
          </NewOrderAlertCard>
        );
      })}
    </div>
  );
}
