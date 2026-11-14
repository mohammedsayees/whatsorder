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

import type { PosterCopy, PosterLanguage, PosterTemplateId } from "./types";

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
  /** Copy language; "ar" only for restaurants with Arabic-speaking customers. */
  language?: PosterLanguage;
  /** Festival template: the occasion's name (the greeting itself is code-owned). */
  occasion?: string | null;
  /** Loyalty template: real stamp-card terms. */
  loyaltyStamps?: number | null;
  loyaltyReward?: string | null;
};

/**
 * Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits → ASCII, Arabic
 * decimal/thousands separators → "." / ",". Every number check runs on the
 * normalised text, so an Arabic caption can't slip a made-up price past the
 * grounding guard.
 */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, ".")
    .replace(/\u066c/g, ",");
}

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
  for (const line of facts.priceLines.map(normalizeDigits)) {
    for (const match of line.matchAll(/[\d.,]+/g)) {
      allowed.add(match[0].replace(/[,]/g, ""));
    }
  }
  if (facts.soldQty && facts.soldQty > 0) {
    allowed.add(String(facts.soldQty));
  }
  if (facts.loyaltyStamps && facts.loyaltyStamps > 0) {
    allowed.add(String(facts.loyaltyStamps));
  }

  const text = normalizeDigits(`${copy.headline} ${copy.subline} ${copy.caption}`);
  const moneyPattern =
    /(?:AED|INR|Rs\.?|₹|Dhs?\.?|درهم|دراهم|د\.إ\.?|روبية)\s*([\d.,]+)|([\d.,]+)\s*(?:AED|INR|₹|dirhams?|rupees?|fils|درهم|دراهم|د\.إ\.?|روبية|فلس)/gi;
  for (const match of text.matchAll(moneyPattern)) {
    const raw = (match[1] ?? match[2] ?? "").replace(/[,]/g, "").replace(/\.$/, "");
    if (raw && !allowed.has(raw)) {
      return false;
    }
  }
  return true;
}

/**
 * The poster layouts already show the sold count once, in large type; the
 * headline/subline must not say it again (the caption may).
 */
