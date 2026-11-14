import "server-only";

import {
  DEFAULT_AI_IMAGE_STYLE_PRESET,
  isAiImageStylePreset,
  type AiImageStylePreset
} from "@/lib/ai/image-style-presets";

// AI food-image generation for the admin menu editor. Server-only: the Google
// AI Studio key never reaches the browser. Mirrors the provider isolation in
// src/lib/menu-extraction/extract.ts — swapping models is an env change and a
// future provider swap stays a one-file change.

// Per-preset prompt guidance, keyed by the labels shared with the client in
// src/lib/ai/image-style-presets.ts. Each line gives the model a concrete look.
const STYLE_PRESET_GUIDANCE: Record<AiImageStylePreset, string> = {
  "Premium Studio Food Photo":
    "Premium studio food photography. Soft diffused key light, gentle shadows, shallow depth of field, neutral seamless backdrop.",
  "Restaurant Table Style":
    "Served on a clean restaurant table with subtle props, warm ambient light, slightly blurred café background.",
  "Dark Luxury Style":
    "Moody dark luxury food photography. Dark slate or charcoal surface, dramatic side lighting, rich contrast, elegant feel.",
  "Fast Food Takeaway Style":
    "Bright, punchy fast-food takeaway look. Clean countertop, vivid appetizing colours, energetic and casual.",
  "Café Beverage Style":
    "Bright café beverage styling. Clean light surface, fresh and refreshing mood, soft natural daylight.",
  "Dessert Display Style":
    "Inviting dessert-display styling. Soft warm light, delicate plating, tempting close-up presentation.",
  "Clean White Background":
    "Catalogue-style shot on a clean pure-white background, even soft lighting, no props, product perfectly centered."
};

export type GenerateMenuItemImageInput = {
  restaurantName: string;
  productName: string;
  categoryName: string;
  description?: string | null;
  price?: number | null;
  servingStyle?: string | null;
  stylePreset: string;
};

export type GeneratedMenuItemImage = {
  imageBuffer: Buffer;
  mimeType: string;
  prompt: string;
  model: string;
};

// Reuse the same Google AI Studio key as the rest of the app (menu extraction,
// descriptions). GOOGLE_AI_API_KEY is accepted as an alias for parity with
// teams that provision the key under Google's documented name.
function imageApiKey() {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
}

// The image model is configurable so we never hardcode a paid model. Default to
// the flash image model only when nothing is set.
function imageModel() {
  return (
    process.env.GEMINI_IMAGE_MODEL ??
    process.env.GOOGLE_IMAGE_MODEL ??
    "gemini-2.5-flash-image"
  );
}

// Picks the container/plate the food should be shown in, from the category or
// product name. Keeps presentation believable for a small UAE cafeteria.
export function inferServingStyle(productName: string, categoryName: string): string {
  const haystack = `${categoryName} ${productName}`.toLowerCase();
  const has = (...needles: string[]) => needles.some((needle) => haystack.includes(needle));

  if (has("burger")) {
    return "burger in a burger box or on a plate";
  }
  if (has("fries")) {
    return "550ml takeaway container";
  }
  if (has("roll", "porotta", "paratha", "sandwich", "wrap")) {
    return "paper wrap or plate";
  }
  if (has("tea", "karak", "coffee", "latte", "cappuccino")) {
    return "paper cup or glass cup";
  }
  if (has("juice", "mocktail", "shake", "smoothie", "mojito")) {
    return "glass or takeaway cup";
  }
  if (has("dessert", "cake", "ice cream", "kunafa", "pudding", "waffle")) {
    return "dessert plate";
  }
  return "restaurant serving plate";
}

function buildPrompt(input: GenerateMenuItemImageInput): string {
  const presetKey = isAiImageStylePreset(input.stylePreset)
    ? input.stylePreset
    : DEFAULT_AI_IMAGE_STYLE_PRESET;
  const presetGuidance = `${presetKey}. ${STYLE_PRESET_GUIDANCE[presetKey]}`;
  const servingStyle =
    (input.servingStyle ?? "").trim() ||
    inferServingStyle(input.productName, input.categoryName);
  const description = (input.description ?? "").trim() || "(no description provided)";

  return `Create a realistic, appetizing food product image for a restaurant digital menu.

Product name: ${input.productName}
Category: ${input.categoryName}
Description: ${description}
Cuisine/style: UAE cafeteria / café / fast-food style
Serving style: ${servingStyle}
Restaurant brand feel: clean, modern, premium but affordable

Style preset:
${presetGuidance}

Image requirements:
- The food should look fresh, tasty, and realistic.
- Show the product as the main subject, centered and clearly visible.
- Use natural restaurant lighting with slight shadows.
- Background should be clean and not distracting.
- Make it suitable for a mobile food ordering menu.
- The image should look like professional food photography.
- Do not add any text, price, logo, watermark, people, hands, or extra objects.
- Do not make the portion look unrealistically large.
- Keep the food presentation believable for a small UAE cafeteria.

Output format:
Square image, 1:1 ratio, high quality, suitable for menu item display.`;
}

type GeminiImagePart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

