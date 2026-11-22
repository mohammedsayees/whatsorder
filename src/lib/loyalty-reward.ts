// lib/loyalty-reward.ts
//
// Cafés often type their stamp reward as "Free Crunch Burger", while the UI
// already says "2 more to a free …". Strip a leading/trailing "free" so the
// sentence never reads "a free Free Crunch Burger". Pure; client-safe.

const FREE_WORD = /^\s*free\b[\s:-]*/i;
const ARABIC_FREE = /^\s*(?:مجانا|مجاناً|مجاني|مجانية)\s+|\s+(?:مجانا|مجاناً|مجاني|مجانية)\s*$/g;

/** The reward's name without a "free" prefix, or null when nothing is left. */
export function loyaltyRewardName(reward: string | null | undefined): string | null {
  const cleaned = (reward ?? "").replace(FREE_WORD, "").replace(ARABIC_FREE, "").trim();
  return cleaned || null;
}
