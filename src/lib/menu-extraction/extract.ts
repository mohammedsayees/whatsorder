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
  return process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("WhatsOrder menu extraction request failed", {
      status: response.status,
      detail: detail.slice(0, 500)
    });
    throw new Error("MENU_EXTRACTION_REQUEST_FAILED");
  }

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
