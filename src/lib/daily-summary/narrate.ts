import "server-only";

import { formatAED } from "@/lib/currency";

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

const SYSTEM_PROMPT = `You write a short daily WhatsApp update for a café owner in the UAE about YESTERDAY's trading.
You are given the numbers as JSON. Write 4 to 6 short lines in plain, warm language.

Hard rules:
- Use ONLY the numbers provided. Never invent, change, or round any figure.
- Put "AED" only in front of the gross_revenue and avg_order_value figures, nowhere else.
- If order_count is 0, write ONE encouraging line and nothing else.
- Mention the week-over-week change ONLY if last_week_count is greater than 0.
- Mention cancellations ONLY if cancelled_count is greater than 0.
- No greeting fluff, no emojis (one is fine only if it truly fits), no markdown.
End with ONE concrete, actionable suggestion drawn from the data.`;

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
  const allowed = [numbers.gross_revenue, numbers.avg_order_value];
  const matches = text.matchAll(/AED\s*([\d,]+(?:\.\d+)?)/gi);
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
export function buildTemplateMessage(numbers: DailyNumbers, name: string): string {
  if (numbers.order_count === 0) {
    return `${name}: quiet day yesterday — 0 orders. Want to push a 3–5pm offer to pull people in?`;
  }

  const lines: string[] = [];

  const delta =
    numbers.delta_vs_prev === 0
      ? "same as the day before"
      : numbers.delta_vs_prev > 0
        ? `up ${numbers.delta_vs_prev} from ${numbers.prev_count} the day before`
        : `down ${Math.abs(numbers.delta_vs_prev)} from ${numbers.prev_count} the day before`;

  lines.push(
    `${name}: yesterday you had ${numbers.order_count} orders (${delta}), ${formatAED(
      numbers.gross_revenue
    )} in sales.`
  );
  lines.push(`Average order was ${formatAED(numbers.avg_order_value)}.`);

  if (numbers.top_item) {
    lines.push(`Top seller: ${numbers.top_item.name} (${numbers.top_item.qty} sold).`);
  }
  if (numbers.top_combo) {
    lines.push(`Most ordered together: ${numbers.top_combo.a} + ${numbers.top_combo.b}.`);
  }
  if (numbers.busiest_hour !== null) {
    const dead =
      numbers.deadest_hour !== null && numbers.deadest_hour !== numbers.busiest_hour
        ? `, quietest around ${numbers.deadest_hour}:00`
        : "";
    lines.push(`Busiest around ${numbers.busiest_hour}:00${dead}.`);
  }
  if (numbers.cancelled_count > 0) {
    lines.push(`${numbers.cancelled_count} order(s) were cancelled — worth a quick look.`);
  }

  return lines.join("\n");
}

/**
 * Produces the owner-facing message: Gemini narration if it succeeds and its
 * money figures check out, otherwise the deterministic template. Always returns
 * a usable string — narration never blocks the owner from getting their numbers.
 */
export async function narrate(numbers: DailyNumbers, name: string): Promise<string> {
  const template = buildTemplateMessage(numbers, name);
  try {
    const prompt = `${SYSTEM_PROMPT}\n\nCafé name: ${name}\nNumbers JSON:\n${JSON.stringify(
      numbers
    )}`;
    const text = await geminiGenerate(prompt);
    if (text && aedAmountsGrounded(text, numbers)) {
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
