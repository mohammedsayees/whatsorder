import type { Customer, FulfilmentType, Order } from "@/lib/types";
import { restaurantTimeZone } from "@/lib/date-time";

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

export type CustomerSegment = "New" | "Repeat" | "VIP" | "Inactive";

// Shared thresholds so the TypeScript classifiers, the SQL segment RPC, and the
// on-page copy all describe the SAME rules. Keep these in sync with
// supabase/migrations/*_customer_segments.sql.
export const SEGMENT_RULES = {
  repeatMinOrders: 2,
  vipMinOrders: 5,
  vipMinSpend: 250,
  inactiveDays: 30,
  // "High spender" — average completed order value at or above this. Chosen as a
  // café-friendly round default; not a schema value, safe to tune.
  highAovMinAverage: 60,
  // A customer counts as a "morning"/"midnight" regular once a plurality of
  // their completed orders land in the window AND they have at least this many
  // completed orders overall (avoids labelling one-off visitors).
  timeWindowMinOrders: 2
} as const;

// Order-derived time windows, in Asia/Dubai local hours [start, end).
const MORNING_WINDOW = { start: 4, end: 10 } as const;
const MIDNIGHT_WINDOW = { start: 0, end: 4 } as const;

// Every value the /admin/customers segment filter understands. Table-native
// segments are computed straight from the denormalized customers columns;
// order-derived segments need the completed-order history (RPC / demo orders).
export type CustomerSegmentFilter =
  | "all"
  | "new"
  | "repeat"
  | "vip"
  | "inactive"
  | "marketing_opt_in"
  | "no_consent"
  | "high_aov"
  | "delivery"
  | "takeaway"
  | "car_pickup"
  | "dine_in"
  | "morning"
  | "midnight"
  | "karak_buyers"
  | "burger_buyers";

export type SegmentTab = {
  value: CustomerSegmentFilter;
  label: string;
  // Only render when the restaurant supports the underlying fulfilment type.
  requiresDineIn?: boolean;
  // Owner-friendly one-liner shown under the eligibility banner.
  hint?: string;
};

// Café-owner wording — no CRM jargon. Grouped roughly: lifecycle, consent,
// value, fulfilment, timing, item groundwork.
export const SEGMENT_TABS: SegmentTab[] = [
  { value: "all", label: "All customers" },
  { value: "new", label: "New" },
  { value: "repeat", label: "Repeat" },
  { value: "vip", label: "VIP" },
  { value: "inactive", label: "Inactive", hint: "No completed order in the last 30 days." },
  {
    value: "marketing_opt_in",
    label: "Can contact on WhatsApp",
    hint: "Opted in to marketing and consent not withdrawn."
  },
  { value: "no_consent", label: "No marketing consent" },
  { value: "high_aov", label: "High spenders" },
  { value: "delivery", label: "Delivery customers" },
  { value: "takeaway", label: "Takeaway customers" },
  { value: "car_pickup", label: "Car pickup customers" },
  { value: "dine_in", label: "Dine-in customers", requiresDineIn: true },
  { value: "morning", label: "Morning customers" },
  { value: "midnight", label: "Midnight customers" },
  { value: "karak_buyers", label: "Karak buyers" },
  { value: "burger_buyers", label: "Burger buyers" }
];

export function isSegmentFilter(value: string | undefined): value is CustomerSegmentFilter {
  return SEGMENT_TABS.some((tab) => tab.value === value);
}

type SegmentCustomerFields = Pick<
  Customer,
  "total_orders" | "total_spend" | "last_order_at"
>;

type ContactableFields = Pick<
  Customer,
  "marketing_opt_in" | "consent_marketing" | "marketing_consent_withdrawn_at"
>;

function daysSince(lastOrderAt: string | null, now: Date): number | null {
  if (!lastOrderAt) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(lastOrderAt).getTime()) / millisecondsPerDay)
  );
}

// Lifecycle segment from the denormalized (Completed-only) customer columns —
// same thresholds and precedence as getCustomerInsights so the summary counts
// and the per-card badge agree.
export function classifyCustomerSegment(
  customer: SegmentCustomerFields,
  now: Date = new Date()
): CustomerSegment {
  const totalOrders = Number(customer.total_orders) || 0;
  const totalSpend = Number(customer.total_spend) || 0;
  const sinceLast = daysSince(customer.last_order_at, now);

  if (sinceLast !== null && sinceLast >= SEGMENT_RULES.inactiveDays) {
    return "Inactive";
  }

  if (totalOrders >= SEGMENT_RULES.vipMinOrders || totalSpend >= SEGMENT_RULES.vipMinSpend) {
    return "VIP";
  }

  if (totalOrders >= SEGMENT_RULES.repeatMinOrders) {
    return "Repeat";
  }

  return "New";
}

