import type { FulfilmentType, Order, Restaurant } from "./types";

export const defaultOrderTargets: Record<FulfilmentType, number> = {
  delivery: 45, takeaway: 20, dine_in: 30, car_pickup: 20
};

export function orderTarget(restaurant: Restaurant, type: FulfilmentType) {
  return restaurant.order_target_minutes?.[type] ?? defaultOrderTargets[type];
}

export function orderTiming(order: Order, target: number, now: number) {
  const stopped = order.status === "Completed" || order.status === "Cancelled";
  const end = stopped ? Date.parse(order.closed_at ?? "") : now;
  const start = Date.parse(order.created_at);
  const stage = Date.parse(order.status_started_at ?? (order.status === "New" ? order.created_at : ""));
  const minutes = Number.isFinite(end) && Number.isFinite(start) ? Math.max(0, Math.floor((end - start) / 60000)) : null;
  const stageMinutes = Number.isFinite(end) && Number.isFinite(stage) ? Math.max(0, Math.floor((end - stage) / 60000)) : null;
  return { stopped, minutes, stageMinutes, overdue: !stopped && minutes !== null ? Math.max(0, minutes - target) : 0,
    tone: stopped || minutes === null ? "neutral" as const : minutes >= target ? "red" as const : minutes >= target * .8 ? "amber" as const : "green" as const };
}
