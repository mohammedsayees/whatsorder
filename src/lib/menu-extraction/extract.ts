import "server-only";

// A single extracted menu line. Prices are numbers in AED. Size variants in the
// source (e.g. "AED 6/10") are split into separate items by the model.
export type DraftMenuItem = {
  category: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  price: number;
  is_featured: boolean;
  confidence: "high" | "low";
};

const MENU_EXTRACTION_PROMPT = `You are extracting menu items from ONE page image of a restaurant menu.

Return ONLY JSON of the shape:
{ "items": [ { "category": string, "name": string, "name_ar": string|null, "description": string|null, "price": number, "is_featured": boolean, "confidence": "high"|"low" } ] }

Rules:
- "category" is the section the items belong to. Menus often print the section name as a large banner or heading on the page (e.g. "Fresh Burger", "Loaded Fries", "Mojitos"). Use that. Strip trailing punctuation.
- "name" is the English item name. "name_ar" is the Arabic name if present on the card, otherwise null.
- "price" is a number in AED. Read it from the price badge/label. If a single item shows two prices for sizes (e.g. "6/10" or "Small 6 Large 10"), output TWO items: "<name> (Small)" and "<name> (Large)" with their respective prices. Never put a slash or range in price.
- "description" is any short descriptive line under the name, or null. Do not invent descriptions.
- "is_featured" is true only if the card clearly shows a "BEST SELLER" / "POPULAR" style badge.
- "confidence" is "low" if the name or price is blurry, ambiguous, or you are unsure; otherwise "high".
- If the page is a cover, contact page, or section divider with no purchasable items, return { "items": [] }.
- Do NOT invent items that are not visibly on the page. Do NOT include prices you cannot read.`;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

function defaultModel() {
  return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
}

function clampPrice(value: unknown): number | null {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    return null;
  }
  return Math.round(price * 100) / 100;
}

function normalizeItems(raw: unknown): DraftMenuItem[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  const normalized: DraftMenuItem[] = [];

  for (const entry of items) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    const price = clampPrice(record.price);

    // Skip anything missing the two fields an order actually needs.
    if (!name || price === null) {
      continue;
    }

    const nameAr = String(record.name_ar ?? "").trim();
    const description = String(record.description ?? "").trim();

    normalized.push({
      category: String(record.category ?? "").trim() || "Menu",
      name: name.slice(0, 120),
      name_ar: nameAr ? nameAr.slice(0, 120) : null,
      description: description ? description.slice(0, 300) : null,
      price,
      is_featured: record.is_featured === true,
      confidence: record.confidence === "low" ? "low" : "high"
    });
  }

  return normalized;
}

// Statuses worth retrying: rate-limit and the transient server-side errors the
// Gemini endpoint emits under load. A 4xx like 400/401/403 is a hard config
// problem and is not retried.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POSTs to the Gemini endpoint, retrying transient failures (network/timeout,
 * 429, 5xx) a few times with backoff. Throws an Error whose message carries the
 * upstream status/reason (e.g. "REQUEST_FAILED:503") so the caller can tell a
 * "busy, retry" case apart from a real misconfiguration.
 */
async function fetchGeminiWithRetry(
  endpoint: string,
  body: string,
  label: string
): Promise<Response> {
  const maxAttempts = 3;
  let lastReason = "network";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Fail fast rather than hang the serverless function (and the UI) if the
        // model is slow or unreachable.
        signal: AbortSignal.timeout(45000),
        body
      });
    } catch (error) {
      lastReason = error instanceof Error ? error.name : "network";
      console.error(`WhatsOrder ${label} fetch failed`, {
        model: defaultModel(),
        attempt,
        reason: error instanceof Error ? error.name + ": " + error.message : String(error)
      });
      if (attempt < maxAttempts) {
        await sleep(500 * attempt);
        continue;
      }
      throw new Error(`REQUEST_FAILED:${lastReason}`);
    }

    if (response.ok) {
      return response;
    }

    lastReason = String(response.status);
    const detail = await response.text().catch(() => "");
    console.error(`WhatsOrder ${label} request failed`, {
      model: defaultModel(),
      attempt,
      status: response.status,
      detail: detail.slice(0, 800)
    });

    if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts) {
      await sleep(500 * attempt);
      continue;
    }
    throw new Error(`REQUEST_FAILED:${response.status}`);
  }

  // Unreachable: the loop either returns a response or throws.
  throw new Error(`REQUEST_FAILED:${lastReason}`);
}

/**
 * Sends one rendered menu page to the vision model and returns the structured
 * items found on it. Throws on a hard failure (missing key, network/model
 * error) so the caller can surface a friendly message and let the user retry.
 *
 * The provider is Gemini today; swapping models is an env change (GEMINI_MODEL)
 * and isolating it here keeps a future Claude/OpenAI provider a one-file change.
 */