// The ONLY definition of "can we send this customer a promotional WhatsApp":
// opted in, consent recorded, and consent not later withdrawn. Consent can
// never be assumed — a missing flag means not contactable.
export function isCustomerContactable(customer: ContactableFields): boolean {
  return Boolean(
    customer.marketing_opt_in &&
      customer.consent_marketing &&
      !customer.marketing_consent_withdrawn_at
  );
}

export function isHighAovCustomer(customer: SegmentCustomerFields): boolean {
  const totalOrders = Number(customer.total_orders) || 0;

  if (totalOrders <= 0) {
    return false;
  }

  return (Number(customer.total_spend) || 0) / totalOrders >= SEGMENT_RULES.highAovMinAverage;
}

function uaeHour(value: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: restaurantTimeZone
  }).format(new Date(value));

  // Intl renders midnight as "24" in some engines — normalize to 0.
  return Number(hour) % 24;
}

function ordersInWindow(
  orders: Order[],
  window: { start: number; end: number }
): { inWindow: number; completed: number } {
  let inWindow = 0;
  let completed = 0;

  for (const order of orders) {
    if (order.status !== "Completed") {
      continue;
    }

    completed += 1;
    const hour = uaeHour(order.created_at);

    if (hour >= window.start && hour < window.end) {
      inWindow += 1;
    }
  }

  return { inWindow, completed };
}

// A "morning"/"midnight" regular: enough completed orders, and a plurality of
// them fall inside the window (inWindow * 2 >= completed).
export function isMorningCustomer(orders: Order[]): boolean {
  const { inWindow, completed } = ordersInWindow(orders, MORNING_WINDOW);
  return completed >= SEGMENT_RULES.timeWindowMinOrders && inWindow * 2 >= completed;
}

export function isMidnightCustomer(orders: Order[]): boolean {
  const { inWindow, completed } = ordersInWindow(orders, MIDNIGHT_WINDOW);
  return completed >= SEGMENT_RULES.timeWindowMinOrders && inWindow * 2 >= completed;
}

// Item-segment groundwork: does any completed order contain a line whose name
// matches the keyword (case-insensitive)? Kept deliberately simple — a keyword
// match over existing order items, no new tables or tagging.
export function customerBuysKeyword(orders: Order[], keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();

  if (!needle) {
    return false;
  }

  return orders.some(
    (order) =>
      order.status === "Completed" &&
      order.items.some((item) => item.name.toLowerCase().includes(needle))
  );
}

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

// Whole-picture membership test for one segment filter. Table-native segments
// use only the customer columns; order-derived segments use the customer's
// completed-order history. Mirrors the SQL RPC; also backs the demo fallback
// and the unit tests.
export function matchesSegmentFilter(
  segment: CustomerSegmentFilter,
  customer: Customer,
  orders: Order[],
  now: Date = new Date()
): boolean {
  switch (segment) {
    case "all":
      return true;
    case "new":
    case "repeat":
    case "vip":
    case "inactive": {
      const lifecycle = classifyCustomerSegment(customer, now);
      return (
        (segment === "new" && lifecycle === "New") ||
        (segment === "repeat" && lifecycle === "Repeat") ||
        (segment === "vip" && lifecycle === "VIP") ||
        (segment === "inactive" && lifecycle === "Inactive")
      );
    }
    case "marketing_opt_in":
      return isCustomerContactable(customer);
    case "no_consent":
      return !isCustomerContactable(customer);
    case "high_aov":
      return isHighAovCustomer(customer);
    case "delivery":
    case "takeaway":
    case "car_pickup":
    case "dine_in":
      return getCustomerInsights(orders, now).preferredFulfilment === segment;
    case "morning":
      return isMorningCustomer(orders);
    case "midnight":
      return isMidnightCustomer(orders);
    case "karak_buyers":
      return customerBuysKeyword(orders, "karak");
    case "burger_buyers":
      return customerBuysKeyword(orders, "burger");
    default:
      return false;
  }
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
