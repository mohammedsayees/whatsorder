"use client";

import { useState } from "react";
import { buildWhatsAppJobShareUrl } from "@/lib/jobs";
import type { PublicJob } from "@/lib/jobs";

export function CopyJobLinkButton({
  city,
  emirate,
  jobId,
  jobUrl,
  restaurantName,
  title
}: {
  city: string;
  emirate: PublicJob["emirate"];
  jobId: string;
  jobUrl: string;
  restaurantName: string | null;
  title: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <a
        className="focus-ring rounded-lg bg-[#25D366] px-3 py-2 text-xs font-black text-[#073b24]"
        href={buildWhatsAppJobShareUrl(
          { city, emirate, restaurant_name: restaurantName, title },
          jobUrl
        )}
        onClick={() => {
          void fetch(`/api/jobs/${jobId}/event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventType: "job_shared" })
          });
        }}
        rel="noopener noreferrer"
        target="_blank"
      >
        Share on WhatsApp
      </a>
      <button
        className="focus-ring rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700"
        onClick={async () => {
          await navigator.clipboard.writeText(jobUrl);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
        type="button"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </>
  );
}
