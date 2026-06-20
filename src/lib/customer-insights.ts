import type { FulfilmentType, Order } from "@/lib/types";

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

export type CustomerSegment = "New" | "Repeat" | "VIP" | "Inactive";

export type MostOrderedItem = {
  itemId: string;
  name: string;
  orderCount: number;
  quantity: number;
};

export type CustomerInsights = {
  averageOrderValue: number;
  completedOrderCount: number;
  completedSpend: number;
  daysSinceLastOrder: number | null;
  lastCompletedOrderAt: string | null;
  mostOrderedItems: MostOrderedItem[];
  preferredFulfilment: FulfilmentType | null;
  segment: CustomerSegment;
};

export function getCustomerInsights(
  orders: Order[],
  now: Date = new Date()
): CustomerInsights {
  const completedOrders = orders
    .filter((order) => order.status === "Completed")
    .toSorted((first, second) => second.created_at.localeCompare(first.created_at));
  const completedSpend = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const lastCompletedOrderAt = completedOrders[0]?.created_at ?? null;
  const daysSinceLastOrder = lastCompletedOrderAt
    ? Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(lastCompletedOrderAt).getTime()) / millisecondsPerDay
        )
      )
    : null;
  const itemStats = new Map<
    string,
    MostOrderedItem & {
      lastOrderedAt: string;
    }
  >();

  for (const order of completedOrders) {
    const itemsSeenInOrder = new Set<string>();

    for (const item of order.items) {
      const itemId = item.item_id || item.name;
      const existing = itemStats.get(itemId) ?? {
        itemId,
        name: item.name,
        orderCount: 0,
        quantity: 0,
        lastOrderedAt: order.created_at
      };

      existing.quantity += Number(item.quantity);

      if (!itemsSeenInOrder.has(itemId)) {
        existing.orderCount += 1;
        itemsSeenInOrder.add(itemId);
      }

      if (order.created_at > existing.lastOrderedAt) {
        existing.lastOrderedAt = order.created_at;
        existing.name = item.name;
      }

      itemStats.set(itemId, existing);
    }
  }

  const mostOrderedItems = [...itemStats.values()]
    .filter((item) => item.orderCount >= 2)
    .toSorted(
      (first, second) =>
        second.orderCount - first.orderCount ||
        second.quantity - first.quantity ||
        second.lastOrderedAt.localeCompare(first.lastOrderedAt) ||
        first.name.localeCompare(second.name)
    )
    .slice(0, 3)
    .map(({ lastOrderedAt: _lastOrderedAt, ...item }) => item);
  const fulfilmentCounts = new Map<
    FulfilmentType,
    {
      count: number;
      lastOrderedAt: string;
    }
  >();

  for (const order of completedOrders) {
    const existing = fulfilmentCounts.get(order.fulfilment_type) ?? {
      count: 0,
      lastOrderedAt: order.created_at
    };

    existing.count += 1;

    if (order.created_at > existing.lastOrderedAt) {
      existing.lastOrderedAt = order.created_at;
    }

    fulfilmentCounts.set(order.fulfilment_type, existing);
  }

  const preferredFulfilment =
    [...fulfilmentCounts.entries()].toSorted(
      ([, first], [, second]) =>
        second.count - first.count ||
        second.lastOrderedAt.localeCompare(first.lastOrderedAt)
    )[0]?.[0] ?? null;
  const completedOrderCount = completedOrders.length;
  const segment: CustomerSegment =
    daysSinceLastOrder !== null && daysSinceLastOrder >= 30
      ? "Inactive"
      : completedOrderCount >= 5 || completedSpend >= 250
        ? "VIP"
        : completedOrderCount >= 2
          ? "Repeat"
          : "New";

  return {
    averageOrderValue: completedOrderCount > 0 ? completedSpend / completedOrderCount : 0,
    completedOrderCount,
    completedSpend,
    daysSinceLastOrder,
    lastCompletedOrderAt,
    mostOrderedItems,
    preferredFulfilment,
    segment
  };
}

export function getFulfilmentLabel(fulfilment: FulfilmentType | null) {
  if (fulfilment === "car_pickup") {
    return "Bring to My Car";
  }

  if (fulfilment === "dine_in") {
    return "Dine-in";
  }

  if (fulfilment === "takeaway") {
    return "Takeaway";
  }

  if (fulfilment === "delivery") {
    return "Delivery";
  }

  return "Not enough data";
}
