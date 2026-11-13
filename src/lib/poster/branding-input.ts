// lib/poster/branding-input.ts
//
// Parses the settings "Poster branding" form. Pure; anything invalid becomes
// null (→ derive from logo / default theme), never an error stored in the DB.

import { normalizeHex } from "./palette";
import { isPosterThemeId, type PosterThemeId } from "./themes";

export type PosterBrandingUpdate = {
  poster_brand_color: string | null;
  poster_theme: PosterThemeId | null;
};

export function parsePosterBrandingForm(formData: FormData): PosterBrandingUpdate {
  const useCustom = formData.get("colour_source") === "custom";
  const theme = formData.get("poster_theme");
  return {
    poster_brand_color: useCustom ? normalizeHex(formData.get("poster_brand_color")) : null,
    poster_theme: isPosterThemeId(theme) ? theme : null
  };
}
