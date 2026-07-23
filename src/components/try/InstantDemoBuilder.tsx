"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { buildDemoStoreAction } from "@/app/try/actions";
import { FOUNDER_WHATSAPP_NUMBER, DEMO_MAX_PAGES } from "@/lib/demo-store";

type Phase = "idle" | "building" | "done";

type PagePreview = { dataUrl: string; mimeType: string };

const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function dataUrlToBase64(dataUrl: string) {
  return dataUrl.split(",")[1] ?? "";
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = src;
  });
}

// Mirrors the admin importer: downscale phone photos client-side so the
// payload stays small while menu text remains legible.
async function fileToPage(file: File): Promise<PagePreview> {
  const rawUrl = await readAsDataUrl(file);
  const image = await loadImage(rawUrl);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    return { dataUrl: rawUrl, mimeType: file.type };
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), mimeType: "image/jpeg" };
}

// PDF menus render to images in the browser (dynamic import keeps pdfjs out
// of the initial bundle), then take the first DEMO_MAX_PAGES pages.
async function pdfToPages(file: File): Promise<PagePreview[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, DEMO_MAX_PAGES);
  const pages: PagePreview[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1100 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) {
      continue;
    }
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({ dataUrl: canvas.toDataURL("image/jpeg", 0.8), mimeType: "image/jpeg" });
  }

  return pages;
}

const fallbackWhatsAppUrl = `https://wa.me/${FOUNDER_WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Hi! I'd like a demo store for my restaurant."
)}`;

// Progress theater: the build takes 30-90s of opaque server work, so the UI
// narrates believable stages on a timer to keep the wait feeling short. The
// last stage holds until the real response lands.
const BUILD_STAGES = [
  "Uploading your menu ✓",
  "AI is reading items & prices…",
  "Building your categories…",
  "Putting your store live…"
];

