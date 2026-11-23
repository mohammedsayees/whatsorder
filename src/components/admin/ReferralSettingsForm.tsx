import { updateReferralSettingsAction } from "@/app/actions";
import { REFERRAL_LIMITS } from "@/lib/referrals";
import type { Restaurant } from "@/lib/types";

const inputClass =
  "focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 disabled:bg-stone-50";

export function ReferralSettingsForm({
  restaurant,
  canWrite,
  stats
}: {
  restaurant: Restaurant;
  canWrite: boolean;
  stats: { referrals: number; pointsIssued: number; pointsRedeemed: number };
}) {
  const currency = restaurant.currency_code ?? "AED";
  const pointsEach = restaurant.referral_points_each ?? REFERRAL_LIMITS.pointsEach.fallback;
  const redeemPoints = restaurant.referral_redeem_points ?? REFERRAL_LIMITS.redeemPoints.fallback;
  const rewardValue = restaurant.referral_reward_value ?? REFERRAL_LIMITS.rewardValue.fallback;

  return (
    <form
      action={updateReferralSettingsAction}
      className="max-w-2xl rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-black text-ink">Referral rewards</h2>
      <p className="mt-1 text-sm text-stone-500">
        Customers share your menu link. When the friend&apos;s first order is completed, both
        earn points. Points turn into a one-time voucher you fund, so you set the terms. Only
        the owner or restaurant admin can change them.
      </p>

      <label className="mt-4 flex items-start gap-3 rounded-lg border border-stone-200 p-4">
        <input
          className="mt-1"
          defaultChecked={restaurant.referral_enabled === true}
          disabled={!canWrite}
          name="referral_enabled"
          type="checkbox"
        />
        <span>
          <span className="block text-sm font-black">Turn on referral rewards</span>
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            When off, no new points are earned. Points customers already hold can still be
            redeemed.
          </span>
        </span>
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold">Points each (sharer and friend)</span>
          <input
            className={inputClass}
            defaultValue={pointsEach}
            disabled={!canWrite}
            max={REFERRAL_LIMITS.pointsEach.max}
            min={REFERRAL_LIMITS.pointsEach.min}
            name="referral_points_each"
            required
            step="1"
            type="number"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Minimum first order ({currency})</span>
          <input
            className={inputClass}
            defaultValue={restaurant.referral_min_order ?? 0}
            disabled={!canWrite}
            min="0"
            name="referral_min_order"
            step="0.01"
            type="number"
          />
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            The friend&apos;s order must reach this total. 0 means any order counts.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-bold">Points needed for a voucher</span>
          <input
            className={inputClass}
            defaultValue={redeemPoints}
            disabled={!canWrite}
            max={REFERRAL_LIMITS.redeemPoints.max}
            min={REFERRAL_LIMITS.redeemPoints.min}
            name="referral_redeem_points"
            required
            step="1"
            type="number"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Voucher value ({currency})</span>
          <input
            className={inputClass}
            defaultValue={rewardValue}
            disabled={!canWrite}
            max={REFERRAL_LIMITS.rewardValue.max}
            min={REFERRAL_LIMITS.rewardValue.min}
            name="referral_reward_value"
            required
            step="0.01"
            type="number"
          />
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            The voucher is valid for 30 days and works once.
          </span>
        </label>
      </div>

      <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-xs font-semibold leading-5 text-stone-600">
        Today: {pointsEach} points each, and {redeemPoints} points = {currency} {rewardValue} off
        (about {currency} {((pointsEach / redeemPoints) * rewardValue).toFixed(2)} of value per
        person per referral).
      </p>

      <p className="mt-3 text-xs font-semibold text-stone-500">
        So far: {stats.referrals} {stats.referrals === 1 ? "friend" : "friends"} referred ·{" "}
        {stats.pointsIssued} points issued · {stats.pointsRedeemed} redeemed
      </p>

      <button
        className="focus-ring mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white disabled:opacity-50"
        disabled={!canWrite}
        type="submit"
      >
        Save referral settings
      </button>
    </form>
  );
}
