import { normalizeOpeningHours, weekDays } from "@/lib/opening-hours";
import type { RestaurantLocalization } from "@/lib/types";

import type {
  DailyCoach,
  DailyCoachAction,
  DailyCoachPeriod,
  DailyCoachPeriodStatus,
  DailyNumbers,
  DailyPeriodInsight,
  DailyPeriodKey
} from "./types";

type CoachRestaurant = Partial<RestaurantLocalization> & {
  opening_hours_enabled?: boolean | null;
  opening_hours?: unknown;
};

type PeriodDefinition = {
  key: DailyPeriodKey;
  start: number;
  end: number;
};

const periodDefinitions: PeriodDefinition[] = [
  { key: "early_morning", start: 4 * 60, end: 7 * 60 },
  { key: "morning", start: 7 * 60, end: 11 * 60 },
  { key: "lunch", start: 11 * 60, end: 15 * 60 },
  { key: "evening", start: 15 * 60, end: 19 * 60 },
  { key: "night", start: 19 * 60, end: 24 * 60 },
  { key: "midnight", start: 0, end: 4 * 60 }
];

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function intersects(
  first: { start: number; end: number },
  second: { start: number; end: number }
) {
  return first.start < second.end && second.start < first.end;
}

export function isDailyPeriodOpen(
  periodKey: DailyPeriodKey,
  targetDay: string,
  restaurant?: CoachRestaurant | null
) {
  if (!restaurant?.opening_hours_enabled) {
    return true;
  }

  const period = periodDefinitions.find((candidate) => candidate.key === periodKey);
  if (!period) {
    return false;
  }

  const date = new Date(`${targetDay}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const jsDay = date.getUTCDay();
  const currentIndex = jsDay === 0 ? 6 : jsDay - 1;
  const previousIndex = (currentIndex + weekDays.length - 1) % weekDays.length;
  const hours = normalizeOpeningHours(restaurant.opening_hours);
  const current = hours[weekDays[currentIndex]];
  const previous = hours[weekDays[previousIndex]];
  const openIntervals: { start: number; end: number }[] = [];

  if (!current.closed) {
    const start = minutes(current.open);
    const end = minutes(current.close);
    if (start === end) {
      openIntervals.push({ start: 0, end: 24 * 60 });
    } else if (end > start) {
      openIntervals.push({ start, end });
    } else {
      openIntervals.push({ start, end: 24 * 60 });
    }
  }

  if (!previous.closed) {
    const previousStart = minutes(previous.open);
    const previousEnd = minutes(previous.close);
    if (previousStart === previousEnd) {
      openIntervals.push({ start: 0, end: 24 * 60 });
    } else if (previousEnd < previousStart) {
      openIntervals.push({ start: 0, end: previousEnd });
    }
  }

  return openIntervals.some((interval) => intersects(period, interval));
}

function rounded(value: number) {
  return Math.round(Number(value) || 0);
}

function periodStatus(period: DailyPeriodInsight): DailyCoachPeriodStatus {
  const baseline = Number(period.baseline_order_count) || 0;
  const orders = Number(period.order_count) || 0;
  const cancellationRate =
    period.cancelled_count / Math.max(1, orders + period.cancelled_count);
  const basketSoft =
    orders >= 3 &&
    period.baseline_avg_order_value > 0 &&
    period.avg_order_value < period.baseline_avg_order_value * 0.85;

  if (period.cancelled_count >= 2 && cancellationRate > 0.1) {
    return "needs_attention";
  }
  if (baseline >= 2 && orders <= baseline * 0.7) {
    return "needs_attention";
  }
  if (basketSoft) {
    return "needs_attention";
  }
  if (baseline >= 2 && orders >= 3 && orders >= baseline * 1.2) {
    return "growing";
  }
  if (orders < 3 && baseline < 2) {
    return "insufficient_data";
  }
  return "normal";
}

function recommendationForPeriod(period: DailyPeriodInsight): DailyCoachAction {
  const orders = Number(period.order_count) || 0;
  const baseline = Number(period.baseline_order_count) || 0;
  const topItem = period.top_item?.name;
  const topArea = period.top_delivery_area?.area;
  const cancellationRate =
    period.cancelled_count / Math.max(1, orders + period.cancelled_count);
  const contactRate = period.contact_count / Math.max(1, orders);
  const repeatRate = period.repeat_customer_orders / Math.max(1, orders);
  const weakDemand = baseline >= 2 && orders <= baseline * 0.7;
  const basketSoft =
    orders >= 3 &&
    period.baseline_avg_order_value > 0 &&
    period.avg_order_value < period.baseline_avg_order_value * 0.85;

  if (period.cancelled_count >= 2 && cancellationRate > 0.1) {
    return {
      period_key: period.key,
      period_label: period.label,
      priority: 100,
      kind: "operations",
      evidence: `${period.cancelled_count} cancellations during ${period.label.toLowerCase()}.`,
      action: "Check preparation and handoff delays before trying to attract more orders in this period."
    };
  }

  if (weakDemand) {
    const evidence = `${orders} completed orders versus a usual ${rounded(baseline)}.`;
    if (topArea) {
      return {
        period_key: period.key,
        period_label: period.label,
        priority: 92,
        kind: "location",
        evidence: `${evidence} Delivery demand was concentrated in ${topArea}.`,
        action: `Make the ${period.label.toLowerCase()} selection prominent for ${topArea}; avoid a broad discount.`
      };
    }
    return {
      period_key: period.key,
      period_label: period.label,
      priority: 90,
      kind: "demand",
      evidence,
      action: topItem
        ? `Place ${topItem} at the top of the menu during ${period.label.toLowerCase()} and pair it with one relevant add-on.`
        : `Feature one available item during ${period.label.toLowerCase()} before considering a discount.`
    };
  }

  if (basketSoft) {
    return {
      period_key: period.key,
      period_label: period.label,
      priority: 82,
      kind: "basket",
      evidence: `Average order value was below this period's usual level.`,
      action: topItem
        ? `Pair ${topItem} with one relevant add-on and keep the choice simple.`
        : "Place one relevant add-on beside the period's leading item."
    };
  }

  if (orders >= 5 && contactRate < 0.5) {
    return {
      period_key: period.key,
      period_label: period.label,
      priority: 72,
      kind: "retention",
      evidence: `${period.contact_count} of ${orders} orders recorded a customer phone number.`,
      action: "Invite eligible customers to join loyalty at checkout; keep promotional consent separate and optional."
    };
  }

  if (topArea && period.delivery_order_count >= 3) {
    return {
      period_key: period.key,
      period_label: period.label,
      priority: 62,
      kind: "location",
      evidence: `${topArea} generated the strongest privacy-safe delivery cluster.`,
      action: `Keep the ${period.label.toLowerCase()} delivery selection clear and relevant for ${topArea}.`
    };
  }

  if (baseline >= 2 && orders >= 3 && orders >= baseline * 1.2) {
    return {
      period_key: period.key,
      period_label: period.label,
      priority: 48,
      kind: "protect",
      evidence: `${orders} completed orders versus a usual ${rounded(baseline)}.`,
      action: topItem
        ? `Protect availability of ${topItem} and preparation speed; no discount is needed.`
        : "Protect item availability and preparation speed; no discount is needed."
    };
  }

  if (orders >= 4 && repeatRate >= 0.5) {
    return {
      period_key: period.key,
      period_label: period.label,
      priority: 44,
      kind: "retention",
      evidence: `${period.repeat_customer_orders} of ${orders} orders came from returning customers.`,
      action: "Keep their commonly ordered items easy to find and make reordering simple."
    };
  }

  return {
    period_key: period.key,
    period_label: period.label,
    priority: orders >= 3 ? 30 : 10,
    kind: "protect",
    evidence:
      orders > 0
        ? `${orders} completed order${orders === 1 ? "" : "s"}; no reliable problem signal.`
        : "There is not enough completed-order history for a reliable recommendation.",
    action: topItem
      ? `Keep ${topItem} visible and collect more data before changing price or promotions.`
      : "No change recommended until there is more evidence."
  };
}

