"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { JOB_REPORT_REASONS } from "@/lib/jobs";
import { reportJobAction, type ReportJobState } from "@/app/jobs/actions";

const initialState: ReportJobState = {};

export function JobActions({ jobId, title }: { jobId: string; title: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reportState, reportAction, pending] = useActionState(reportJobAction, initialState);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    void fetch(`/api/jobs/${jobId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "job_viewed" })
    });
  }, [jobId]);

  useEffect(() => {
    if (reportState.success) {
      const timer = window.setTimeout(() => dialogRef.current?.close(), 1400);
      return () => window.clearTimeout(timer);
    }
  }, [reportState.success]);

  async function share() {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title, url });
    else await navigator.clipboard.writeText(url);
    setShared(true);
    void fetch(`/api/jobs/${jobId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "job_shared" })
    });
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <a
          className="focus-ring w-full rounded-xl bg-[#25D366] px-5 py-3.5 text-center font-black text-[#073b24]"
          href={`/jobs/${jobId}/apply`}
          rel="noopener noreferrer"
          target="_blank"
        >
          Apply on WhatsApp
        </a>
        <button className="focus-ring rounded-xl border border-stone-300 bg-white px-5 py-3.5 font-black" onClick={() => void share()} type="button">{shared ? "Link shared" : "Share job"}</button>
        <button className="focus-ring rounded-xl border border-stone-300 bg-white px-5 py-3.5 font-black text-stone-700" onClick={() => dialogRef.current?.showModal()} type="button">Report job</button>
      </div>

      <dialog className="w-[min(92vw,32rem)] rounded-2xl p-0 backdrop:bg-black/40" ref={dialogRef}>
        <form action={reportAction} className="p-5 sm:p-6">
          <input name="job_id" type="hidden" value={jobId} />
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-xl font-black">Report this job</h2><p className="mt-1 text-sm text-stone-600">Reports are private and reviewed by WhatsOrder.</p></div>
            <button aria-label="Close report" className="rounded-lg px-2 py-1 text-xl" onClick={() => dialogRef.current?.close()} type="button">×</button>
          </div>
          <label className="mt-5 block text-sm font-bold">Reason
            <select className="focus-ring mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5" name="reason" required>
              <option value="">Choose a reason</option>
              {JOB_REPORT_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-sm font-bold">Details (optional)
            <textarea className="focus-ring mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5" maxLength={1000} name="details" rows={4} />
          </label>
          <label className="mt-4 block text-sm font-bold">Your email or phone (optional)
            <input className="focus-ring mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5" maxLength={160} name="reporter_contact" />
          </label>
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-3 text-xs font-bold text-amber-900">Never pay an employer or agent for an interview or job offer. Verify the company before sharing documents or sending money.</p>
          {reportState.error ? <p className="mt-3 text-sm font-bold text-red-700">{reportState.error}</p> : null}
          {reportState.success ? <p className="mt-3 text-sm font-bold text-emerald-700">{reportState.success}</p> : null}
          <button className="focus-ring mt-5 w-full rounded-lg bg-ink px-4 py-3 font-black text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Sending…" : "Submit report"}</button>
        </form>
      </dialog>
    </>
  );
}
