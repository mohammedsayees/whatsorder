"use client";

import { signOutCustomerEverywhereAction } from "@/app/actions";

export function SignOutCustomerButton({
  customerId,
  customerName
}: {
  customerId: string;
  customerName: string;
}) {
  return (
    <form
      action={signOutCustomerEverywhereAction}
      className="mt-3"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Sign ${customerName} out of your ordering page on every device? They can sign in again from a new WhatsApp link.`
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="customer_id" type="hidden" value={customerId} />
      <button
        className="focus-ring rounded-full border border-stone-300 px-3 py-2 text-xs font-black text-stone-700 hover:bg-white"
        type="submit"
      >
        Sign out everywhere
      </button>
    </form>
  );
}
