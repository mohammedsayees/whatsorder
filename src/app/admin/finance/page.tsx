import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, ChartNoAxesCombined, CookingPot, Plus, Repeat2, Settings2, WalletCards, Wheat } from "lucide-react";
import {
  createFinanceCategoryAction,
  transitionFinanceExpenseAction
} from "@/app/admin/finance/actions";
import { uploadFinanceDocumentAction } from "@/app/admin/finance/documents/actions";
import {
  FINANCE_CLASSIFICATIONS,
  formatFils,
  type FinanceClassification
} from "@/lib/finance";
import {
  getFinanceAccess,
  getFinanceCategories,
  getFinanceExpenses,
  getFinanceRecurringCosts
} from "@/lib/finance-data";
import { getFinanceDocuments } from "@/lib/finance-document-data";
import { getUnbilledPaidOuts, paidOutLinkingAvailable } from "@/lib/finance-paid-out-data";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export const dynamic = "force-dynamic";
// The bill upload action posts from this page and reads the bill with Gemini in
// after(), which shares this budget. Match the review page's retry budget.
export const maxDuration = 60;

const classificationLabels: Record<FinanceClassification, string> = {
  operating: "Operating expense",
  purchase: "Purchase spend",
  capex: "Equipment / capex",
  loan: "Loan movement",
  owner: "Owner movement",
  tax: "Tax",
  other: "Other"
};

