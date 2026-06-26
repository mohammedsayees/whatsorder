import type { InvoiceStatus, SubscriptionStatus } from "@/lib/billing";

const subscriptionStyles: Record<SubscriptionStatus, string> = {
  trialing: "bg-sky-100 text-sky-700",
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-700",
  suspended: "bg-red-100 text-red-700",
  cancelled: "bg-stone-200 text-stone-600"
};

const subscriptionLabels: Record<SubscriptionStatus, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  suspended: "Suspended",
  cancelled: "Cancelled"
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${subscriptionStyles[status]}`}
    >
      {subscriptionLabels[status]}
    </span>
  );
}

const invoiceStyles: Record<InvoiceStatus, string> = {
  draft: "bg-stone-200 text-stone-600",
  issued: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  void: "bg-stone-200 text-stone-500 line-through"
};

const invoiceLabels: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  void: "Void"
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${invoiceStyles[status]}`}
    >
      {invoiceLabels[status]}
    </span>
  );
}
