"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, QrCode } from "lucide-react";

export function QrCodePanel({ restaurantName, url }: { restaurantName: string; url: string }) {
  const [dataUrl, setDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      color: { dark: "#173d2f", light: "#ffffff" }
    }).then(setDataUrl);
  }, [url]);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      <div className="grid aspect-square place-items-center rounded-lg border border-stone-200 bg-white p-5">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`QR code for ${restaurantName}`} className="h-full w-full" src={dataUrl} />
        ) : (
          <QrCode className="text-stone-300" size={72} />
        )}
      </div>
      <div>
        <p className="text-sm font-bold text-stone-500">Public menu link</p>
        <p className="mt-2 break-all rounded-lg bg-stone-100 px-4 py-3 text-sm font-semibold">{url}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-bold"
            onClick={copyLink}
            type="button"
          >
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? "Copied" : "Copy link"}
          </button>
          {dataUrl ? (
            <a
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white"
              download={`${restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-menu-qr.png`}
              href={dataUrl}
            >
              <Download size={17} />
              Download QR
            </a>
          ) : null}
        </div>
        <p className="mt-5 text-sm leading-6 text-stone-500">
          Print this QR code on tables, counters, flyers, and delivery packaging. It always points
          to the restaurant&apos;s current public menu slug.
        </p>
      </div>
    </div>
  );
}
