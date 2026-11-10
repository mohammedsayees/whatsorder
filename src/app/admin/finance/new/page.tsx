import Link from "next/link";
import { createFinanceExpenseAction } from "@/app/admin/finance/actions";
import { getFinanceCategories, requireFinancePermission } from "@/lib/finance-data";

export default async function NewFinanceExpensePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ session, access }, query] = await Promise.all([requireFinancePermission("create"), searchParams]);
  const categories = await getFinanceCategories(session.restaurantId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: session.restaurant.time_zone ?? "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back to expenses</Link>
      <h1 className="mt-3 text-3xl font-black text-ink">Add manual expense</h1>
      <p className="mt-2 text-sm text-stone-600">Amounts are stored exactly in fils. Uploads and bill scanning are not enabled in this milestone.</p>
      {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      <form action={createFinanceExpenseAction} className="mt-6 grid gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="text-sm font-bold sm:col-span-2">Description<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" maxLength={240} name="description" required /></label>
        <label className="text-sm font-bold">Date<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={today} name="incurred_on" required type="date" /></label>
        <label className="text-sm font-bold">Category<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="category_id" required><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="text-sm font-bold">Amount (AED)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" inputMode="decimal" name="amount" placeholder="0.00" required /></label>
        <label className="text-sm font-bold">VAT amount (AED)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" inputMode="decimal" name="vat_amount" placeholder="0.00" /></label>
        <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2"><input className="h-4 w-4" name="vat_inclusive" type="checkbox" /> Amount already includes 5% VAT (VAT is split automatically)</label>
        <label className="text-sm font-bold sm:col-span-2">Supplier (optional)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" maxLength={160} name="supplier_name" /></label>
        <label className="text-sm font-bold">Payment status<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="payment_status"><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="partial">Partially paid</option></select></label>
        <label className="text-sm font-bold">Payment method<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="payment_method"><option value="">Not recorded</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
        <label className="text-sm font-bold">Paid on (required when paid)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="paid_on" type="date" /></label>
        <div className="flex items-end gap-2"><button className="focus-ring flex-1 rounded-lg border border-stone-300 px-4 py-3 text-sm font-black" name="status" value="draft">Save draft</button>{access.approve ? <button className="focus-ring flex-1 rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white" name="status" value="approved">Record expense</button> : null}</div>
      </form>
    </main>
  );
}
