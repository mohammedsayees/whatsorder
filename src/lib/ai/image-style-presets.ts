// Style presets for AI menu-image generation. Kept in a client-safe module (no
// "server-only") so the admin modal and the server generator share one source
// of truth for the labels. The richer per-preset prompt guidance lives
// server-side in google-image.ts.

export const AI_IMAGE_STYLE_PRESETS = [
  "Premium Studio Food Photo",
  "Restaurant Table Style",
  "Dark Luxury Style",
  "Fast Food Takeaway Style",
  "Café Beverage Style",
  "Dessert Display Style",
  "Clean White Background"
] as const;

export type AiImageStylePreset = (typeof AI_IMAGE_STYLE_PRESETS)[number];

export const DEFAULT_AI_IMAGE_STYLE_PRESET: AiImageStylePreset =
  "Premium Studio Food Photo";

export function isAiImageStylePreset(value: string): value is AiImageStylePreset {
  return (AI_IMAGE_STYLE_PRESETS as readonly string[]).includes(value);
}
