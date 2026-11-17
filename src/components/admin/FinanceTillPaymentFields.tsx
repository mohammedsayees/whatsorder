import { formatFils } from "@/lib/finance";
import type { OpenShiftTill } from "@/lib/finance-paid-out-data";

// Plain markup (no hooks) so it works inside server and client forms alike.
export function FinanceTillPaymentFields({ till, openedAtLabel }: { till: OpenShiftTill; openedAtLabel: string }) {
  return (
    <fieldset className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm sm:col-span-2">
      <input name="till_shift_id" type="hidden" value={till.shiftId} />
      <label className="flex items-start gap-2 font-bold text-sky-950">
        <input className="mt-1 h-4 w-4" name="pay_from_till" type="checkbox" />
        <span>
          Paid in cash from the till now
          <span className="block text-xs font-normal text-sky-900">
            Records a cash paid-out for the bill total on the open shift ({till.shiftName}, opened {openedAtLabel}) and links it to this expense. The expense is posted as approved and paid in cash; payment fields on this form are ignored.
          </span>
        </span>
      </label>
      {till.unbilled.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <p className="text-xs font-bold">Paid-outs already on this shift without a bill:</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {till.unbilled.slice(0, 5).map((row, index) => (
              <li key={`${row.reason}-${index}`}>{formatFils(row.amountFils)} · {row.reason}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">If this bill is one of them, don&apos;t tick the box above. Post the bill, then link it on the Cash paid-outs page.</p>
          <label className="mt-2 flex items-start gap-2 text-xs font-bold">
            <input className="mt-0.5 h-4 w-4" name="confirm_new_paid_out" type="checkbox" />
            This bill is a different payment: record a new paid-out even if one has the same amount
          </label>
        </div>
      ) : null}
    </fieldset>
  );
}
