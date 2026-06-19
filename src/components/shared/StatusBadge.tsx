import type { OrderStatus } from "@/lib/types";

const styles: Record<OrderStatus, string> = {
  New: "bg-blue-50 text-blue-700 ring-blue-200",
  Accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Preparing: "bg-amber-50 text-amber-800 ring-amber-200",
  "Ready to Serve": "bg-teal-50 text-teal-700 ring-teal-200",
  "Out for Delivery": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Completed: "bg-stone-100 text-stone-700 ring-stone-200",
  Cancelled: "bg-red-50 text-red-700 ring-red-200"
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[status]}`}>
      {status}
    </span>
  );
}