type GeminiImageResponse = {
  candidates?: { content?: { parts?: GeminiImagePart[] } }[];
};

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POSTs to the Gemini endpoint, retrying transient failures (network/timeout,
// 429, 5xx) with backoff. Throws "REQUEST_FAILED:<status|reason>" so the caller
// can tell a "busy, retry" case apart from a real misconfiguration. Mirrors the
// retry helper in src/lib/menu-extraction/extract.ts.
async function fetchGeminiWithRetry(endpoint: string, body: string): Promise<Response> {
  const maxAttempts = 3;
  let lastReason = "network";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Image generation is slower than text; allow more headroom than the
        // 45s used for extraction, but still fail fast enough to not hang the UI.
        signal: AbortSignal.timeout(60000),
        body
      });
    } catch (error) {
      lastReason = error instanceof Error ? error.name : "network";
      console.error("WhatsOrder AI image generation fetch failed", {
        model: imageModel(),
        attempt,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
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
    console.error("WhatsOrder AI image generation request failed", {
      model: imageModel(),
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

  throw new Error(`REQUEST_FAILED:${lastReason}`);
}

function firstInlineImage(payload: GeminiImageResponse): { data: string; mimeType: string } | null {
  for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
    // The REST response returns camelCase inlineData; accept snake_case too in
    // case a model variant echoes the request casing.
    const inline = part.inlineData ?? part.inline_data;
    const data = inline?.data;
    if (data) {
      const mimeType =
        (inline as { mimeType?: string }).mimeType ??
        (inline as { mime_type?: string }).mime_type ??
        "image/png";
      return { data, mimeType };
    }
  }
  return null;
}

export type GeminiImageResult = { imageBuffer: Buffer; mimeType: string; model: string };

/**
 * One call to the Google image model: a text prompt plus an optional input
 * image (for edits such as a studio cut-out of an owner photo). Shared by the
 * menu editor and Poster Studio. Throws the same codes as
 * generateMenuItemImage.
 */
export async function generateGeminiImage(input: {
  prompt: string;
  inputImage?: { buffer: Buffer; mimeType: string };
}): Promise<GeminiImageResult> {
  const apiKey = imageApiKey();
  if (!apiKey) {
    throw new Error("AI_IMAGE_NOT_CONFIGURED");
  }
  const model = imageModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const parts: Record<string, unknown>[] = [{ text: input.prompt }];
  if (input.inputImage) {
    parts.push({
      inlineData: {
        mimeType: input.inputImage.mimeType,
        data: input.inputImage.buffer.toString("base64")
      }
    });
  }
  const requestBody = JSON.stringify({
    contents: [{ parts }],
    // gemini-2.5-flash-image returns an image part when IMAGE is requested.
    generationConfig: { responseModalities: ["IMAGE"] }
  });

  const response = await fetchGeminiWithRetry(endpoint, requestBody);
  const payload = (await response.json()) as GeminiImageResponse;
  const image = firstInlineImage(payload);
  if (!image) {
    console.error("WhatsOrder AI image generation returned no image", { model });
    throw new Error("AI_IMAGE_NO_OUTPUT");
  }
  return { imageBuffer: Buffer.from(image.data, "base64"), mimeType: image.mimeType, model };
}

/** Flat key colour the poster cut-out prompt asks for (removed in code). */
export const POSTER_CUTOUT_KEY_HEX = "#ff00ff";

/**
 * Prompt for a studio cut-out of an owner's dish photo. Deliberately carries
 * NO item name, price or restaurant name: the model is never given words or
 * numbers it could render.
 */
export function posterCutoutPrompt(): string {
  return `Using the attached photo, produce a clean studio product image of the SAME dish.

Rules:
- Keep the same food, the same container or plate and the same portion. Do not add, remove or restyle food items.
- Place the dish centred, filling about 70% of the frame, seen from a slightly elevated angle.
- Background: a perfectly flat, uniform pure magenta (${POSTER_CUTOUT_KEY_HEX}) with no gradient, no texture, no surface, no props and no shadow on the background.
- Soft, even studio lighting on the dish; appetising, realistic colours.
- Absolutely no text, letters, numbers, prices, logos, labels, watermarks, hands or people.

Output: square image, 1:1.`;
}

/** Generic subject words for a background, from the category only (never the item name). */
export function posterBackgroundTheme(categoryName: string, productName: string): string {
  const style = inferServingStyle(productName, categoryName);
  if (style.includes("cup")) return "tea and coffee: loose tea leaves, cardamom pods, cinnamon sticks, coffee beans";
  if (style.includes("dessert")) return "desserts: cocoa dust, pistachio crumbs, rose petals, caramel drizzle";
  if (style.includes("glass")) return "fresh drinks: citrus slices, mint leaves, ice, fruit";
  if (style.includes("burger") || style.includes("550ml")) return "street food: sesame seeds, chilli flakes, herbs, paper wrapping";
  return "home-style cooking: whole spices, fresh herbs, chillies, rustic textures";
}

/**
 * Prompt for an illustrated background used when an item has no photo. No
 * item name, price or restaurant name is ever included.
 */
export function posterBackgroundPrompt(theme: string): string {
  return `Create an appetising, richly textured background image for a café poster themed around ${theme}.

Rules:
- Flat-lay or close-up texture filling the whole frame; the upper half busier, the lower third darker and calmer so text can sit on it later.
- Warm, natural light; realistic photographic or painterly style; no single dish as the hero.
- Absolutely no text, letters, numbers, prices, logos, labels, packaging with writing, watermarks, hands or people.

Output: square image, 1:1.`;
}

/**
 * Generates one appetizing food image for a menu item using the Google image
 * model and returns the raw bytes for the caller to store. Throws on a hard
 * failure so the server action can surface a friendly message and let the admin
 * retry:
 *   AI_IMAGE_NOT_CONFIGURED — no API key set
 *   AI_IMAGE_NO_OUTPUT      — the model returned no image part
 *   REQUEST_FAILED:<reason> — network/upstream error (carries status)
 */
export async function generateMenuItemImage(
  input: GenerateMenuItemImageInput
): Promise<GeneratedMenuItemImage> {
  const prompt = buildPrompt(input);
  const generated = await generateGeminiImage({ prompt });
  return { ...generated, prompt };
}
