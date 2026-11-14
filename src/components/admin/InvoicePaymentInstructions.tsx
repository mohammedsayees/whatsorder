import { Landmark, MessageCircle } from "lucide-react";
import { FOUNDER_WHATSAPP_NUMBER } from "@/lib/demo-store";
import {
  BANK_DETAILS_MISSING_MESSAGE,
  buildPaymentReceiptMessage,
  formatBillingAmount,
  type BankTransferDetails
} from "@/lib/owner-billing";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

// Bank transfer instructions + "I've paid" hand-off for one unpaid invoice.
// Read-only: the WhatsApp button only opens a pre-filled chat with WhatsOrder
// support; a super admin still records the payment.
export function InvoicePaymentInstructions({
  amountDue,
  bank,
  currency,
  invoiceNumber,
  restaurantName
}: {
  amountDue: number;
  bank: BankTransferDetails | null;
  currency: string;
  invoiceNumber: string;
  restaurantName: string;
}) {
  const whatsappUrl = buildWhatsAppUrl(
    FOUNDER_WHATSAPP_NUMBER,
    buildPaymentReceiptMessage({ restaurantName, invoiceNumber, amount: amountDue, currency })
  );

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-stone-800">
      <p className="flex items-center gap-2 font-black text-amber-900">
        <Landmark size={16} /> Pay by bank transfer
      </p>
      {bank ? (
        <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
          <dt className="text-stone-500">Account name</dt>
          <dd className="font-bold">{bank.accountName}</dd>
          <dt className="text-stone-500">Bank</dt>
          <dd className="font-bold">{bank.bankName}</dd>
          <dt className="text-stone-500">IBAN</dt>
          <dd className="break-all font-mono font-bold">{bank.iban}</dd>
          <dt className="text-stone-500">Amount</dt>
          <dd className="font-bold">{formatBillingAmount(amountDue, currency)}</dd>
          <dt className="text-stone-500">Payment reference</dt>
          <dd className="font-mono font-bold">{invoiceNumber}</dd>
        </dl>
      ) : (
        <div className="mt-2 space-y-1">
          <p className="font-bold">{BANK_DETAILS_MISSING_MESSAGE}.</p>
          <p>
            Amount: <span className="font-bold">{formatBillingAmount(amountDue, currency)}</span> ·
            Reference: <span className="font-mono font-bold">{invoiceNumber}</span>
          </p>
        </div>
      )}
      <p className="mt-3 text-xs text-stone-600">
        Use the invoice number as the payment reference. Once you have paid, send us the
        transfer receipt and we will mark the invoice as paid.
      </p>
      <a
        className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-black text-white print:hidden"
        href={whatsappUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <MessageCircle size={16} />
        I&apos;ve paid — send receipt on WhatsApp
      </a>
    </div>
  );
}