export async function extractMenuPageItems(
  imageBase64: string,
  mimeType: string
): Promise<DraftMenuItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("MENU_EXTRACTION_NOT_CONFIGURED");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel()}:generateContent?key=${apiKey}`;
  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: MENU_EXTRACTION_PROMPT },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      // gemini-2.5-flash is a thinking model; left on, it spends the
      // response budget reasoning and either blows past the 45s timeout or
      // truncates the JSON — both surface as "Couldn't read this page".
      // Structured extraction needs none of it, so turn thinking off.
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  // 2.5-flash routinely returns transient 503 "overloaded" / 429 rate-limit
  // blips that succeed on a quick retry. Without this, a single blip surfaced
  // to the user as "Couldn't read this page" even though the page was fine.
  const response = await fetchGeminiWithRetry(endpoint, requestBody, "menu extraction");
  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    return [];
  }

  try {
    return normalizeItems(JSON.parse(text));
  } catch {
    console.error("WhatsOrder menu extraction returned unparsable JSON");
    throw new Error("MENU_EXTRACTION_BAD_RESPONSE");
  }
}

/**
 * Writes a short, appetizing description for each item in a single model call.
 * Returns a name -> description map; names not returned are simply skipped.
 * Used to fill in descriptions for menus that print only names and prices.
 */
export async function generateItemDescriptions(
  items: { name: string; category: string }[]
): Promise<Record<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || items.length === 0) {
    return {};
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel()}:generateContent?key=${apiKey}`;
  const list = items
    .slice(0, 200)
    .map((item) => `- ${item.name} (${item.category})`)
    .join("\n");
  const prompt = `Write a short, appetizing menu description for each item below.

Rules:
- Max 12 words each. No price, no emojis, no quotes.
- Natural, mouth-watering, specific to the item.
- Return ONLY JSON: { "items": [ { "name": string, "description": string } ] }
- Use the exact item names given.

Items:
${list}`;

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.5,
      responseMimeType: "application/json",
      // Same reason as extraction: skip the 2.5-flash thinking phase so the
      // call stays inside the 45s timeout and returns clean JSON.
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  const response = await fetchGeminiWithRetry(endpoint, requestBody, "description generation");
  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const map: Record<string, string> = {};

  // The prompt lists items as "Name (Category)" and tells the model to reuse the
  // exact names, so it often echoes the whole "Name (Category)" string back as
  // the name. Match returned names to the original input names on a normalized
  // key and key the result by the original name — that's what the caller looks
  // up. Without this the descriptions come back but never land on any item.
  const normalizeName = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s*\([^()]*\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  const inputByNormalized = new Map(items.map((item) => [normalizeName(item.name), item.name]));

  try {
    const parsed = JSON.parse(text) as { items?: { name?: unknown; description?: unknown }[] };
    for (const entry of parsed.items ?? []) {
      const name = String(entry.name ?? "").trim();
      const description = String(entry.description ?? "").trim();
      if (name && description) {
        const inputName = inputByNormalized.get(normalizeName(name)) ?? name;
        map[inputName] = description.slice(0, 300);
      }
    }
  } catch {
    console.error("WhatsOrder description generation returned unparsable JSON");
  }

  return map;
}

/**
 * Writes a single short, appetizing English description for one item. Returns
 * null when AI is not configured or the model returns nothing usable, so the
 * caller can fall back to manual entry. Powers the "Generate" button on the
 * single-item edit form.
 */
export async function generateSingleItemDescription(
  name: string,
  category: string
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const map = await generateItemDescriptions([{ name: trimmed, category: category.trim() }]);
  return map[trimmed] ?? null;
}

export type ItemTranslation = {
  name_ar: string | null;
  description_ar: string | null;
};

/**
 * Translates an item's English name and description into Modern Standard
 * Arabic in a single model call. Returns nulls when AI is unconfigured or the
 * response is unusable, so the caller can fall back to manual entry. Powers the
 * "Translate → عربي" button on the single-item edit form.
 */
export async function translateItemToArabic(input: {
  name: string;
  description?: string | null;
}): Promise<ItemTranslation> {
  const apiKey = process.env.GEMINI_API_KEY;
  const name = input.name.trim();
  const description = (input.description ?? "").trim();

  if (!apiKey || !name) {
    return { name_ar: null, description_ar: null };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel()}:generateContent?key=${apiKey}`;
  const prompt = `Translate this restaurant menu item into Modern Standard Arabic for a UAE menu.

Rules:
- Translate the meaning naturally; do not translate word-for-word.
- For well-known dish or brand names, use the spelling UAE diners expect (transliterate when there is no common Arabic name).
- Keep the description short and appetizing. No emojis, no quotes, no Latin letters unless a brand name has no Arabic form.
- If a field is empty, return null for it.
- Return ONLY JSON: { "name_ar": string|null, "description_ar": string|null }

English name: ${name}
English description: ${description || "(none)"}`;

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      // Same reason as extraction: skip the 2.5-flash thinking phase so the
      // call stays inside the timeout and returns clean JSON.
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  const response = await fetchGeminiWithRetry(endpoint, requestBody, "item translation");
  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    return { name_ar: null, description_ar: null };
  }

  try {
    const parsed = JSON.parse(text) as { name_ar?: unknown; description_ar?: unknown };
    const toValue = (value: unknown) => {
      const str = String(value ?? "").trim();
      return str ? str.slice(0, 300) : null;
    };
    return {
      name_ar: toValue(parsed.name_ar),
      description_ar: toValue(parsed.description_ar)
    };
  } catch {
    console.error("WhatsOrder item translation returned unparsable JSON");
    return { name_ar: null, description_ar: null };
  }
}
