import { CreditCard } from "lucide-react";
import {
  addBillingCardAction,
  payInvoiceByCardAction,
  removeBillingCardAction,
  setAutopayAction
} from "@/app/admin/billing/card-actions";
import type { BillingCard } from "@/lib/stripe/billing";

// Server-rendered: plain forms posting to server actions (no client JS).

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  paid: { tone: "ok", text: "Thank you! Your card payment is being confirmed and will show as paid within a minute." },
  saved: { tone: "ok", text: "Card saved. Autopay is on: future invoices are charged to this card when they're issued." },
  nothing_due: { tone: "error", text: "That invoice has nothing left to pay." },
  no_card: { tone: "error", text: "Add a card first to turn on autopay." },
  not_configured: { tone: "error", text: "Card payments aren't available yet. Please pay by bank transfer." },
  unavailable: { tone: "error", text: "Stripe couldn't be reached. Please try again in a moment." }
};

export function BillingCardNotice({ code }: { code: string | null }) {
  const notice = code ? NOTICES[code] : null;
  if (!notice) return null;
  return (
    <p
      className={`mt-6 rounded-lg px-4 py-3 text-sm font-bold ${
        notice.tone === "ok" ? "bg-mint text-leaf" : "bg-red-50 text-red-700"
      }`}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      {notice.text}
    </p>
  );
}

export function PayInvoiceByCardForm({
  invoiceId,
  amountLabel,
  hasAutopay
}: {
  invoiceId: string;
  amountLabel: string;
  hasAutopay: boolean;
}) {
  return (
    <form action={payInvoiceByCardAction} className="mt-3 flex flex-wrap items-center gap-3">
      <input name="invoice_id" type="hidden" value={invoiceId} />
      <button
        className="focus-ring inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-black text-white"
        type="submit"
      >
        <CreditCard size={16} />
        Pay {amountLabel} by card
      </button>
      {hasAutopay ? null : (
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input name="save_card" type="checkbox" />
          Save this card and pay future invoices automatically
        </label>
      )}
    </form>
  );
}

function cardLabel(card: BillingCard) {
  const brand = card.card_brand ? card.card_brand[0].toUpperCase() + card.card_brand.slice(1) : "Card";
  const expiry =
    card.card_exp_month && card.card_exp_year
      ? ` · expires ${String(card.card_exp_month).padStart(2, "0")}/${String(card.card_exp_year).slice(-2)}`
      : "";
  return `${brand} •••• ${card.card_last4 ?? "????"}${expiry}`;
}

export function BillingCardPanel({ card }: { card: BillingCard | null }) {
  const saved = card?.payment_method_id ? card : null;
  return (
    <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <CreditCard className="text-leaf" size={18} />
        <h2 className="text-lg font-black">Card & autopay</h2>
      </div>
      {saved ? (
        <>
          <p className="mt-3 text-sm font-bold text-stone-800">{cardLabel(saved)}</p>
          <p className="mt-1 text-sm text-stone-600">
            {saved.autopay_enabled
              ? "Autopay is on: each invoice is charged to this card when it's issued. If a charge fails we try twice more, two days apart, and let you pay another way."
              : "Autopay is off: invoices wait for you to pay them."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={setAutopayAction}>
              <input name="enabled" type="hidden" value={saved.autopay_enabled ? "false" : "true"} />
              <button
                className="focus-ring rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 hover:bg-stone-50"
                type="submit"
              >
                {saved.autopay_enabled ? "Turn off autopay" : "Turn on autopay"}
              </button>
            </form>
            <form action={addBillingCardAction}>
              <button
                className="focus-ring rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 hover:bg-stone-50"
                type="submit"
              >
                Replace card
              </button>
            </form>
            <form action={removeBillingCardAction}>
              <button
                className="focus-ring rounded-full px-4 py-2 text-sm font-black text-red-700 hover:bg-red-50"
                type="submit"
              >
                Remove card
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-stone-600">
            Save a card to pay WhatsOrder invoices automatically when they&apos;re issued. Payments
            are handled by Stripe; WhatsOrder never sees your card number.
          </p>
          <form action={addBillingCardAction} className="mt-3">
            <button
              className="focus-ring rounded-full bg-leaf px-5 py-2.5 text-sm font-black text-white"
              type="submit"
            >
              Add a card for autopay
            </button>
          </form>
        </>
      )}
    </section>
  );
}
