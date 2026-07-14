import "server-only";

import { formatCurrency } from "@/lib/currency";
import { getRestaurantLocalization } from "@/lib/localization";
import type { RestaurantLocalization } from "@/lib/types";

import type { DailyNumbers } from "./types";

// Narration provider is Gemini today (same key/harness as menu extraction in
// src/lib/menu-extraction/extract.ts). Swapping models is an env change
// (GEMINI_MODEL); a future provider is a change to this one file. The numbers
// are NEVER produced here — the model only phrases the pre-computed figures.

function defaultModel() {
  return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function systemPrompt(countryCode: string, currencyCode: string) {
  const market = countryCode === "IN" ? "India" : "the UAE";
  return `You are the sharpest café general manager in ${market}, writing a short WhatsApp
update to the owner about YESTERDAY's trading. You are given the numbers as JSON.
You don't just report — you find the ONE change or opportunity that matters most
and tell the owner exactly what to do to grow orders or basket size.

How you think (silently, then write):
1. DIAGNOSE the single biggest signal. Judge the day against dow_avg_count (its
   own weekday's 4-week average) and last_week_count — not just yesterday. A day
   can look big against a slow prior day yet be soft for its weekday.
2. PRESCRIBE one specific, time-boxed action the owner can run TODAY.
3. QUANTIFY the upside from the data where you can.

Signals and the growth move each points to:
- contact_capture_rate low: suggest an optional loyalty invitation at checkout.
  A phone collected for order processing is not marketing permission. Suggest
  messaging past customers ONLY if marketable_count > 0 — never tell them to
  message people who did not consent.
- item_riser: lean in — make it today's hero.
- item_faller: a fading item — feature it or retire it.
- aov_this_week below aov_prev_week: baskets are shrinking — add an upsell or combo.
- top_combo: turn the pair into a named, priced combo to lift basket size.
- deadest_hour: a targeted offer aimed only at that quiet window.
- busiest_hour: pre-batch / cut waits so you stop losing people at peak.
- cancelled_count high: operational — check prep time at peak.

Style:
- 4 to 6 short lines. Lead with the verdict, not a number.
- Keep the useful facts (busy/quiet hour, top item) AND end with ONE clear action.
- Warm, direct, a little opinionated. One insight, one action — never a list.

Hard rules (never break these):
- Use ONLY the numbers provided. Never invent, change, or round any figure.
- Put "${currencyCode}" only in front of money figures (gross_revenue, avg_order_value,
  aov_this_week, aov_prev_week), nowhere else.
- If order_count is 0, write ONE encouraging line with one concrete idea to pull
  people in today, and nothing else.
- Mention the week-over-week change ONLY if last_week_count is greater than 0.
- Mention cancellations ONLY if cancelled_count is greater than 0.
- Never suggest messaging customers unless marketable_count is greater than 0.
- No greeting fluff, no markdown, no emojis (one is fine only if it truly fits).`;
}

/**
 * Low-level text generation via Gemini, mirroring the retry-on-503/429 shape of
 * the menu-extraction harness. Throws on missing key or hard failure so the
 * caller can fall back to the deterministic template.
 */
async function geminiGenerate(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("DAILY_SUMMARY_NARRATION_NOT_CONFIGURED");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel()}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 250,
      // 2.5-flash is a thinking model; narration needs none of it and leaving it
      // on risks blowing the timeout / truncating output (see extract.ts).
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  const maxAttempts = 3;
  let lastReason = "network";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45000),
        body
      });
    } catch (error) {
      lastReason = error instanceof Error ? error.name : "network";
      if (attempt < maxAttempts) {
        await sleep(500 * attempt);
        continue;
      }
      throw new Error(`REQUEST_FAILED:${lastReason}`);
    }

    if (response.ok) {
      const payload = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return (payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    }

    lastReason = String(response.status);
    if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts) {
      await sleep(500 * attempt);
      continue;
    }
    throw new Error(`REQUEST_FAILED:${response.status}`);
  }

  throw new Error(`REQUEST_FAILED:${lastReason}`);
}

/**
 * Trust guard: the only catastrophic failure is a hallucinated money figure.
 * Every "AED <amount>" in the narration must equal one of the two money figures
 * we computed (gross_revenue or avg_order_value). If anything else appears,
 * the narration is rejected and the caller uses the deterministic template.
 */
export function aedAmountsGrounded(text: string, numbers: DailyNumbers): boolean {
  return currencyAmountsGrounded(text, numbers, "AED");
}

