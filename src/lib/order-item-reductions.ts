import type { Order } from "@/lib/types";

export function canReduceStaffOrderItems(
  order: Pick<
    Order,
    | "items"
    | "loyalty_discount"
    | "payment_method"
    | "points_earned"
    | "points_redeemed"
    | "source"
    | "status"
  >
) {
  const quantity = order.items.reduce((sum, item) => sum + Number(item.quantity), 0);

  return (
    order.source === "staff" &&
    order.payment_method === null &&
    order.status !== "Completed" &&
    order.status !== "Cancelled" &&
    Number(order.loyalty_discount) === 0 &&
    Number(order.points_redeemed) === 0 &&
    Number(order.points_earned) === 0 &&
    quantity > 1
  );
}
