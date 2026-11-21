"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function PendingButton({ children, pendingLabel }: { children: ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="focus-ring w-full rounded-lg bg-leaf px-5 py-4 text-lg font-black text-white disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

// Disabled for the cooldown the server also enforces, with a visible count.
export function ResendCodeButton({ initialSeconds }: { initialSeconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const { pending } = useFormStatus();

  useEffect(() => {
    if (seconds <= 0) {
      return;
    }
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const waiting = seconds > 0;
  return (
    <button
      className="focus-ring rounded-lg border border-stone-300 px-4 py-3 text-base font-bold text-ink disabled:text-stone-400"
      disabled={waiting || pending}
      type="submit"
    >
      {pending ? "Sending… / جارٍ الإرسال…" : waiting ? `Resend in ${seconds}s / إعادة الإرسال بعد ${seconds}` : "Resend / إعادة الإرسال"}
    </button>
  );
}
