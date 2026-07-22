"use client";

import { FileDown } from "lucide-react";

export function BusinessDayReportActions() {
  return (
    <button
      className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white"
      onClick={() => window.print()}
      type="button"
    >
      <FileDown size={16} />
      Print / save report
    </button>
  );
}
