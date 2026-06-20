"use client";

import { withdrawCustomerMarketingConsentAction } from "@/app/actions";

export function WithdrawMarketingConsentButton({
  customerId,
  customerName
}: {
  customerId: string;
  customerName: string;
}) {
  return (
    <form
      action={withdrawCustomerMarketingConsentAction}
      className="mt-3"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Record a marketing opt-out for ${customerName}? Promotional WhatsApp actions will be disabled.`
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="customer_id" type="hidden" value={customerId} />
      <button
        className="focus-ring rounded-full border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-800 hover:bg-white"
        type="submit"
      >
        Record STOP / opt-out
      </button>
    </form>
  );
}
