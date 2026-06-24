import { Lock } from "lucide-react";

// Shown in place of a management surface when the tenant is suspended. This is
// non-destructive and admin-only — it never touches the customer ordering PWA.
export function BillingSoftBlock({ surface }: { surface: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="rounded-lg border border-stone-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100">
          <Lock className="text-stone-500" size={22} />
        </div>
        <h1 className="mt-4 text-2xl font-black">Subscription paused</h1>
        <p className="mt-2 text-stone-600">
          {surface} is temporarily unavailable while your subscription is paused. Settle your
          outstanding invoice to restore full access.
        </p>
        <p className="mt-4 rounded-lg bg-mint px-4 py-3 text-sm font-bold text-leaf">
          Your customer ordering page is still live — orders are unaffected. Contact WhatsOrder
          support to settle your invoice.
        </p>
      </div>
    </main>
  );
}