export function currencyAmountsGrounded(
  text: string,
  numbers: DailyNumbers,
  currencyCode: string
): boolean {
  const allowed = [
    numbers.gross_revenue,
    numbers.avg_order_value,
    numbers.aov_this_week,
    numbers.aov_prev_week
  ];
  const escapedCurrency = currencyCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.matchAll(
    new RegExp(`${escapedCurrency}\\s*([\\d,]+(?:\\.\\d+)?)`, "gi")
  );
  for (const match of matches) {
    const value = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(value)) {
      return false;
    }
    if (!allowed.some((a) => Math.abs(a - value) < 0.01)) {
      return false;
    }
  }
  return true;
}

/**
 * Deterministic fallback message built entirely from the numbers JSON. Used when
 * the model errors or returns an ungrounded figure. Numbers are the product;
 * narration is a nicety.
 */
export function buildTemplateMessage(
  numbers: DailyNumbers,
  name: string,
  restaurant?: Partial<RestaurantLocalization> | null
): string {
  if (numbers.coach) {
    return buildDailyCoachMessage(numbers, name, restaurant);
  }

  if (numbers.order_count === 0) {
    return `${name}: no completed orders were recorded yesterday. Confirm ordering was enabled and feature one available item during the first open period today.`;
  }

  const lines: string[] = [];

  // Verdict prefers the same-day-last-week comparison (steadier than a single
  // prior day); falls back to day-over-day when there's no last-week baseline.
  const wow = numbers.last_week_count > 0;
  const trend = wow ? numbers.delta_vs_last_week : numbers.delta_vs_prev;
  const verdict = trend > 0 ? "good day" : trend < 0 ? "slower day" : "steady day";
  const compare =
    trend === 0
      ? wow
        ? "level with the same day last week"
        : "same as the day before"
      : `${trend > 0 ? "up" : "down"} ${Math.abs(trend)} ${
          wow ? "on the same day last week" : "on the day before"
        }`;

  lines.push(
    `${name}: ${verdict} yesterday — ${numbers.order_count} orders (${compare}), ${formatCurrency(
      numbers.gross_revenue,
      restaurant
    )} in.`
  );

  // Keep the operational facts the owner runs the shop on (top item, hours).
  const facts: string[] = [];
  if (numbers.top_item) {
    facts.push(`${numbers.top_item.name} led (${numbers.top_item.qty} sold)`);
  }
  if (numbers.busiest_hour !== null) {
    facts.push(`busiest ${numbers.busiest_hour}:00`);
  }
  if (facts.length > 0) {
    lines.push(`${facts.join("; ")}.`);
  }

  // ...then ONE growth action, most important signal first.
  lines.push(managerAction(numbers));

  return lines.join("\n");
}

/**
 * The single most valuable action for the day, chosen deterministically. Ordered
 * so a real leak (material cancellations) beats a growth lever, and a trivial
 * one never wins. Mirrors the LLM's "one insight, one action" discipline so the
 * fallback reads like the same manager.
 */
function managerAction(n: DailyNumbers): string {
  // A real operational leak — material, not one stray cancellation.
  if (n.cancelled_count >= 3 && n.cancelled_count > n.order_count * 0.05) {
    return `${n.cancelled_count} cancellations — usually prep time at peak. Tighten the busy hour so you stop losing them.`;
  }
  // The biggest lever when most customers stay anonymous: capture contacts.
  if (n.contact_capture_rate !== null && n.contact_capture_rate < 0.5) {
    const pct = Math.round(n.contact_capture_rate * 100);
    return `${pct}% of orders recorded a phone number. Invite eligible customers to loyalty at checkout, while keeping promotional consent separate and optional.`;
  }
  // A fading favourite worth defending.
  if (n.item_faller && n.item_faller.this_week < n.item_faller.prev_week) {
    return `${n.item_faller.name} is sliding (${n.item_faller.prev_week} to ${n.item_faller.this_week} this week) — feature it today or swap it out.`;
  }
  // Shrinking baskets — lift the average with a bundle.
  if (n.aov_this_week < n.aov_prev_week && n.top_combo) {
    return `Baskets are shrinking. ${n.top_combo.a} + ${n.top_combo.b} keep selling together — make it a named combo to lift the average.`;
  }
  if (n.top_combo) {
    return `${n.top_combo.a} + ${n.top_combo.b} keep selling together — make it a named combo to lift the basket.`;
  }
  // A dead window to fill.
  if (n.deadest_hour !== null && n.deadest_hour !== n.busiest_hour) {
    return `${n.deadest_hour}:00 had the least recorded activity — check that ordering and suitable items were available before considering an offer.`;
  }
  // Lean into a rising or leading item.
  if (n.item_riser) {
    return `${n.item_riser.name} is climbing (${n.item_riser.prev_week} to ${n.item_riser.this_week}) — push it as today's hero.`;
  }
  if (n.top_item) {
    return `${n.top_item.name} carried the day — keep it prominent on today's menu.`;
  }
  return "Pick one available item to feature clearly on today's menu.";
}

