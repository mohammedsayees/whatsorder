import { normalizeOpeningHours, weekDays } from "@/lib/opening-hours";
import type { RestaurantLocalization } from "@/lib/types";

import type {
  DailyCoach,
  DailyCoachAction,
  DailyCoachActionKind,
  DailyCoachPeriod,
  DailyCoachPeriodStatus,
  DailyNumbers,
  DailyPeriodInsight,
  DailyPeriodKey
} from "./types";

export type CoachRestaurant = Partial<RestaurantLocalization> & {
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

export const dailyPeriodKeys: DailyPeriodKey[] = periodDefinitions.map(
  (period) => period.key
);

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

// ── Thresholds ─────────────────────────────────────────────────────────────
// A baseline needs at least two same-weekday trading days: with one, the
// "usual" is a single day's figure and any swing reads as a trend.
export const MIN_BASELINE_TRADING_DAYS = 2;
// A period is weak or growing only when it also moved by at least two orders,
// so a baseline of 2 against 1 order is noise, not "needs attention".
export const MIN_ORDER_GAP = 2;
// Pre-migration payloads have no baseline_trading_days; their baseline was a
// plain four-day average, so treat it as four days of evidence (legacy rules).
const LEGACY_BASELINE_TRADING_DAYS = 4;
// Week-over-week item movers: the larger week must have at least 5 units and
// the move must be at least 3 units and 30%, so 2 -> 1 never produces advice.
export const MIN_ITEM_WEEKLY_UNITS = 5;
export const MIN_ITEM_UNIT_CHANGE = 3;
export const MIN_ITEM_RELATIVE_CHANGE = 0.3;
// A pairing must appear together in at least 3 orders on the day.
export const MIN_COMBO_ORDERS = 3;
// Weekly average order value counts as falling at a drop of 3% or more.
const AOV_FALLING_RATIO = 0.97;
// Contact capture is judged only on customer self-checkout orders.
const MIN_CHECKOUT_ORDERS_FOR_CONTACT_ADVICE = 5;

const MIN_ACTION_PRIORITY = 40;

function rounded(value: number) {
  return Math.round(Number(value) || 0);
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

type PeriodSignals = {
  orders: number;
  baseline: number;
  tradingDays: number;
  hasBaseline: boolean;
  cancellationIssue: boolean;
  weakDemand: boolean;
  growing: boolean;
  basketSoft: boolean;
};

function periodSignals(period: DailyPeriodInsight): PeriodSignals {
  const orders = Number(period.order_count) || 0;
  const baseline = Number(period.baseline_order_count) || 0;
  const tradingDays =
    typeof period.baseline_trading_days === "number"
      ? period.baseline_trading_days
      : LEGACY_BASELINE_TRADING_DAYS;
  const hasBaseline = tradingDays >= MIN_BASELINE_TRADING_DAYS;
  const cancelled = Number(period.cancelled_count) || 0;
  const cancellationRate = cancelled / Math.max(1, orders + cancelled);
  const baselineAov = Number(period.baseline_avg_order_value) || 0;

  return {
    orders,
    baseline,
    tradingDays,
    hasBaseline,
    cancellationIssue: cancelled >= 2 && cancellationRate > 0.1,
    weakDemand:
      hasBaseline &&
      baseline >= 2 &&
      orders <= baseline * 0.7 &&
      baseline - orders >= MIN_ORDER_GAP,
    growing:
      hasBaseline &&
      baseline >= 2 &&
      orders >= 3 &&
      orders >= baseline * 1.2 &&
      orders - baseline >= MIN_ORDER_GAP,
    basketSoft:
      hasBaseline &&
      orders >= 3 &&
      baselineAov > 0 &&
      Number(period.avg_order_value) < baselineAov * 0.85
  };
}

function periodStatus(period: DailyPeriodInsight): DailyCoachPeriodStatus {
  const signals = periodSignals(period);

  if (signals.cancellationIssue) {
    return "needs_attention";
  }
  if (!signals.hasBaseline) {
    return "insufficient_data";
  }
  if (signals.weakDemand || signals.basketSoft) {
    return "needs_attention";
  }
  if (signals.growing) {
    return "growing";
  }
  if (signals.orders < 3 && signals.baseline < 2) {
    return "insufficient_data";
  }
  return "normal";
}

function periodAction(
  period: DailyPeriodInsight,
  fields: Pick<DailyCoachAction, "priority" | "kind" | "evidence" | "action">
): DailyCoachAction {
  return { period_key: period.key, period_label: period.label, ...fields };
}

function recommendationForPeriod(period: DailyPeriodInsight): DailyCoachAction {
  const signals = periodSignals(period);
  const { orders, baseline } = signals;
  const topItem = period.top_item?.name;
  const topArea = period.top_delivery_area?.area;
  const repeatRate = period.repeat_customer_orders / Math.max(1, orders);
  const checkoutOrders = period.checkout_order_count;
  const checkoutContacts = Number(period.checkout_contact_count) || 0;
  const lowCheckoutContact =
    typeof checkoutOrders === "number" &&
    checkoutOrders >= MIN_CHECKOUT_ORDERS_FOR_CONTACT_ADVICE &&
    checkoutContacts / checkoutOrders < 0.5;

  if (signals.cancellationIssue) {
    return periodAction(period, {
      priority: 100,
      kind: "operations",
      evidence: `${period.cancelled_count} cancellations during ${period.label.toLowerCase()}.`,
      action: "Check preparation and handoff delays before trying to attract more orders in this period."
    });
  }

  if (signals.weakDemand) {
    const evidence = `${orders} completed orders versus a usual ${rounded(baseline)}.`;
    if (topArea) {
      return periodAction(period, {
        priority: 92,
        kind: "location",
        evidence: `${evidence} Delivery demand was concentrated in ${topArea}.`,
        action: `Make the ${period.label.toLowerCase()} selection prominent for ${topArea}; avoid a broad discount.`
      });
    }
    return periodAction(period, {
      priority: 90,
      kind: "demand",
      evidence,
      action: topItem
        ? `Place ${topItem} at the top of the menu during ${period.label.toLowerCase()} and pair it with one relevant add-on.`
        : `Feature one available item during ${period.label.toLowerCase()} before considering a discount.`
    });
  }

  if (signals.basketSoft) {
    return periodAction(period, {
      priority: 82,
      kind: "basket",
      evidence: `Average order value was below this period's usual level.`,
      action: topItem
        ? `Pair ${topItem} with one relevant add-on and keep the choice simple.`
        : "Place one relevant add-on beside the period's leading item."
    });
  }

  if (lowCheckoutContact) {
    return periodAction(period, {
      priority: 72,
      kind: "retention",
      evidence: `${checkoutContacts} of ${checkoutOrders} checkout orders recorded a customer phone number.`,
      action: "Invite eligible customers to join loyalty at checkout; keep promotional consent separate and optional."
    });
  }

  if (topArea && period.delivery_order_count >= 3) {
    return periodAction(period, {
      priority: 62,
      kind: "location",
      evidence: `${topArea} generated the strongest privacy-safe delivery cluster.`,
      action: `Keep the ${period.label.toLowerCase()} delivery selection clear and relevant for ${topArea}.`
    });
  }

  if (signals.growing) {
    return periodAction(period, {
      priority: 48,
      kind: "protect",
      evidence: `${orders} completed orders versus a usual ${rounded(baseline)}.`,
      action: topItem
        ? `Protect availability of ${topItem} and preparation speed; no discount is needed.`
        : "Protect item availability and preparation speed; no discount is needed."
    });
  }

  if (orders >= 4 && repeatRate >= 0.5) {
    return periodAction(period, {
      priority: 44,
      kind: "retention",
      evidence: `${period.repeat_customer_orders} of ${orders} orders came from returning customers.`,
      action: "Keep their commonly ordered items easy to find and make reordering simple."
    });
  }

  const evidence = !signals.hasBaseline
    ? `${plural(orders, "completed order")}; only ${plural(
        signals.tradingDays,
        "trading day"
      )} of same-weekday history, so no trend comparison yet.`
    : orders > 0
      ? `${plural(orders, "completed order")}; no reliable problem signal.`
      : "There is not enough completed-order history for a reliable recommendation.";

  return periodAction(period, {
    priority: orders >= 3 ? 30 : 10,
    kind: "protect",
    evidence,
    action: topItem
      ? `Keep ${topItem} visible and collect more data before changing price or promotions.`
      : "No change recommended until there is more evidence."
  });
}

function dayAction(
  fields: Pick<DailyCoachAction, "priority" | "kind" | "evidence" | "action">
): DailyCoachAction {
  return { period_key: null, period_label: null, ...fields };
}

function units(value: number) {
  const amount = Number(value) || 0;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function isMaterialItemMove(larger: number, smaller: number) {
  return (
    larger >= MIN_ITEM_WEEKLY_UNITS &&
    larger - smaller >= MIN_ITEM_UNIT_CHANGE &&
    (larger - smaller) / larger >= MIN_ITEM_RELATIVE_CHANGE
  );
}

/**
 * Day-level actions that are not tied to a trading period: unfinished orders
 * (operations) and the weekly menu / basket signals from daily_summary_numbers.
 * Every figure comes from SQL; this only applies thresholds and wording.
 */
function dayLevelActions(numbers: DailyNumbers): DailyCoachAction[] {
  const actions: DailyCoachAction[] = [];

  const unfinished = Number(numbers.unfinished_order_count) || 0;
  if (unfinished > 0) {
    actions.push(
      dayAction({
        priority: 105,
        kind: "operations",
        evidence: `${plural(unfinished, "order")} from the day ${
          unfinished === 1 ? "was" : "were"
        } never completed or cancelled, so ${
          unfinished === 1 ? "it is" : "they are"
        } missing from these figures.`,
        action: "Close out or cancel those orders in the dashboard so sales and comparisons are right."
      })
    );
  }

  const faller = numbers.item_faller;
  if (
    faller &&
    isMaterialItemMove(Number(faller.prev_week) || 0, Number(faller.this_week) || 0)
  ) {
    actions.push(
      dayAction({
        priority: 58,
        kind: "menu",
        evidence: `${faller.name} sold ${units(faller.this_week)} this week, down from ${units(
          faller.prev_week
        )} the week before.`,
        action: `Feature ${faller.name} near the top of the menu for a few days; if it does not recover, retire it to keep the menu tight.`
      })
    );
  }

  const combo = numbers.top_combo;
  if (combo && (Number(combo.count) || 0) >= MIN_COMBO_ORDERS) {
    const aovFalling =
      (Number(numbers.aov_prev_week) || 0) > 0 &&
      (Number(numbers.aov_this_week) || 0) <=
        (Number(numbers.aov_prev_week) || 0) * AOV_FALLING_RATIO;
    actions.push(
      dayAction({
        priority: aovFalling ? 78 : 54,
        kind: "basket",
        evidence: `${combo.a} and ${combo.b} were ordered together in ${combo.count} orders.${
          aovFalling ? " Average order value is down this week versus last week." : ""
        }`,
        action: `Offer ${combo.a} + ${combo.b} as a named combo at one simple price to lift basket size.`
      })
    );
  }

  const riser = numbers.item_riser;
  // An item with no sales the week before is new (or the restaurant is), so
  // "rising" would just restate the top seller; require prior-week sales.
  if (
    riser &&
    (Number(riser.prev_week) || 0) > 0 &&
    isMaterialItemMove(Number(riser.this_week) || 0, Number(riser.prev_week) || 0)
  ) {
    actions.push(
      dayAction({
        priority: 52,
        kind: "menu",
        evidence: `${riser.name} sold ${units(riser.this_week)} this week, up from ${units(
          riser.prev_week
        )} the week before.`,
        action: `Make ${riser.name} the hero: list it first and keep it in stock through the busiest period.`
      })
    );
  }

  return actions;
}

/**
 * Picks up to three actions by priority. Operational problems carry the
 * highest priorities (outside hours 110, unfinished orders 105, cancellations
 * 100) so they always rank above growth ideas. The three actions must not all
 * be the same kind: a third action of the same kind as the first two is
 * skipped in favour of the next different one.
 */
function selectTopActions(candidates: DailyCoachAction[]) {
  const topActions: DailyCoachAction[] = [];
  for (const candidate of candidates) {
    if (
      topActions.length === 2 &&
      topActions.every((action) => action.kind === candidate.kind)
    ) {
      continue;
    }
    topActions.push(candidate);
    if (topActions.length === 3) {
      break;
    }
  }
  return topActions;
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

  const periodCandidates = coachedPeriods.map((period) =>
    !period.is_open && period.order_count > 0
      ? {
          period_key: period.key,
          period_label: period.label,
          priority: 110,
          kind: "operations" as DailyCoachActionKind,
          evidence: period.evidence,
          action: period.action
        }
      : recommendationForPeriod(period)
  );

  const candidates = [...periodCandidates, ...dayLevelActions(numbers)]
    .filter((recommendation) => recommendation.priority >= MIN_ACTION_PRIORITY)
    .toSorted((first, second) => second.priority - first.priority);

  return { periods: coachedPeriods, top_actions: selectTopActions(candidates) };
}

export function withDailyCoach(
  numbers: DailyNumbers,
  restaurant?: CoachRestaurant | null
): DailyNumbers {
  return { ...numbers, coach: buildDailyCoach(numbers, restaurant) };
}
