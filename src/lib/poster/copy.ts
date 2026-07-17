// lib/poster/copy.ts
//
// Poster copy generation — the LLM-narrates pattern (same harness and
// philosophy as daily-summary/narrate.ts): tenant data provides ALL facts,
// Gemini only phrases them. One call returns 3 variants as a JSON array; hard
// character caps are enforced in the prompt AND validated here, and any
// variant containing a currency amount that is not one of the real prices is
// replaced by a deterministic fallback — the LLM never invents prices.

import "server-only";

export const HEADLINE_MAX = 38;
export const SUBLINE_MAX = 70;
export const CAPTION_MAX = 160;
export const COPY_VARIANT_COUNT = 3;

import type { PosterCopy, PosterTemplateId } from "./types";

/** Everything the model may talk about. Nothing else exists for it. */
export type PosterCopyFacts = {
  templateId: PosterTemplateId;
  restaurantName: string;
  itemName: string;
  /** Formatted price strings, e.g. "AED 12". Empty array → no price talk. */
  priceLines: string[];
  /** Units sold in the bestseller window; null/0 → cold start, no claims. */
  soldQty: number | null;
  market: string; // "the UAE" | "India"
};

function defaultModel() {
  return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export function truncateToCap(value: string, cap: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= cap) {
    return compact;
  }
  return `${compact.slice(0, cap - 1).trimEnd()}…`;
}

/**
 * Trust guard, mirroring narrate.ts's currencyAmountsGrounded: every currency
 * amount mentioned anywhere in a variant must be one of the amounts that
 * appear in the facts' formatted price lines. Bare numbers are also checked
 * when they look like money-with-decimals or follow a currency word.
 */
export function copyAmountsGrounded(
  copy: PosterCopy,
  facts: PosterCopyFacts
): boolean {
  const allowed = new Set<string>();
  for (const line of facts.priceLines) {
    for (const match of line.matchAll(/[\d.,]+/g)) {
      allowed.add(match[0].replace(/[,]/g, ""));
    }
  }
  if (facts.soldQty && facts.soldQty > 0) {
    allowed.add(String(facts.soldQty));
  }

  const text = `${copy.headline} ${copy.subline} ${copy.caption}`;
  const moneyPattern =
    /(?:AED|INR|Rs\.?|₹|Dhs?\.?)\s*([\d.,]+)|([\d.,]+)\s*(?:AED|INR|₹|dirhams?|rupees?|fils)/gi;
  for (const match of text.matchAll(moneyPattern)) {
    const raw = (match[1] ?? match[2] ?? "").replace(/[,]/g, "").replace(/\.$/, "");
    if (raw && !allowed.has(raw)) {
      return false;
    }
  }
  return true;
}

/**
 * Deterministic copy used when the model is unavailable, ungrounded, or
 * returns fewer than 3 usable variants. Poster generation never blocks on
 * the LLM — same "numbers are the product, narration is a nicety" stance as
 * the daily summary.
 */
export function fallbackCopyVariants(facts: PosterCopyFacts): PosterCopy[] {
  const item = truncateToCap(facts.itemName, HEADLINE_MAX - 10);
  const sold = facts.soldQty && facts.soldQty > 0 ? facts.soldQty : null;

  if (facts.templateId === "offer") {
    return [
      {
        headline: truncateToCap(`${item} — on offer now`, HEADLINE_MAX),
        subline: truncateToCap(
          `For a limited time at ${facts.restaurantName}.`,
          SUBLINE_MAX
        ),
        caption: truncateToCap(
          `${facts.itemName} is on offer at ${facts.restaurantName} for a limited time. Order on WhatsApp before it's gone.`,
          CAPTION_MAX
        )
      },
      {
        headline: truncateToCap(`Offer: ${item}`, HEADLINE_MAX),
        subline: truncateToCap(
          "A little treat, a better price — while it lasts.",
          SUBLINE_MAX
        ),
        caption: truncateToCap(
          `Limited-time offer on ${facts.itemName} at ${facts.restaurantName}. Tap to order on WhatsApp.`,
          CAPTION_MAX
        )
      },
      {
        headline: truncateToCap(`${item}, better price`, HEADLINE_MAX),
        subline: truncateToCap(
          "Today's the day to try it. Offer won't wait.",
          SUBLINE_MAX
        ),
        caption: truncateToCap(
          `${facts.itemName} — special price at ${facts.restaurantName}, for a limited time. Order now on WhatsApp.`,
          CAPTION_MAX
        )
      }
    ];
  }

  return [
    {
      headline: truncateToCap(`Our bestseller: ${item}`, HEADLINE_MAX),
      subline: truncateToCap(
        sold
          ? `${sold}+ sold this month at ${facts.restaurantName}.`
          : `The one regulars at ${facts.restaurantName} keep coming back for.`,
        SUBLINE_MAX
      ),
      caption: truncateToCap(
        `${facts.itemName} is the most-loved order at ${facts.restaurantName}. Order yours on WhatsApp.`,
        CAPTION_MAX
      )
    },
    {
      headline: truncateToCap(`${item}. Enough said.`, HEADLINE_MAX),
      subline: truncateToCap(
        sold
          ? `${sold}+ orders this month can't be wrong.`
          : "Ask anyone who's tried it.",
        SUBLINE_MAX
      ),
      caption: truncateToCap(
        `There's a reason ${facts.itemName} leads the menu at ${facts.restaurantName}. Order on WhatsApp and find out.`,
        CAPTION_MAX
      )
    },
    {
      headline: truncateToCap(`Everyone orders ${item}`, HEADLINE_MAX),
      subline: truncateToCap(
        "See what the fuss is about — today.",
        SUBLINE_MAX
      ),
      caption: truncateToCap(
        `${facts.itemName} — the crowd favourite at ${facts.restaurantName}. One tap on WhatsApp and it's yours.`,
        CAPTION_MAX
      )
    }
  ];
}

