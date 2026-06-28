"use client";

import { redeemLoyaltyRewardAction } from "@/app/actions";

export function LoyaltyRedeemButton({
  customerId,
  customerName,
  rewardDescription
}: {
  customerId: string;
  customerName: string;
  rewardDescription: string;
}) {
  return (
    <form
      action={redeemLoyaltyRewardAction}
      className="mt-3"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Redeem "${rewardDescription}" for ${customerName}? This clears one full stamp card.`
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="customer_id" type="hidden" value={customerId} />
      <button
        className="focus-ring rounded-full bg-leaf px-4 py-2 text-xs font-black text-white hover:opacity-90"
        type="submit"
      >
        Redeem reward
      </button>
    </form>
  );
}
