// lib/poster/festivals.ts
//
// Festival posters: occasions offered per restaurant country, with fixed,
// code-owned greetings (the AI writes only the supporting line) and
// code-drawn ornaments. No dates are claimed — the owner picks the occasion.

import type { CountryCode } from "@/lib/types";

export const FESTIVAL_IDS = [
  "ramadan",
  "eid_al_fitr",
  "eid_al_adha",
  "uae_national_day",
  "diwali",
  "holi",
  "india_independence_day"
] as const;
export type FestivalId = (typeof FESTIVAL_IDS)[number];

export function isFestivalId(value: unknown): value is FestivalId {
  return typeof value === "string" && (FESTIVAL_IDS as readonly string[]).includes(value);
}

export type FestivalOrnament = "crescent" | "flag_stripes_ae" | "diya" | "colour_splash" | "flag_stripes_in";

export type Festival = {
  id: FestivalId;
  label: string;
  /** Large greeting set on the poster (code-owned, never AI). */
  greeting: string;
  /** Arabic greeting, shown alongside for Arabic-speaking audiences. */
  greetingAr?: string;
  ornament: FestivalOrnament;
  /** Ornament colours (fixed per occasion; text colours still come from the palette). */
  colours: string[];
};

export const FESTIVALS: Record<FestivalId, Festival> = {
  ramadan: {
    id: "ramadan",
    label: "Ramadan",
    greeting: "Ramadan Kareem",
    greetingAr: "رمضان كريم",
    ornament: "crescent",
    colours: ["#e8b84a", "#f6e3a1"]
  },
  eid_al_fitr: {
    id: "eid_al_fitr",
    label: "Eid al-Fitr",
    greeting: "Eid Mubarak",
    greetingAr: "عيد مبارك",
    ornament: "crescent",
    colours: ["#e8b84a", "#f6e3a1"]
  },
  eid_al_adha: {
    id: "eid_al_adha",
    label: "Eid al-Adha",
    greeting: "Eid Mubarak",
    greetingAr: "عيد مبارك",
    ornament: "crescent",
    colours: ["#e8b84a", "#f6e3a1"]
  },
  uae_national_day: {
    id: "uae_national_day",
    label: "UAE National Day",
    greeting: "Happy National Day",
    greetingAr: "عيد اتحاد سعيد",
    ornament: "flag_stripes_ae",
    colours: ["#00843d", "#ffffff", "#111111", "#ce1126"]
  },
  diwali: {
    id: "diwali",
    label: "Diwali",
    greeting: "Happy Diwali",
    ornament: "diya",
    colours: ["#f5a623", "#e94e1b", "#ffd36b"]
  },
  holi: {
    id: "holi",
    label: "Holi",
    greeting: "Happy Holi",
    ornament: "colour_splash",
    colours: ["#e83e8c", "#ffbe0b", "#3a86ff", "#06d6a0", "#fb5607"]
  },
  india_independence_day: {
    id: "india_independence_day",
    label: "Independence Day",
    greeting: "Happy Independence Day",
    ornament: "flag_stripes_in",
    colours: ["#ff9933", "#ffffff", "#138808"]
  }
};

/** Occasions offered to a restaurant, chosen from its country. */
export function festivalsForCountry(country: CountryCode | string | null | undefined): Festival[] {
  const ids: FestivalId[] =
    country === "IN"
      ? ["diwali", "holi", "eid_al_fitr", "india_independence_day"]
      : ["ramadan", "eid_al_fitr", "eid_al_adha", "uae_national_day"];
  return ids.map((id) => FESTIVALS[id]);
}