export function buildDailyCoach(
  numbers: DailyNumbers,
  restaurant?: CoachRestaurant | null
): DailyCoach {
  const coachedPeriods: DailyCoachPeriod[] = (numbers.periods ?? [])
    .map((period) => {
      const isOpen = isDailyPeriodOpen(
        period.key,
        numbers.summary_date,
        restaurant
      );
      const recommendation = recommendationForPeriod(period);
      const outsideConfiguredHours = !isOpen && period.order_count > 0;
      return {
        ...period,
        is_open: isOpen,
        status: outsideConfiguredHours ? "needs_attention" : periodStatus(period),
        evidence: outsideConfiguredHours
          ? `${period.order_count} completed order${period.order_count === 1 ? " was" : "s were"} recorded outside configured opening hours.`
          : recommendation.evidence,
        action: outsideConfiguredHours
          ? "Verify the opening-hours schedule and accepting-orders setting before the next service."
          : recommendation.action
      };
    })
    .filter((period) => period.is_open || period.order_count > 0);

  const candidates = coachedPeriods
    .filter((period) => period.status !== "insufficient_data")
    .map((period) =>
      !period.is_open && period.order_count > 0
        ? {
            period_key: period.key,
            period_label: period.label,
            priority: 110,
            kind: "operations" as const,
            evidence: period.evidence,
            action: period.action
          }
        : recommendationForPeriod(period)
    )
    .filter((recommendation) => recommendation.priority >= 40)
    .toSorted((first, second) => second.priority - first.priority);
  const usedKinds = new Set<DailyCoachAction["kind"]>();
  const topActions: DailyCoachAction[] = [];

  for (const candidate of candidates) {
    if (usedKinds.has(candidate.kind) && topActions.length < 2) {
      continue;
    }
    topActions.push(candidate);
    usedKinds.add(candidate.kind);
    if (topActions.length === 3) {
      break;
    }
  }

  return { periods: coachedPeriods, top_actions: topActions };
}

export function withDailyCoach(
  numbers: DailyNumbers,
  restaurant?: CoachRestaurant | null
): DailyNumbers {
  return { ...numbers, coach: buildDailyCoach(numbers, restaurant) };
}
