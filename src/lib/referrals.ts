// lib/referrals.ts
//
// Referral program helpers (share the café; when the friend's first order is
// completed, both get points). Pure and dependency-free so client components
// can import it. The rules themselves are enforced in the database
// (20261214090000_referral_program.sql); this file only shapes inputs/outputs.

const CODE_PATTERN = /^[a-z0-9]{4,12}$/;

/** The `?src=` token a referral link carries (lands on orders.attribution_source). */
export function referralSource(code: unknown): string | null {
  if (typeof code !== "string") {
    return null;
  }
  const candidate = code.trim().toLowerCase();
  return CODE_PATTERN.test(candidate) ? `ref-${candidate}` : null;
}

export interface ReferralSummary {
  enabled: boolean;
  /** Points the customer holds right now. */
  balance: number;
  /** Points each side earns per completed referral. */
  pointsEach: number;
  /** Points needed to redeem one voucher. */
  redeemPoints: number;
  /** Voucher value (restaurant currency) one redemption buys. */
  rewardValue: number;
}

function whole(value: unknown, fallback: number): number {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? Math.floor(number) : fallback;
}

function amount(value: unknown, fallback: number): number {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : fallback;
}

/** Normalizes the get_referral_summary jsonb; null when malformed. */
export function parseReferralSummary(data: unknown): ReferralSummary | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const source = data as Record<string, unknown>;
  return {
    enabled: source.enabled === true,
    balance: Math.max(0, whole(source.balance, 0)),
    pointsEach: Math.max(1, whole(source.points_each, 20)),
    redeemPoints: Math.max(1, whole(source.redeem_points, 100)),
    rewardValue: Math.max(0, amount(source.reward_value, 5))
  };
}

/** Only worth showing on the account page if the programme is on or points remain. */
export function shouldShowReferral(summary: ReferralSummary | null): summary is ReferralSummary {
  return Boolean(summary && (summary.enabled || summary.balance > 0));
}

export interface ReferralSettings {
  referral_enabled: boolean;
  referral_points_each: number;
  referral_redeem_points: number;
  referral_reward_value: number;
  referral_min_order: number;
}

export const REFERRAL_LIMITS = {
  pointsEach: { min: 1, max: 1000, fallback: 20 },
  redeemPoints: { min: 1, max: 100000, fallback: 100 },
  rewardValue: { min: 1, max: 1000, fallback: 5 },
  minOrder: { min: 0, max: 100000, fallback: 0 }
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Owner-entered form values → a row the database CHECK constraints accept. */
export function parseReferralSettingsInput(input: {
  enabled: boolean;
  pointsEach: unknown;
  redeemPoints: unknown;
  rewardValue: unknown;
  minOrder: unknown;
}): ReferralSettings {
  const { pointsEach, redeemPoints, rewardValue, minOrder } = REFERRAL_LIMITS;
  return {
    referral_enabled: input.enabled,
    referral_points_each: clamp(
      whole(input.pointsEach, pointsEach.fallback),
      pointsEach.min,
      pointsEach.max
    ),
    referral_redeem_points: clamp(
      whole(input.redeemPoints, redeemPoints.fallback),
      redeemPoints.min,
      redeemPoints.max
    ),
    referral_reward_value: clamp(
      Math.round(amount(input.rewardValue, rewardValue.fallback) * 100) / 100,
      rewardValue.min,
      rewardValue.max
    ),
    referral_min_order: clamp(
      Math.round(amount(input.minOrder, minOrder.fallback) * 100) / 100,
      minOrder.min,
      minOrder.max
    )
  };
}
