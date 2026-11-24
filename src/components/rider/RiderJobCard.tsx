"use client";

import { useState } from "react";
import { Banknote, CheckCircle2, CreditCard, Loader2, Navigation, Phone, PackageCheck, XCircle } from "lucide-react";
import { RiderLocationSharer } from "@/components/rider/RiderLocationSharer";
import { calculateChange, parseMoneyAmount, type RiderCollectionMethod } from "@/lib/rider-cash";
import type { RiderJob, RiderJobStage } from "@/lib/rider-job-data";

const FAILURE_REASONS = [
  "Customer not answering",
  "Wrong or unclear address",
  "Customer refused the order",
  "Customer cannot pay",
  "Other"
] as const;

function noteChoices(code: string, due: number) {
  const notes = code === "INR" ? [100, 500, 2000] : [50, 100, 200, 500];
  return notes.filter((note) => note >= due).slice(0, 3);
}

/**
 * The rider's single job screen: where to go, what to collect, and the one
 * big button for the current step. Everything the server decides (payment
 * method, amount due) comes from the job; the rider only reports what happened.
 */
export function RiderJobCard({ job, token }: { job: RiderJob; token: string }) {
  const [stage, setStage] = useState<RiderJobStage>(job.stage);
  const [result, setResult] = useState(job.result);
  const [mode, setMode] = useState<"idle" | "deliver" | "fail">("idle");
  const [method, setMethod] = useState<RiderCollectionMethod>(
    job.collection.kind === "card" ? "Card on Delivery" : "Cash on Delivery"
  );
  const [tendered, setTendered] = useState("");
  const [reasonChoice, setReasonChoice] = useState<string>(FAILURE_REASONS[0]);
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const money = (value: number) =>
    new Intl.NumberFormat(job.currency.locale, {
      style: "currency",
      currency: job.currency.code,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2
    }).format(value);

  const collects = job.collection.kind === "cash" || job.collection.kind === "card";
  const tenderedAmount = parseMoneyAmount(tendered);
  const change = tenderedAmount === null ? null : calculateChange(job.collection.due, tenderedAmount);
  const cashReady = method !== "Cash on Delivery" || (tenderedAmount !== null && change !== null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setProblem(null);

    try {
      const response = await fetch("/api/rider/action", {
        body: JSON.stringify({ token, ...body }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; state?: string };

      if (!response.ok) {
        setProblem(data.message ?? "That did not go through. Check your connection and try again.");
        return null;
      }

      return data;
    } catch {
      setProblem("No connection. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function pickedUp() {
    const data = await send({ action: "picked_up" });

    if (data) {
      setStage(data.state === "replaced" ? "replaced" : "on_the_way");
    }
  }

  async function delivered() {
    const data = await send({
      action: "delivered",
      method: collects ? method : undefined,
      tenderedAmount: method === "Cash on Delivery" && collects ? tenderedAmount : undefined
    });

    if (!data) {
      return;
    }

    if (data.state === "delivered") {
      setResult({
        collectedLabel: !collects
          ? null
          : method === "Cash on Delivery"
            ? `Cash ${money(job.collection.due)}`
            : `Card ${money(job.collection.due)}`,
        changeLabel: method === "Cash on Delivery" && change ? money(change) : null,
        failureReason: null
      });
    }

    setStage(data.state === "replaced" ? "replaced" : data.state === "delivered" ? "delivered" : "closed");
    setMode("idle");
  }

  async function failed() {
    const reason = reasonChoice === "Other" ? reasonText.trim() : reasonChoice;

    if (!reason) {
      setProblem("Tell us why the order could not be delivered.");
      return;
    }

    const data = await send({ action: "failed", reason });

    if (data) {
      setResult({ collectedLabel: null, changeLabel: null, failureReason: reason });
      setStage("failed");
      setMode("idle");
    }
  }

  const finished = stage === "delivered" || stage === "closed" || stage === "replaced";

  return (
    <>
      <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-lg font-black">{job.customerName}</p>
        {job.address ? <p className="mt-1 text-sm font-semibold text-stone-700">{job.address}</p> : null}
        {job.deliveryArea ? <p className="text-sm text-stone-600">{job.deliveryArea}</p> : null}
        {job.landmark ? <p className="text-sm text-stone-600">Landmark: {job.landmark}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {job.navigateUrl ? (
            <a
              className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-3 font-black text-white"
              href={job.navigateUrl}
              rel="noreferrer"
              target="_blank"
            >
              <Navigation size={18} />
              Navigate
            </a>
          ) : null}
          {job.customerPhone ? (
            <a
              className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-stone-300 px-4 py-3 font-black text-stone-800"
              href={`tel:+${job.customerPhone}`}
            >
              <Phone size={18} />
              Call
            </a>
          ) : null}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">
          {job.collection.kind === "cash"
            ? "Collect cash"
            : job.collection.kind === "card"
              ? "Collect by card"
              : "Payment"}
        </p>
        <p className="mt-1 text-4xl font-black text-stone-900">
          {collects ? job.collection.dueLabel : job.collection.kind === "blocked" ? "Hold" : "Nothing to collect"}
        </p>
        {job.collection.note ? (
          <p className="mt-2 text-sm font-bold text-amber-900">{job.collection.note}</p>
        ) : null}
        {job.changeAdvanceLabel ? (
          <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-stone-800">
            Change given to you for this order: {job.changeAdvanceLabel}
          </p>
        ) : null}
      </section>

      {finished ? (
        <p className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 font-bold text-stone-700">
          {stage === "delivered" ? (
            <span className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 shrink-0 text-leaf" size={20} />
              <span>
                Delivered. Thank you!
                {result?.collectedLabel ? <span className="block text-sm font-semibold">Collected: {result.collectedLabel}</span> : null}
                {result?.changeLabel ? <span className="block text-sm font-semibold">Change given: {result.changeLabel}</span> : null}
                <span className="mt-1 block text-sm font-semibold text-stone-600">
                  Hand any cash to the restaurant. Location sharing is off.
                </span>
              </span>
            </span>
          ) : stage === "replaced" ? (
            "This delivery was given to another rider. Location sharing is off."
          ) : (
            "This order is closed. Location sharing is off."
          )}
        </p>
      ) : (
        <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          {stage === "failed" ? (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">
              <XCircle className="mt-0.5 shrink-0" size={18} />
              <span>
                Marked as not delivered{result?.failureReason ? `: ${result.failureReason}` : ""}. The restaurant has been
                told. If you do deliver it, tap Delivered below.
              </span>
            </p>
          ) : null}

          {mode === "idle" ? (
            <>
              {stage === "waiting" ? (
                <p className="rounded-xl bg-stone-100 p-3 text-center font-black text-stone-600">
                  Waiting for the kitchen to release the order
                </p>
              ) : null}
              {stage === "ready" ? (
                <button
                  className="focus-ring inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-4 text-lg font-black text-white disabled:opacity-60"
                  disabled={busy}
                  onClick={() => void pickedUp()}
                  type="button"
                >
                  {busy ? <Loader2 className="animate-spin" size={20} /> : <PackageCheck size={20} />}
                  Picked up — start delivery
                </button>
              ) : null}
              {stage === "on_the_way" || stage === "failed" ? (
                <button
                  className="focus-ring inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-4 text-lg font-black text-white"
                  onClick={() => {
                    setProblem(null);
                    setMode("deliver");
                  }}
                  type="button"
                >
                  <CheckCircle2 size={20} />
                  Delivered
                </button>
              ) : null}
              {stage === "on_the_way" || stage === "ready" ? (
                <button
                  className="focus-ring mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-stone-300 px-5 py-3 font-black text-stone-700"
                  onClick={() => {
                    setProblem(null);
                    setMode("fail");
                  }}
                  type="button"
                >
                  <XCircle size={18} />
                  Couldn&apos;t deliver
                </button>
              ) : null}
            </>
          ) : null}

          {mode === "deliver" ? (
            <div>
              <p className="font-black">Confirm delivery</p>
              {collects ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="How did the customer pay?">
                    <button
                      aria-pressed={method === "Cash on Delivery"}
                      className={`focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-4 py-3 font-black ${method === "Cash on Delivery" ? "border-leaf bg-leaf text-white" : "border-stone-300 text-stone-700"}`}
                      onClick={() => setMethod("Cash on Delivery")}
                      type="button"
                    >
                      <Banknote size={18} />
                      Cash
                    </button>
                    <button
                      aria-pressed={method === "Card on Delivery"}
                      className={`focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-4 py-3 font-black ${method === "Card on Delivery" ? "border-leaf bg-leaf text-white" : "border-stone-300 text-stone-700"}`}
                      onClick={() => setMethod("Card on Delivery")}
                      type="button"
                    >
                      <CreditCard size={18} />
                      Card
                    </button>
                  </div>
                  {method === "Cash on Delivery" ? (
                    <div className="mt-4">
                      <label className="text-sm font-black text-stone-700" htmlFor="tendered">
                        Cash the customer gave you
                      </label>
                      <input
                        autoComplete="off"
                        className="focus-ring mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-2xl font-black"
                        id="tendered"
                        inputMode="decimal"
                        onChange={(event) => setTendered(event.target.value)}
                        placeholder={String(job.collection.due)}
                        value={tendered}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="focus-ring rounded-full border border-stone-300 px-3 py-1.5 text-sm font-black"
                          onClick={() => setTendered(String(job.collection.due))}
                          type="button"
                        >
                          Exact
                        </button>
                        {noteChoices(job.currency.code, job.collection.due).map((note) => (
                          <button
                            className="focus-ring rounded-full border border-stone-300 px-3 py-1.5 text-sm font-black"
                            key={note}
                            onClick={() => setTendered(String(note))}
                            type="button"
                          >
                            {money(note)}
                          </button>
                        ))}
                      </div>
                      {tenderedAmount !== null && change === null ? (
                        <p className="mt-3 text-sm font-bold text-rose-700">That is less than {job.collection.dueLabel}.</p>
                      ) : null}
                      {change ? (
                        <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-lg font-black text-emerald-900">
                          Give change: {money(change)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-stone-600">
                      Confirm the card payment of {job.collection.dueLabel} went through on your terminal.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-stone-600">{job.collection.note ?? "Nothing to collect."}</p>
              )}
              <button
                className="focus-ring mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-leaf px-5 py-4 text-lg font-black text-white disabled:opacity-50"
                disabled={busy || !cashReady || job.collection.kind === "blocked"}
                onClick={() => void delivered()}
                type="button"
              >
                {busy ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                Confirm delivered
              </button>
              <button
                className="focus-ring mt-2 w-full rounded-full px-5 py-3 font-black text-stone-600"
                disabled={busy}
                onClick={() => setMode("idle")}
                type="button"
              >
                Back
              </button>
            </div>
          ) : null}

          {mode === "fail" ? (
            <div>
              <p className="font-black">Why could it not be delivered?</p>
              <label className="sr-only" htmlFor="reason">
                Reason
              </label>
              <select
                className="focus-ring mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-bold"
                id="reason"
                onChange={(event) => setReasonChoice(event.target.value)}
                value={reasonChoice}
              >
                {FAILURE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
              {reasonChoice === "Other" ? (
                <input
                  className="focus-ring mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-semibold"
                  maxLength={200}
                  onChange={(event) => setReasonText(event.target.value)}
                  placeholder="What happened?"
                  value={reasonText}
                />
              ) : null}
              <button
                className="focus-ring mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-700 px-5 py-3 font-black text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void failed()}
                type="button"
              >
                {busy ? <Loader2 className="animate-spin" size={18} /> : <XCircle size={18} />}
                Tell the restaurant
              </button>
              <button
                className="focus-ring mt-2 w-full rounded-full px-5 py-3 font-black text-stone-600"
                disabled={busy}
                onClick={() => setMode("idle")}
                type="button"
              >
                Back
              </button>
            </div>
          ) : null}

          {problem ? (
            <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">
              {problem}
            </p>
          ) : null}
        </section>
      )}

      {!finished && job.trackingState === "active" ? (
        <RiderLocationSharer initialState="active" token={token} />
      ) : null}
    </>
  );
}
