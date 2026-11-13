// lib/poster/offer-math.ts
//
// Poster numbers computed in CODE from tenant data — the AI never produces or
// alters a price, saving or percentage.

/** "AED 12.00" → "AED 12"; "AED 12.50" stays. Poster display only. */
export function trimWholeAmount(formatted: string): string {
  return formatted.replace(/([.,٫])0{2}(?!\d)/, "");
}

/**
 * The saving stamp for an offer, or null when there is no real cut.
 *
 * Picks the rounder, more striking figure:
 *   1. a percentage that is an exact multiple of 5 (e.g. "25% OFF");
 *   2. otherwise a whole-currency saving ("SAVE AED 4");
 *   3. otherwise the percentage rounded DOWN, never up ("33% OFF").
 * Savings under 5% aren't worth a stamp and are shown as an amount only if
 * whole; anything else gets no stamp.
 */
export function savingStampLabel(
  regularPrice: number | null | undefined,
  promotionalPrice: number | null | undefined,
  /** The restaurant's own currency formatter (formatCurrency). */
  formatAmount: (amount: number) => string
): string | null {
  if (
    typeof regularPrice !== "number" ||
    typeof promotionalPrice !== "number" ||
    !Number.isFinite(regularPrice) ||
    !Number.isFinite(promotionalPrice) ||
    regularPrice <= 0 ||
    promotionalPrice < 0 ||
    promotionalPrice >= regularPrice
  ) {
    return null;
  }
  // Work in minor units to dodge float noise (15 - 11.25 etc.).
  const savingMinor = Math.round(regularPrice * 100) - Math.round(promotionalPrice * 100);
  if (savingMinor <= 0) {
    return null;
  }
  const percent = (savingMinor / Math.round(regularPrice * 100)) * 100;
  const exactPercent = Math.abs(percent - Math.round(percent)) < 1e-9;
  const wholeSaving = savingMinor % 100 === 0;

  if (exactPercent && Math.round(percent) % 5 === 0 && percent >= 10) {
    return `${Math.round(percent)}% OFF`;
  }
  if (wholeSaving) {
    return `SAVE ${trimWholeAmount(formatAmount(savingMinor / 100))}`;
  }
  if (percent >= 5) {
    return `${Math.floor(percent)}% OFF`;
  }
  return null;
}
