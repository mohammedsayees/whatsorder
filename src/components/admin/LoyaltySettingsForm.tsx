import { updateLoyaltySettingsAction } from "@/app/actions";
import type { Restaurant } from "@/lib/types";

export function LoyaltySettingsForm({
  restaurant,
  canWrite
}: {
  restaurant: Restaurant;
  canWrite: boolean;
}) {
  return (
    <form
      action={updateLoyaltySettingsAction}
      className="max-w-2xl rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-black">Loyalty stamp card</h2>
      <p className="mt-1 text-sm text-stone-500">
        Customers collect one stamp per completed order. Only the owner or restaurant admin can
        change these terms.
      </p>

      <label className="mt-4 flex items-start gap-3 rounded-lg border border-stone-200 p-4">
        <input
          className="mt-1"
          defaultChecked={restaurant.loyalty_enabled !== false}
          disabled={!canWrite}
          name="loyalty_enabled"
          type="checkbox"
        />
        <span>
          <span className="block text-sm font-black">Enable the stamp card</span>
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            When off, no stamps are earned and the progress line is hidden from order
            confirmations.
          </span>
        </span>
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold">Stamps per reward</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
            defaultValue={restaurant.loyalty_stamps_required ?? 10}
            disabled={!canWrite}
            max="100"
            min="1"
            name="loyalty_stamps_required"
            step="1"
            type="number"
            required
          />
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            Changing this affects cards already in progress — a customer at 8 of 10 becomes
            reward-ready if you lower it to 8 or below.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-bold">Minimum order to earn a stamp (AED)</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
            defaultValue={restaurant.loyalty_qualifying_min_amount ?? ""}
            disabled={!canWrite}
            inputMode="decimal"
            min="0"
            name="loyalty_qualifying_min_amount"
            placeholder="No minimum"
            step="0.01"
            type="number"
          />
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            Leave empty so every completed order earns a stamp.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-bold">Reward description</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
            defaultValue={restaurant.loyalty_reward_description ?? "Free regular karak"}
            disabled={!canWrite}
            maxLength={120}
            name="loyalty_reward_description"
            placeholder="Free regular karak"
            required
          />
          <span className="mt-1 block text-xs leading-5 text-stone-500">
            Shown to customers in the WhatsApp confirmation and to staff on the redeem button.
          </span>
        </label>
      </div>

      <button
        className="focus-ring mt-5 rounded-lg bg-leaf px-5 py-3 font-bold text-white disabled:opacity-50"
        disabled={!canWrite}
        type="submit"
      >
        Save loyalty terms
      </button>
    </form>
  );
}
