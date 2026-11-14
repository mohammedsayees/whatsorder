"use client";

import { Printer } from "lucide-react";

export function PrintPageButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <button
      className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      <Printer size={16} />
      {label}
    </button>
  );
}