export default async function AdminFinancePage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [session, query] = await Promise.all([requireRestaurantAdmin(), searchParams]);
  const access = await getFinanceAccess(session);

  if (session.restaurant.finance_enabled !== true) {
    if (session.role !== "owner" && session.role !== "restaurant_admin") redirect("/admin");
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
        <p className="text-sm font-black text-leaf">Finance</p>
        <h1 className="mt-1 text-3xl font-black text-ink">Smart Finance is not enabled</h1>
        <p className="mt-3 max-w-2xl text-stone-600">
          The foundation is installed behind a tenant feature flag. Enable it only after applying the migration and confirming role access for this restaurant.
        </p>
      </main>
    );
  }
  if (!access.view && !access.create) redirect("/admin?error=You%20do%20not%20have%20Finance%20permission.");

  if (!access.view) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
        <p className="text-sm font-black text-leaf">Finance upload</p>
        <h1 className="mt-1 text-3xl font-black text-ink">Submit a bill for review</h1>
        <p className="mt-2 text-sm text-stone-600">Your role can upload bills but cannot view supplier costs, extracted fields, or finance reports.</p>
        {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
        {query.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}
        <section className="mt-6 rounded-xl border border-leaf/20 bg-mint/40 p-4"><h2 className="font-black text-ink">Scan or upload a bill</h2><p className="mt-1 text-sm text-stone-600">Private JPG, PNG, WebP, or PDF up to 10 MB and 10 pages.</p><form action={uploadFinanceDocumentAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-bold">Bill file<input accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" className="focus-ring mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5" name="bill" required type="file" /></label><button className="focus-ring rounded-lg bg-ink px-4 py-3 text-sm font-black text-white" type="submit">Submit securely</button></form></section>
      </main>
    );
  }

  const [categories, expenses, recurring, documents, unbilledPaidOutCount] = await Promise.all([
    getFinanceCategories(session.restaurantId),
    getFinanceExpenses(session.restaurantId),
    getFinanceRecurringCosts(session.restaurantId),
    getFinanceDocuments(session.restaurantId),
    access.approve
      ? paidOutLinkingAvailable(session)
        .then((available) => available ? getUnbilledPaidOuts(session.restaurantId, 500) : null)
        .then((rows) => rows?.length ?? null)
        .catch(() => null)
      : Promise.resolve(null)
  ]);
  const approved = expenses.filter((expense) => expense.status === "approved");
  const totals = approved.reduce(
    (sum, expense) => {
      const classification = expense.finance_categories?.classification ?? "other";
      sum[classification] += Number(expense.total_fils);
      return sum;
    },
    Object.fromEntries(FINANCE_CLASSIFICATIONS.map((item) => [item, 0])) as Record<FinanceClassification, number>
  );
  const recurringMonthly = recurring
    .filter((cost) => cost.is_active)
    .reduce((sum, cost) => sum + Math.floor(Number(cost.amount_fils) / cost.allocation_months), 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black text-leaf">Finance foundation</p>
          <h1 className="text-3xl font-black text-ink">Expenses</h1>
          <p className="mt-2 max-w-3xl text-sm text-stone-600">
            Track cash paid and operating costs separately. Purchase spend is not treated as consumed COGS or profit impact here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.manage_permissions ? <Link className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-black" href="/admin/finance/settings"><Settings2 size={17} /> Access</Link> : null}
          {access.manage_recurring ? <Link className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-black" href="/admin/finance/recurring"><Repeat2 size={17} /> Recurring</Link> : null}
          {access.manage_costing ? <Link className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-black" href="/admin/finance/ingredients"><Wheat size={17} /> Ingredients</Link> : null}
          {access.manage_costing ? <Link className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-black" href="/admin/finance/recipes"><CookingPot size={17} /> Recipes</Link> : null}
          {access.view_reports ? <Link className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-black" href="/admin/finance/overview"><ChartNoAxesCombined size={17} /> Insights</Link> : null}
          {unbilledPaidOutCount !== null ? <Link className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-black" href="/admin/finance/paid-outs"><Banknote size={17} /> Cash paid-outs{unbilledPaidOutCount > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">{unbilledPaidOutCount >= 500 ? "500+" : unbilledPaidOutCount} without a bill</span> : null}</Link> : null}
          {access.create ? <Link className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white" href="/admin/finance/new"><Plus size={17} /> Add expense</Link> : null}
        </div>
      </div>

      {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}

      {access.create ? <section className="mt-6 rounded-xl border border-leaf/20 bg-mint/40 p-4"><h2 className="font-black text-ink">Scan or upload a bill</h2><p className="mt-1 text-sm text-stone-600">Private JPG, PNG, WebP, or PDF up to 10 MB and 10 pages. AI output always requires review.</p><form action={uploadFinanceDocumentAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-bold">Bill file<input accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" className="focus-ring mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5" name="bill" required type="file" /></label><button className="focus-ring rounded-lg bg-ink px-4 py-3 text-sm font-black text-white" type="submit">Upload securely</button></form></section> : null}

      {documents.length > 0 ? <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><h2 className="text-lg font-black">Bill review queue</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{documents.map((document) => <Link className="focus-ring rounded-lg border border-stone-200 p-3 hover:border-leaf" href={`/admin/finance/documents/${document.id}`} key={document.id}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-black">{document.original_name}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${document.status === "extracted" ? "bg-amber-100 text-amber-800" : document.status === "reviewed" ? "bg-emerald-100 text-emerald-800" : document.status === "failed" ? "bg-red-100 text-red-800" : "bg-stone-100 text-stone-600"}`}>{document.status}</span></div><p className="mt-1 text-xs text-stone-500">{new Date(document.created_at).toLocaleString("en-AE")}{document.duplicate_of_document_id ? " · exact duplicate flagged" : ""}</p></Link>)}</div></section> : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Finance summary">
        <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Approved operating costs</p><p className="mt-2 text-2xl font-black">{formatFils(totals.operating)}</p></article>
        <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Purchase spend</p><p className="mt-2 text-2xl font-black">{formatFils(totals.purchase)}</p><p className="mt-1 text-xs text-stone-500">Not consumed COGS</p></article>
        <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Active monthly allocation</p><p className="mt-2 text-2xl font-black">{formatFils(recurringMonthly)}</p><p className="mt-1 text-xs text-stone-500">Expected accrual, not cash paid</p></article>
        <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Drafts awaiting review</p><p className="mt-2 text-2xl font-black">{expenses.filter((item) => item.status === "draft").length}</p></article>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-4 py-4"><h2 className="text-lg font-black">Expense history</h2><p className="mt-1 text-sm text-stone-500">Latest 250 manual entries.</p></div>
        {expenses.length === 0 ? (
          <div className="px-6 py-14 text-center"><WalletCards className="mx-auto text-stone-400" size={34} /><p className="mt-3 font-black">No expenses yet</p><p className="mt-1 text-sm text-stone-500">Add the first manual expense when you are ready.</p></div>
        ) : (
          <div className="divide-y divide-stone-100">
            {expenses.map((expense) => (
              <article className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center" key={expense.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-ink">{expense.description}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${expense.status === "approved" ? "bg-emerald-100 text-emerald-800" : expense.status === "void" ? "bg-stone-100 text-stone-500" : "bg-amber-100 text-amber-800"}`}>{expense.status}</span></div>
                  <p className="mt-1 text-sm text-stone-500">{expense.incurred_on} · {expense.finance_categories?.name ?? "Unknown category"}{expense.supplier_name ? ` · ${expense.supplier_name}` : ""}</p>
                  <p className="mt-1 text-xs text-stone-500">{classificationLabels[expense.finance_categories?.classification ?? "other"]} · {expense.payment_status}</p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end"><p className="text-lg font-black">{formatFils(Number(expense.total_fils))}</p>{access.approve && expense.status !== "void" ? <div className="flex gap-2">{expense.status === "draft" ? <form action={transitionFinanceExpenseAction}><input name="expense_id" type="hidden" value={expense.id} /><button className="focus-ring rounded-lg bg-leaf px-3 py-2 text-xs font-black text-white" name="status" value="approved">Approve</button></form> : null}<form action={transitionFinanceExpenseAction}><input name="expense_id" type="hidden" value={expense.id} /><button className="focus-ring rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700" name="status" value="void">Void</button></form></div> : null}</div>
              </article>
            ))}
          </div>
        )}
      </section>

      {access.manage_categories ? (
        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-black">Expense categories</h2>
          <div className="mt-3 flex flex-wrap gap-2">{categories.map((category) => <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700" key={category.id}>{category.name} · {classificationLabels[category.classification]}</span>)}</div>
          <form action={createFinanceCategoryAction} className="mt-4 grid gap-3 border-t border-stone-100 pt-4 md:grid-cols-[1fr_1fr_150px_auto]">
            <label className="text-sm font-bold">Name<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" maxLength={80} name="name" required /></label>
            <label className="text-sm font-bold">Classification<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="classification">{FINANCE_CLASSIFICATIONS.map((item) => <option key={item} value={item}>{classificationLabels[item]}</option>)}</select></label>
            <label className="text-sm font-bold">Allocate months<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue="1" max="120" min="1" name="default_allocation_months" required type="number" /></label>
            <button className="focus-ring self-end rounded-lg bg-ink px-4 py-3 text-sm font-black text-white" type="submit">Add category</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