export function repeatsSalesFigure(copy: PosterCopy, facts: PosterCopyFacts): boolean {
  if (!facts.soldQty || facts.soldQty <= 0) {
    return false;
  }
  const figure = new RegExp(`(^|[^\\d])${facts.soldQty}([^\\d]|$)`);
  return figure.test(normalizeDigits(copy.headline)) || figure.test(normalizeDigits(copy.subline));
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
  const variant = (headline: string, subline: string, caption: string): PosterCopy => ({
    headline: truncateToCap(headline, HEADLINE_MAX),
    subline: truncateToCap(subline, SUBLINE_MAX),
    caption: truncateToCap(caption, CAPTION_MAX)
  });
  const place = facts.restaurantName;

  if (facts.language === "ar") {
    return arabicFallbacks(facts, item, variant);
  }

  if (facts.templateId === "new_item") {
    return [
      variant(`New: ${item}`, `Just landed on the menu at ${place}.`, `${facts.itemName} is new at ${place}. Be one of the first to try it — order on WhatsApp.`),
      variant(`Meet ${item}`, "Fresh on our menu. Come and say hello.", `Say hello to ${facts.itemName}, new at ${place}. Tap to order on WhatsApp.`),
      variant(`${item} has arrived`, "Try it before everyone else does.", `${facts.itemName} has joined the menu at ${place}. Order yours on WhatsApp.`)
    ];
  }
  if (facts.templateId === "loyalty") {
    const reward = facts.loyaltyReward || "a reward";
    return [
      variant("Collect stamps, get rewarded", `Every order brings you closer to ${reward}.`, `Collect a stamp with every order at ${place} and earn ${reward}. Order on WhatsApp.`),
      variant(`Loyalty pays at ${place}`, "Your stamp card fills up with every order.", `Regulars get rewarded at ${place}: stamps on every order, ${reward} at the end. Order on WhatsApp.`),
      variant("Stamp it. Earn it.", `Your next ${reward} is closer than you think.`, `Order on WhatsApp from ${place} and collect stamps towards ${reward}.`)
    ];
  }
  if (facts.templateId === "festival") {
    const occasion = facts.occasion || "the season";
    return [
      variant(`Celebrate with ${place}`, "Warm wishes to you and your family.", `Wishing you a joyful ${occasion} from all of us at ${place}. Order your favourites on WhatsApp.`),
      variant("Festive treats await", "Share the moment over something delicious.", `Celebrate ${occasion} with ${place}. Order on WhatsApp and we'll handle the treats.`),
      variant("From our kitchen to your table", `Wishing you joy this ${occasion}.`, `${occasion} greetings from ${place}. Order on WhatsApp for the whole family.`)
    ];
  }

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
      // The layout shows the sold count; the subline never repeats it.
      subline: truncateToCap(
        `The one regulars at ${facts.restaurantName} keep coming back for.`,
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
        sold ? "This many orders can't be wrong." : "Ask anyone who's tried it.",
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
    if (!copyAmountsGrounded(copy, facts) || repeatsSalesFigure(copy, facts)) {
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

const TEMPLATE_BRIEFS: Record<PosterTemplateId, string> = {
  bestseller: "This is a BESTSELLER / social-proof poster. Confidence, local pride, no clichés.",
  offer: "This is a LIMITED-TIME OFFER poster. Urgency, warmth, no hard-sell clichés.",
  new_item: "This is a NEW ITEM poster announcing a dish just added to the menu. Curiosity and freshness; do not claim it is the best or most popular.",
  loyalty: "This is a LOYALTY STAMP-CARD poster inviting customers to collect stamps on each order and earn the reward. Warm, appreciative of regulars.",
  festival: "This is a FESTIVAL GREETING poster. The greeting itself is already printed on the poster; write warm, respectful supporting lines suitable for the occasion. No discounts unless they are in the facts."
};

function copyPrompt(facts: PosterCopyFacts): string {
  const templateBrief = TEMPLATE_BRIEFS[facts.templateId];
  const priceRule = facts.priceLines.length
    ? `The poster already displays the price (${facts.priceLines.join(" / ")}). You may repeat these EXACT strings, but NEVER any other price, discount, or percentage.`
    : `Mention NO prices, discounts, or percentages — the data has none.`;
  const soldRule =
    facts.soldQty && facts.soldQty > 0
      ? `The poster already shows the sales figure (${facts.soldQty}) in large type. Do NOT repeat it in the headline or subline; you may cite it verbatim once in the caption.`
      : `There is no sales figure — make NO numeric popularity claims.`;

  return `You write short poster copy for a small café in ${facts.market} that takes orders on WhatsApp.
${templateBrief}

Facts (the ONLY things you may reference):
- Café: ${facts.restaurantName}
- ${facts.templateId === "loyalty" ? "Reward" : "Item"}: ${facts.itemName}
- ${priceRule}
- ${soldRule}${facts.occasion ? `\n- Occasion: ${facts.occasion}` : ""}${
    facts.loyaltyStamps ? `\n- Stamp card: ${facts.loyaltyStamps} stamps earn the reward (you may cite ${facts.loyaltyStamps} verbatim).` : ""
  }

Write ${COPY_VARIANT_COUNT} distinct variants. Reply with ONLY a JSON array (no markdown fences), each element:
{"headline": string (max ${HEADLINE_MAX} chars, punchy, no emoji),
 "subline": string (max ${SUBLINE_MAX} chars, one warm supporting line),
 "caption": string (max ${CAPTION_MAX} chars, WhatsApp caption ending with a call to order on WhatsApp; at most one emoji)}

Hard rules: character caps are absolute. ${
    facts.language === "ar"
      ? "Write in clear Modern Standard Arabic that reads naturally in the Gulf; keep item and café names exactly as given."
      : "English only."
  } Never invent numbers, prices, ingredients, or claims not in the facts.`;
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

type VariantBuilder = (headline: string, subline: string, caption: string) => PosterCopy;

/** Deterministic Arabic copy (no numbers, so nothing to ground). */
function arabicFallbacks(facts: PosterCopyFacts, item: string, variant: VariantBuilder): PosterCopy[] {
  const place = facts.restaurantName;
  switch (facts.templateId) {
    case "offer":
      return [
        variant(`${item} بعرض خاص`, `لفترة محدودة في ${place}.`, `عرض خاص على ${facts.itemName} في ${place} لفترة محدودة. اطلب على واتساب قبل ما يخلص.`),
        variant(`عرض على ${item}`, "سعر أحلى، والعرض ما يطول.", `لا تفوّت عرض ${facts.itemName} في ${place}. اطلب الحين على واتساب.`),
        variant(`${item} بسعر أحلى`, "اليوم أحسن يوم تجربه فيه.", `${facts.itemName} بسعر خاص في ${place}. اطلب على واتساب.`)
      ];
    case "new_item":
      return [
        variant(`جديد: ${item}`, `وصل حديثًا إلى قائمة ${place}.`, `${facts.itemName} صار في قائمة ${place}! كن من أول من يجربه، اطلب على واتساب.`),
        variant(`تعرّف على ${item}`, "طبق جديد في قائمتنا.", `جديدنا في ${place}: ${facts.itemName}. اطلبه الحين على واتساب.`),
        variant(`${item} وصل`, "جرّبه قبل الكل.", `${facts.itemName} انضم لقائمة ${place}. اطلب على واتساب.`)
      ];
    case "loyalty": {
      const reward = facts.loyaltyReward || "مكافأة";
      return [
        variant("اجمع الأختام واربح", `كل طلب يقرّبك من ${reward}.`, `اجمع ختمًا مع كل طلب من ${place} واربح ${reward}. اطلب على واتساب.`),
        variant(`الولاء له مكافأة في ${place}`, "بطاقتك تمتلئ مع كل طلب.", `زبائننا الدائمون لهم مكافأة في ${place}. اطلب على واتساب واجمع الأختام.`),
        variant("اطلب، اجمع، اربح", `${reward} أقرب مما تتوقع.`, `اطلب من ${place} على واتساب واجمع الأختام للحصول على ${reward}.`)
      ];
    }
    case "festival": {
      const occasion = facts.occasion || "المناسبة";
      return [
        variant(`احتفلوا مع ${place}`, "أطيب التمنيات لكم ولعائلاتكم.", `كل عام وأنتم بخير بمناسبة ${occasion} من فريق ${place}. اطلبوا على واتساب.`),
        variant("أطيب الأطباق للمناسبة", "شاركوا الفرحة مع أحبابكم.", `احتفلوا بـ${occasion} مع ${place}. اطلبوا على واتساب.`),
        variant("من مطبخنا إلى سفرتكم", "نتمنى لكم أيامًا سعيدة.", `تهانينا بمناسبة ${occasion} من ${place}. اطلبوا للعائلة على واتساب.`)
      ];
    }
    default:
      return [
        variant(`الأكثر طلبًا: ${item}`, `اللي يرجع له الكل في ${place}.`, `${facts.itemName} من أكثر الطلبات في ${place}. اطلبه الحين على واتساب.`),
        variant(`${item}… وبس`, "جرّبه وتعرف السبب.", `في سبب إن ${facts.itemName} يتصدر قائمة ${place}. اطلب على واتساب.`),
        variant(`الكل يطلب ${item}`, "تعال اكتشف ليش.", `${facts.itemName} المفضّل عند الكل في ${place}. اطلب على واتساب.`)
      ];
  }
}

