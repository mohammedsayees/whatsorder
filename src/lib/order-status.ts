import type { FulfilmentType, OrderStatus } from "@/lib/types";

const statusFlows: Record<FulfilmentType, OrderStatus[]> = {
  delivery: ["New", "Accepted", "Preparing", "Out for Delivery", "Completed"],
  takeaway: ["New", "Accepted", "Preparing", "Completed"],
  car_pickup: ["New", "Accepted", "Preparing", "Completed"],
  dine_in: ["New", "Accepted", "Preparing", "Ready to Serve", "Completed"]
};

const nextActionLabels: Partial<Record<OrderStatus, string>> = {
  Accepted: "Accept Order",
  Preparing: "Start Preparing",
  "Ready to Serve": "Mark Ready to Serve",
  "Out for Delivery": "Mark Out for Delivery",
  Completed: "Complete Order"
};

export function getNextOrderStatus(
  fulfilmentType: FulfilmentType,
  currentStatus: OrderStatus
) {
  const flow = statusFlows[fulfilmentType];
  const currentIndex = flow.indexOf(currentStatus);

  if (currentIndex < 0 || currentIndex >= flow.length - 1) {
    return null;
  }

  return flow[currentIndex + 1];
}

export function getNextOrderActionLabel(status: OrderStatus) {
  return nextActionLabels[status] ?? status;
}

export function canCancelOrder(status: OrderStatus) {
  return status !== "Completed" && status !== "Cancelled";
}

export function isValidOrderStatusTransition(
  fulfilmentType: FulfilmentType,
  currentStatus: OrderStatus,
  requestedStatus: OrderStatus
) {
  if (requestedStatus === "Cancelled") {
    return canCancelOrder(currentStatus);
  }

  return getNextOrderStatus(fulfilmentType, currentStatus) === requestedStatus;
}