function summaryDay(
  isoDate: string,
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const localization = getRestaurantLocalization(restaurant);
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat(localization.locale, {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC"
  }).format(parsed);
}

function comparisonLine(numbers: DailyNumbers) {
  const baseline =
    numbers.last_week_count > 0
      ? numbers.last_week_count
      : Number(numbers.dow_avg_count) || 0;
  if (baseline <= 0) {
    return null;
  }

  const difference = numbers.order_count - baseline;
  const percentage = Math.round((difference / baseline) * 100);
  const source = numbers.last_week_count > 0 ? "last week" : "the four-week weekday average";
  if (difference === 0) {
    return `Comparison: level with ${source}.`;
  }
  return `Comparison: ${Math.abs(Math.round(difference))} ${
    difference > 0 ? "more" : "fewer"
  } orders (${percentage > 0 ? "+" : ""}${percentage}%) than ${source}.`;
}

function buildDailyCoachMessage(
  numbers: DailyNumbers,
  name: string,
  restaurant?: Partial<RestaurantLocalization> | null
) {
  const coach = numbers.coach;
  if (!coach) {
    return "";
  }
  const lines = [
    `Daily Coach — ${summaryDay(numbers.summary_date, restaurant)}`,
    `${name}: ${numbers.order_count} completed order${
      numbers.order_count === 1 ? "" : "s"
    } • ${formatCurrency(numbers.gross_revenue, restaurant)} sales • ${formatCurrency(
      numbers.avg_order_value,
      restaurant
    )} average order.`
  ];
  const comparison = comparisonLine(numbers);
  if (comparison) {
    lines.push(comparison);
  }

  if (numbers.order_count === 0) {
    lines.push(
      "No completed sales were recorded. Confirm ordering was enabled and feature one available item during the first open period today."
    );
    return lines.join("\n");
  }

  const strongestPeriod = coach.periods
    .filter((period) => period.order_count > 0)
    .toSorted((first, second) => second.order_count - first.order_count)[0];
  const facts: string[] = strongestPeriod
    ? [`${strongestPeriod.label} was strongest with ${strongestPeriod.order_count} orders`]
    : [];
  if (strongestPeriod?.top_item) {
    facts.push(
      `${strongestPeriod.top_item.name} led there with ${strongestPeriod.top_item.qty} sold`
    );
  }
  if (facts.length > 0) {
    lines.push(`What stood out: ${facts.join(" • ")}.`);
  }

  if (coach.top_actions.length) {
    lines.push("Today's priorities:");
    coach.top_actions.forEach((recommendation, index) => {
      lines.push(
        `${index + 1}. ${recommendation.period_label}: ${recommendation.evidence} ${recommendation.action}`
      );
    });
  } else {
    lines.push("Today: no material period-level problem was detected; keep the current operation consistent.");
  }

  return lines.join("\n");
}

/**
 * Produces the owner-facing message: Gemini narration if it succeeds and its
 * money figures check out, otherwise the deterministic template. Always returns
 * a usable string — narration never blocks the owner from getting their numbers.
 */
export async function narrate(
  numbers: DailyNumbers,
  name: string,
  restaurant?: Partial<RestaurantLocalization> | null
): Promise<string> {
  const localization = getRestaurantLocalization(restaurant);
  const template = buildTemplateMessage(numbers, name, restaurant);
  // Daily Coach recommendations and their evidence are already deterministic.
  // Do not send them through a model that could alter a period, count, consent
  // rule, or location claim.
  if (numbers.coach) {
    return template;
  }
  try {
    const prompt = `${systemPrompt(localization.country_code, localization.currency_code)}\n\nCafé name: ${name}\nNumbers JSON:\n${JSON.stringify(
      numbers
    )}`;
    const text = await geminiGenerate(prompt);
    if (text && currencyAmountsGrounded(text, numbers, localization.currency_code)) {
      return text;
    }
    if (text) {
      console.error("WhatsOrder daily summary: narration had an ungrounded figure, using template");
    }
    return template;
  } catch (error) {
    console.error("WhatsOrder daily summary narration failed, using template", {
      reason: error instanceof Error ? error.message : String(error)
    });
    return template;
  }
}
