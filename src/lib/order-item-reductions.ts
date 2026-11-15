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
    // The orders-page RPC does not return every loyalty column (e.g.
    // points_redeemed). A missing value counts as 0 here; the database
    // function re-checks loyalty on the saved order before any change.
    Number(order.loyalty_discount ?? 0) === 0 &&
    Number(order.points_redeemed ?? 0) === 0 &&
    Number(order.points_earned ?? 0) === 0 &&
    quantity > 1
  );
}
