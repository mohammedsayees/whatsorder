"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  MessageCircle,
  Printer,
  QrCode
} from "lucide-react";

import {
  recordStoreShareAction,
  type StoreShareAction
} from "@/app/admin/share/actions";

function trackShareAction(restaurantId: string, shareAction: StoreShareAction) {
  void recordStoreShareAction(restaurantId, shareAction).catch(() => {
    // Sharing must still work if best-effort onboarding tracking is unavailable.
  });
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy is unavailable.");
  }
}

export function StoreShareKit({
  menuUrl,
  qrDataUrl,
  restaurantId,
  restaurantName,
  restaurantSlug
}: {
  menuUrl: string;
  qrDataUrl: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Order from ${restaurantName}: ${menuUrl}`
  )}`;

  async function copyStoreLink() {
    try {
      await copyText(menuUrl);
      setCopyState("copied");
      trackShareAction(restaurantId, "link_copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("error");
    }
  }

  function downloadQrCode() {
    const anchor = document.createElement("a");
    anchor.download = `${restaurantSlug}-order-qr.png`;
    anchor.href = qrDataUrl;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    trackShareAction(restaurantId, "qr_downloaded");
  }

  function printQrCard() {
    trackShareAction(restaurantId, "qr_printed");
    window.print();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
      <header className="print:hidden">
        <p className="text-sm font-black uppercase tracking-wide text-leaf">Final launch step</p>
        <h1 className="mt-1 text-3xl font-black">Share your store</h1>
        <p className="mt-2 max-w-2xl text-stone-600">
          Copy your permanent ordering link or download the QR code. Customers can use either one immediately.
        </p>
      </header>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] print:mt-0 print:block">
        <section className="space-y-4 print:hidden">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Copy className="text-leaf" size={19} />
              <h2 className="text-lg font-black">Your permanent store link</h2>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Permanent store link"
                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 font-semibold text-stone-700"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={menuUrl}
              />
              <button
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-leaf px-5 py-3 font-black text-white"
                onClick={copyStoreLink}
                type="button"
              >
                {copyState === "copied" ? <Check size={18} /> : <Copy size={18} />}
                {copyState === "copied" ? "Copied" : "Copy link"}
              </button>
            </div>
            <p aria-live="polite" className="mt-2 min-h-5 text-sm font-semibold text-stone-500">
              {copyState === "error" ? "Copy failed. Select the link above and copy it manually." : copyState === "copied" ? "Store link copied — you are ready to share." : "This link stays the same unless you change your store address in Settings."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-4 font-black text-white"
              onClick={downloadQrCode}
              type="button"
            >
              <Download size={19} />
              Download QR image
            </button>
            <a
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-4 font-black text-white"
              href={whatsappUrl}
              onClick={() => trackShareAction(restaurantId, "whatsapp_shared")}
              rel="noopener noreferrer"
              target="_blank"
            >
              <MessageCircle size={19} />
              Share on WhatsApp
            </a>
            <button
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-4 font-black text-ink"
              onClick={printQrCard}
              type="button"
            >
              <Printer size={19} />
              Print QR counter card
            </button>
            <a
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-4 font-black text-ink"
              href={menuUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink size={19} />
              Open customer store
            </a>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 shrink-0 text-stone-500" size={20} />
              <div>
                <h2 className="font-black">Need a full printed menu too?</h2>
                <p className="mt-1 text-sm text-stone-600">
                  The printable-menu designer is optional and includes this QR code automatically.
                </p>
                <Link className="focus-ring mt-3 inline-flex rounded font-black text-leaf underline" href="/admin/menu/print">
                  Create printable menu
                </Link>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-3xl border border-stone-200 bg-white p-6 text-center shadow-xl print:mx-auto print:w-[105mm] print:border-2 print:border-stone-900 print:p-[10mm] print:shadow-none">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-xs font-black uppercase tracking-wide text-leaf print:hidden">
            <QrCode size={14} />
            Live ordering QR
          </div>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-leaf">Scan to order</p>
          <h2 className="mt-2 text-3xl font-black text-ink">{restaurantName}</h2>
          {/* The authenticated server page generates this QR as an embeddable data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={`QR code for ${restaurantName} online ordering`}
            className="mx-auto mt-5 aspect-square w-full max-w-[300px]"
            src={qrDataUrl}
          />
          <p className="mt-4 break-all text-sm font-bold text-stone-600">
            {menuUrl.replace(/^https?:\/\//, "")}
          </p>
          <p className="mt-3 text-sm text-stone-500">Open the menu, choose items, and order on WhatsApp.</p>
        </aside>
      </div>
    </main>
  );
}
