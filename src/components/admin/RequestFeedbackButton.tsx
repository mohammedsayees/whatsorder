"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { createFeedbackRequestAction } from "@/app/feedback/actions";

export function RequestFeedbackButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function requestFeedback() {
    setError(null);
    const feedbackWindow = window.open("about:blank", "_blank");
    if (feedbackWindow) {
      feedbackWindow.opener = null;
    }

    startTransition(async () => {
      const result = await createFeedbackRequestAction(orderId);

      if (!result.ok) {
        feedbackWindow?.close();
        setError(result.error);
        return;
      }

      if (feedbackWindow) {
        feedbackWindow.location.replace(result.whatsappUrl);
      } else {
        window.location.assign(result.whatsappUrl);
      }
    });
  }

  return (
    <div className="mt-2">
      <button
        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-leaf px-3 py-2 text-sm font-black text-leaf disabled:opacity-60"
        disabled={isPending}
        onClick={requestFeedback}
        type="button"
      >
        <MessageCircle size={16} />
        {isPending ? "Preparing link..." : "Request feedback"}
      </button>
      {error ? <p className="mt-2 text-xs font-bold text-rose-600">{error}</p> : null}
    </div>
  );
}
