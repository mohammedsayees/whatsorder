import Link from "next/link";
import {
  convertPaidOutToExpenseAction,
  dismissPaidOutAction,
  linkPaidOutToExpenseAction,
  unlinkPaidOutAction
} from "@/app/admin/finance/paid-outs/actions";
import { formatFils } from "@/lib/finance";
import { getFinanceCategories, requireFinancePermission } from "@/lib/finance-data";
import {
  candidatesForPaidOut,
  getPaidOutLinkCandidatePool,
  getRecentPaidOutLinks,
  getUnbilledPaidOuts,
  paidOutLinkingAvailable
} from "@/lib/finance-paid-out-data";
import { formatDifference } from "@/lib/finance-paid-outs";
import { formatRestaurantShortDateTime } from "@/lib/date-time";

export const dynamic = "force-dynamic";

const STALE_DAYS = 7;
const input = "focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5 text-sm font-normal";

export default async function FinancePaidOutsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ session }, query] = await Promise.all([requireFinancePermission("approve"), searchParams]);
  const available = await paidOutLinkingAvailable(session);

  if (!available) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
        <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back to Finance</Link>
        <h1 className="mt-3 text-3xl font-black text-ink">Cash paid-outs</h1>
        <p className="mt-3 text-sm text-stone-600">Linking shift paid-outs to bills is available for AED restaurants with Finance enabled.</p>
      </main>
    );
  }

  const [unbilled, pool, categories, recent] = await Promise.all([
    getUnbilledPaidOuts(session.restaurantId),
    getPaidOutLinkCandidatePool(session.restaurantId),
    getFinanceCategories(session.restaurantId),
    getRecentPaidOutLinks(session.restaurantId)
  ]);
  const dateTime = (value: string) => formatRestaurantShortDateTime(value, session.restaurant);
  const now = Date.now();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back to Finance</Link>
      <h1 className="mt-3 text-3xl font-black text-ink">Cash paid-outs without a bill</h1>
      <p className="mt-2 max-w-3xl text-sm text-stone-600">
        Cash taken from a shift drawer. Link each one to its bill, record it as a cash expense, or mark it as not an expense.
        This never changes shift totals or close reports.
      </p>
      {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}

      <section className="mt-6 space-y-3">
        {unbilled.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
            Every cash paid-out has a bill or has been reviewed.
          </p>
        ) : unbilled.map((paidOut) => {
          const ageDays = Math.floor((now - Date.parse(paidOut.recordedAt)) / 86_400_000);
          const candidates = candidatesForPaidOut(pool, paidOut);
          return (
            <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" key={paidOut.paidOutId}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words font-black">{paidOut.reason}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {dateTime(paidOut.recordedAt)} · business day {paidOut.businessDate} · shift {paidOut.shiftStatus}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {ageDays >= STALE_DAYS ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{ageDays} days old</span> : null}
                  <span className="text-lg font-black text-rose-700">{formatFils(paidOut.amountFils)}</span>
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                <details className="rounded-lg border border-stone-200 p-3">
                  <summary className="cursor-pointer text-sm font-black">Link a bill</summary>
                  {candidates.length === 0 ? (
                    <p className="mt-2 text-sm text-stone-500">
                      No unlinked expenses from the last 120 days. <Link className="font-bold text-leaf" href="/admin/finance">Scan or add the bill</Link> first, then link it here.
                    </p>
                  ) : (
                    <form action={linkPaidOutToExpenseAction} className="mt-3 grid gap-3">
                      <input name="paid_out_id" type="hidden" value={paidOut.paidOutId} />
                      <label className="text-sm font-bold">Expense
                        <select className={input} name="expense_id" required>
                          {candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {formatFils(candidate.total_fils)} · {candidate.incurred_on} · {candidate.supplier_name ? `${candidate.supplier_name} · ` : ""}{candidate.description.slice(0, 60)}
                              {candidate.status === "draft" ? " (draft)" : ""} · {formatDifference(paidOut.amountFils - candidate.total_fils, formatFils)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-xs text-stone-500">Linking sets the expense to paid in cash on {paidOut.businessDate} (partial if the paid-out is less than the bill).</p>
                      <label className="flex items-start gap-2 text-sm">
                        <input className="mt-1 h-4 w-4" name="confirm_mismatch" type="checkbox" />
                        <span>The amounts differ and I confirm this is the right bill</span>
                      </label>
                      <label className="text-sm font-bold">Reason for the difference (required if amounts differ)
                        <input className={input} maxLength={300} name="mismatch_reason" placeholder="e.g. supplier rounded down, change not returned" />
                      </label>
                      <button className="focus-ring justify-self-start rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white" type="submit">Link bill</button>
                    </form>
                  )}
                </details>

                <details className="rounded-lg border border-stone-200 p-3">
                  <summary className="cursor-pointer text-sm font-black">Record as a cash expense (no bill)</summary>
                  <form action={convertPaidOutToExpenseAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input name="paid_out_id" type="hidden" value={paidOut.paidOutId} />
                    <label className="text-sm font-bold">Category
                      <select className={input} name="category_id" required>
                        <option value="">Choose category</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-bold">Supplier (optional)
                      <input className={input} maxLength={160} name="supplier_name" />
                    </label>
                    <label className="text-sm font-bold sm:col-span-2">Description
                      <input className={input} defaultValue={paidOut.reason.slice(0, 240)} maxLength={240} name="description" />
                    </label>
                    <p className="text-xs text-stone-500 sm:col-span-2">Posted as an approved expense of {formatFils(paidOut.amountFils)}, no VAT, paid in cash on {paidOut.businessDate}.</p>
                    <button className="focus-ring justify-self-start rounded-lg bg-leaf px-4 py-2.5 text-sm font-black text-white" type="submit">Record expense</button>
                  </form>
                </details>

                <details className="rounded-lg border border-stone-200 p-3">
                  <summary className="cursor-pointer text-sm font-black">Not an expense</summary>
                  <form action={dismissPaidOutAction} className="mt-3 grid gap-3">
                    <input name="paid_out_id" type="hidden" value={paidOut.paidOutId} />
                    <label className="text-sm font-bold">Reason
                      <input className={input} maxLength={300} name="reason" placeholder="e.g. cash advance to staff, moved to safe" required />
                    </label>
                    <button className="focus-ring justify-self-start rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-black" type="submit">Mark as not an expense</button>
                  </form>
                </details>
              </div>
            </article>
          );
        })}
      </section>

      {recent.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-black">Recently resolved</h2>
          <div className="mt-3 space-y-2">
            {recent.map((link) => (
              <article className="rounded-xl border border-stone-200 bg-white p-4" key={link.id}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-bold">{link.paidOutReason ?? "Paid-out"}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {link.status === "linked"
                        ? <>Linked to <span className="font-bold">{link.expenseDescription ?? "expense"}</span>{link.expense_total_fils !== null ? ` (${formatFils(link.expense_total_fils)})` : ""}</>
                        : <>Not an expense: {link.dismiss_reason}</>}
                    </p>
                    {link.difference_fils ? (
                      <p className="mt-1 text-sm font-bold text-amber-800">
                        {formatDifference(link.difference_fils, formatFils)}{link.mismatch_reason ? ` — ${link.mismatch_reason}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-black">{formatFils(link.paid_out_amount_fils)}</span>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-bold text-stone-500">Undo</summary>
                  <form action={unlinkPaidOutAction} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <input name="link_id" type="hidden" value={link.id} />
                    <label className="flex-1 text-sm font-bold">Reason
                      <input className={input} maxLength={300} name="reason" required />
                    </label>
                    <button className="focus-ring rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-black" type="submit">Undo</button>
                  </form>
                  <p className="mt-1 text-xs text-stone-500">Undo does not change the expense. Void it from the expense list if it was recorded by mistake.</p>
                </details>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
