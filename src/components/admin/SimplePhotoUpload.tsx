"use client";

import { useRef, useState } from "react";
import { uploadFinanceDocumentAction } from "@/app/admin/finance/documents/actions";

// One big button: tap, take a photo (or pick a PDF), and it uploads straight away.
export function SimplePhotoUpload({ label = "Add a bill", hint = "Take a photo of the bill" }: { label?: string; hint?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <form action={uploadFinanceDocumentAction} ref={formRef}>
      <label className={`focus-within:ring-2 focus-within:ring-leaf flex min-h-[88px] cursor-pointer items-center gap-4 rounded-2xl bg-leaf px-5 py-4 text-white shadow-sm ${uploading ? "opacity-70" : ""}`}>
        <span aria-hidden className="text-4xl">📷</span>
        <span>
          <span className="block text-xl font-black">{uploading ? "Uploading…" : label}</span>
          <span className="block text-sm text-white/90">{uploading ? "Please wait, reading the bill next" : hint}</span>
        </span>
        <input
          accept="application/pdf,image/jpeg,image/png,image/webp"
          capture="environment"
          className="sr-only"
          name="bill"
          onChange={(event) => {
            if (event.target.files?.length) {
              setUploading(true);
              formRef.current?.requestSubmit();
            }
          }}
          required
          type="file"
        />
      </label>
    </form>
  );
}