function BuildProgress() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStage((current) => Math.min(current + 1, BUILD_STAGES.length - 1));
    }, 9000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-1000"
          style={{ width: `${((stage + 1) / BUILD_STAGES.length) * 92}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {BUILD_STAGES.map((label, index) => (
          <li
            key={label}
            className={
              index < stage
                ? "text-emerald-800"
                : index === stage
                  ? "flex items-center gap-2 font-semibold text-emerald-900"
                  : "text-slate-400"
            }
          >
            {index === stage && <Loader2 className="animate-spin" size={14} />}
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InstantDemoBuilder() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [name, setName] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [pages, setPages] = useState<PagePreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showWhatsAppFallback, setShowWhatsAppFallback] = useState(false);
  const [result, setResult] = useState<{
    url: string;
    claimUrl: string;
    itemCount: number;
    ownerWhatsApp: string | null;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFilesChosen(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }
    setError(null);
    setPreparing(true);
    try {
      const next: PagePreview[] = [...pages];
      for (const file of Array.from(fileList)) {
        if (next.length >= DEMO_MAX_PAGES) {
          break;
        }
        if (!allowedTypes.includes(file.type)) {
          setError("Use a menu photo (JPEG/PNG/WebP) or a PDF.");
          continue;
        }
        if (file.type === "application/pdf") {
          const rendered = await pdfToPages(file);
          next.push(...rendered.slice(0, DEMO_MAX_PAGES - next.length));
        } else {
          next.push(await fileToPage(file));
        }
      }
      setPages(next.slice(0, DEMO_MAX_PAGES));
    } catch {
      setError("Couldn't read that file. Try a photo of the menu instead.");
    } finally {
      setPreparing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function onBuild() {
    setError(null);
    setShowWhatsAppFallback(false);

    if (name.trim().length < 2) {
      setError("Enter your restaurant name.");
      return;
    }
    if (pages.length === 0) {
      setError("Add a photo of your menu.");
      return;
    }

    setPhase("building");
    try {
      const response = await buildDemoStoreAction({
        restaurantName: name,
        ownerWhatsApp: whatsApp.trim() || undefined,
        pages: pages.map((page) => ({
          imageBase64: dataUrlToBase64(page.dataUrl),
          mimeType: page.mimeType
        }))
      });

      if (!response.ok) {
        setPhase("idle");
        setError(response.error);
        setShowWhatsAppFallback(true);
        return;
      }

      setResult({
        url: response.url,
        claimUrl: response.claimUrl,
        itemCount: response.itemCount,
        ownerWhatsApp: response.ownerWhatsApp
      });
      setPhase("done");
    } catch {
      setPhase("idle");
      setError("Something went wrong while building your store. Try again in a moment.");
      setShowWhatsAppFallback(true);
    }
  }

  if (phase === "done" && result) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="text-4xl">🎉</div>
        <h2 className="mt-3 text-xl font-bold text-emerald-950">
          Your demo store is live — {result.itemCount} items imported
        </h2>
        <p className="mt-2 text-sm text-emerald-900/80">
          Open it on your phone, place a test order, and share the link with your team. It stays
          live for 7 days.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={result.claimUrl}
            className="rounded-full bg-emerald-950 px-6 py-3 font-semibold text-white shadow hover:bg-emerald-900"
          >
            Claim this restaurant →
          </a>
          <a
            href={result.url}
            className="rounded-full border border-emerald-600 px-6 py-3 font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Preview store
          </a>
        </div>
        {result.ownerWhatsApp && (
          <a
            href={`https://wa.me/${result.ownerWhatsApp}?text=${encodeURIComponent(
              `My WhatsOrder demo store: ${
                typeof window !== "undefined" ? window.location.origin : ""
              }${result.url}`
            )}`}
            target="_blank"
            rel="noopener"
            className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline"
          >
            Send the link to my WhatsApp →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
      <label className="block text-sm font-semibold text-emerald-950" htmlFor="demo-name">
        Restaurant name
      </label>
      <input
        id="demo-name"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Al Noor Cafeteria"
        maxLength={60}
        className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500"
        disabled={phase === "building"}
      />

      <div className="mt-4">
        <span className="block text-sm font-semibold text-emerald-950">
          Menu photo or PDF <span className="font-normal text-slate-500">(up to {DEMO_MAX_PAGES} pages)</span>
        </span>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          {pages.map((page, index) => (
            <div key={index} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.dataUrl}
                alt={`Menu page ${index + 1}`}
                className="h-24 w-20 rounded-lg border border-slate-200 object-cover"
              />
              <button
                type="button"
                aria-label={`Remove page ${index + 1}`}
                onClick={() => setPages(pages.filter((_, i) => i !== index))}
                className="absolute -right-2 -top-2 rounded-full bg-slate-900 p-1 text-white"
                disabled={phase === "building"}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {pages.length < DEMO_MAX_PAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={preparing || phase === "building"}
              className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-emerald-300 text-emerald-700 hover:border-emerald-500"
            >
              {preparing ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
              <span className="text-[11px] font-medium">{preparing ? "Reading…" : "Add"}</span>
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          hidden
          onChange={(event) => onFilesChosen(event.target.files)}
        />
        <p className="mt-2 text-xs text-slate-500">
          Your menu is used only to build this demo and is deleted with it after 7 days.
        </p>
      </div>

      <label className="mt-4 block text-sm font-semibold text-emerald-950" htmlFor="demo-whatsapp">
        Your WhatsApp number{" "}
        <span className="font-normal text-slate-500">(optional — so we can help you go live)</span>
      </label>
      <input
        id="demo-whatsapp"
        type="tel"
        value={whatsApp}
        onChange={(event) => setWhatsApp(event.target.value)}
        placeholder="05x xxx xxxx"
        maxLength={20}
        className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500"
        disabled={phase === "building"}
      />

      {error && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
          {showWhatsAppFallback && (
            <>
              {" "}
              <a href={fallbackWhatsAppUrl} className="font-semibold underline">
                Message us on WhatsApp
              </a>{" "}
              and we&apos;ll build it for you.
            </>
          )}
        </div>
      )}

      {phase === "building" && <BuildProgress />}

      <button
        type="button"
        onClick={onBuild}
        disabled={phase === "building" || preparing}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
      >
        {phase === "building" ? (
          <>
            <Loader2 className="animate-spin" size={18} />
            Building… (about a minute)
          </>
        ) : (
          "Build my demo store"
        )}
      </button>
    </div>
  );
}