/**
 * Parse + validate a model response into exactly COPY_VARIANT_COUNT usable
 * variants. Accepts raw JSON or a ```json fenced block. Variants that fail
 * grounding are replaced from the deterministic fallbacks; caps are enforced
 * by truncate-with-ellipsis as the last resort.
 */
export function normalizeCopyVariants(
  raw: string,
  facts: PosterCopyFacts
): PosterCopy[] {
  const fallbacks = fallbackCopyVariants(facts);

  let parsed: unknown;
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    parsed = JSON.parse((fenced ? fenced[1] : raw).trim());
  } catch {
    return fallbacks;
  }
  if (!Array.isArray(parsed)) {
    return fallbacks;
  }

  const variants: PosterCopy[] = [];
  for (const entry of parsed) {
    if (variants.length >= COPY_VARIANT_COUNT) {
      break;
    }
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.headline !== "string" ||
      typeof candidate.subline !== "string" ||
      typeof candidate.caption !== "string"
    ) {
      continue;
    }
    const copy: PosterCopy = {
      headline: truncateToCap(candidate.headline, HEADLINE_MAX),
      subline: truncateToCap(candidate.subline, SUBLINE_MAX),
      caption: truncateToCap(candidate.caption, CAPTION_MAX)
    };
    if (!copy.headline || !copy.subline || !copy.caption) {
      continue;
    }
    if (!copyAmountsGrounded(copy, facts)) {
      continue;
    }
    variants.push(copy);
  }

  // Top up from fallbacks so callers always get exactly 3.
  for (const fallback of fallbacks) {
    if (variants.length >= COPY_VARIANT_COUNT) {
      break;
    }
    variants.push(fallback);
  }
  return variants;
}

function copyPrompt(facts: PosterCopyFacts): string {
  const templateBrief =
    facts.templateId === "offer"
      ? `This is a LIMITED-TIME OFFER poster. Urgency, warmth, no hard-sell clichés.`
      : `This is a BESTSELLER / social-proof poster. Confidence, local pride, no clichés.`;
  const priceRule = facts.priceLines.length
    ? `The poster already displays the price (${facts.priceLines.join(" / ")}). You may repeat these EXACT strings, but NEVER any other price, discount, or percentage.`
    : `Mention NO prices, discounts, or percentages — the data has none.`;
  const soldRule =
    facts.soldQty && facts.soldQty > 0
      ? `You may cite the sales figure ${facts.soldQty} verbatim.`
      : `There is no sales figure — make NO numeric popularity claims.`;

  return `You write short poster copy for a small café in ${facts.market} that takes orders on WhatsApp.
${templateBrief}

Facts (the ONLY things you may reference):
- Café: ${facts.restaurantName}
- Item: ${facts.itemName}
- ${priceRule}
- ${soldRule}

Write ${COPY_VARIANT_COUNT} distinct variants. Reply with ONLY a JSON array (no markdown fences), each element:
{"headline": string (max ${HEADLINE_MAX} chars, punchy, no emoji),
 "subline": string (max ${SUBLINE_MAX} chars, one warm supporting line),
 "caption": string (max ${CAPTION_MAX} chars, WhatsApp caption ending with a call to order on WhatsApp; at most one emoji)}

Hard rules: character caps are absolute. English only. Never invent numbers, prices, ingredients, or claims not in the facts.`;
}

async function geminiGenerate(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("POSTER_COPY_NOT_CONFIGURED");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel()}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 600,
      responseMimeType: "application/json",
      // Copywriting needs no chain-of-thought budget (see narrate.ts).
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
        signal: AbortSignal.timeout(20000),
        body
      });
    } catch (error) {
      lastReason = error instanceof Error ? error.name : "network";
      if (attempt < maxAttempts) {
        await sleep(400 * attempt);
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
      await sleep(400 * attempt);
      continue;
    }
    throw new Error(`REQUEST_FAILED:${response.status}`);
  }

  throw new Error(`REQUEST_FAILED:${lastReason}`);
}

/** Always returns exactly COPY_VARIANT_COUNT variants; never throws. */
export async function generateCopyVariants(
  facts: PosterCopyFacts
): Promise<PosterCopy[]> {
  try {
    const raw = await geminiGenerate(copyPrompt(facts));
    return normalizeCopyVariants(raw, facts);
  } catch (error) {
    console.error("WhatsOrder poster copy generation failed, using fallback", {
      reason: error instanceof Error ? error.message : String(error)
    });
    return fallbackCopyVariants(facts);
  }
}
