"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Manual refresh only — no polling loop (admin polling burned the Vercel
// Active CPU budget once already; live chat updates are a later phase).
export function ChatRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-black text-stone-600 hover:bg-stone-50 disabled:opacity-50"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
