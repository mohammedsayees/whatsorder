"use client";

import { useState } from "react";

export function CopyJobLinkButton({ jobId }: { jobId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="focus-ring rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/jobs/${jobId}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      type="button"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
