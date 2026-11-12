"use client";

import { useActionState } from "react";
import { Loader2, MailWarning } from "lucide-react";

import {
  resendOwnerVerificationEmailAction,
  type ResendVerificationState
} from "@/app/auth/verify-email/actions";

export function OwnerEmailBanner({
  email,
  daysLeft,
  blocking = false
}: {
  email: string;
  daysLeft: number;
  blocking?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ResendVerificationState>(
    resendOwnerVerificationEmailAction,
    { status: "idle", message: "" }
  );

  return (
    <section
      role={blocking ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm ${
        blocking ? "border-rose-300 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex min-w-0 flex-1 items-start gap-2">
          <MailWarning className="mt-0.5 shrink-0" size={17} />
          <span>
            <strong>Confirm your email.</strong> We sent a link to <strong>{email}</strong>.{" "}
            {blocking
              ? "Open it to keep using your dashboard."
              : `Open it within ${daysLeft} ${daysLeft === 1 ? "day" : "days"} to keep access and set a password.`}
          </span>
        </p>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 font-bold shadow-sm ring-1 ring-black/10 disabled:opacity-60"
          >
            {pending ? <Loader2 className="animate-spin" size={14} /> : null}
            Resend link
          </button>
        </form>
      </div>
      {state.message ? (
        <p className={`mt-2 text-xs font-semibold ${state.status === "error" ? "text-rose-700" : "text-emerald-800"}`}>
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
