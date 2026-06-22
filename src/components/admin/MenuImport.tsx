"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import {
  extractMenuPageAction,
  importDraftMenuAction
} from "@/app/admin/menu/import/actions";
import { formatAED } from "@/lib/currency";
import type { DraftMenuItem } from "@/lib/menu-extraction/extract";

type Phase = "idle" | "working" | "review";

type RenderedPage = { index: number; dataUrl: string };

type DraftRow = DraftMenuItem & { id: string; pageIndex: number };

const MAX_PAGES = 30;
const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function dataUrlToBase64(dataUrl: string) {
  return dataUrl.split(",")[1] ?? "";
}

async function renderPdfToImages(file: File): Promise<RenderedPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const pages: RenderedPage[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    // Target ~1100px wide for legible text without oversized payloads.
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
    pages.push({ index: pageNumber - 1, dataUrl: canvas.toDataURL("image/jpeg", 0.8) });
  }

  return pages;
}

async function fileToImagePage(file: File): Promise<RenderedPage[]> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  return [{ index: 0, dataUrl }];
}

export function MenuImport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failedPages, setFailedPages] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  async function handleFile(file: File) {
    setError(null);

    if (!allowedTypes.includes(file.type)) {
      setError("Upload a PDF or an image (JPG/PNG/WebP).");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("File is too large. Keep it under 25 MB.");
      return;
    }

    setPhase("working");
    setRows([]);
    setFailedPages([]);

    let rendered: RenderedPage[] = [];
    try {
      rendered =
        file.type === "application/pdf"
          ? await renderPdfToImages(file)
          : await fileToImagePage(file);
    } catch {
      setError("Couldn't open that file. Try a different PDF or a clear photo.");
      setPhase("idle");
      return;
    }

    if (rendered.length === 0) {
      setError("No pages found in that file.");
      setPhase("idle");
      return;
    }

    setPages(rendered);
    setProgress({ done: 0, total: rendered.length });

    const collected: DraftRow[] = [];
    const failed: number[] = [];

    for (const page of rendered) {
      // Guard every call: a single page that errors or times out must not
      // freeze the whole import — mark it failed and move on.
      try {
        const result = await extractMenuPageAction({
          imageBase64: dataUrlToBase64(page.dataUrl),
          mimeType: "image/jpeg"
        });

        if (result.ok) {
          result.items.forEach((item, itemIndex) => {
            collected.push({
              ...item,
              id: `${page.index}-${itemIndex}-${Math.random().toString(36).slice(2, 8)}`,
              pageIndex: page.index
            });
          });
        } else {
          failed.push(page.index);
        }
      } catch {
        failed.push(page.index);
      }

      setProgress((current) => ({ ...current, done: current.done + 1 }));
    }

    setRows(collected);
    setFailedPages(failed);
    setPhase("review");

    if (collected.length === 0 && failed.length > 0) {
      setError("We couldn't read this menu automatically. You can add items by hand instead.");
    }
  }

  function updateRow(id: string, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    const result = await importDraftMenuAction(
      rows.map((row) => ({
        category: row.category,
        name: row.name,
        name_ar: row.name_ar,
        description: row.description,
        price: row.price,
        is_featured: row.is_featured,
        confidence: row.confidence
      }))
    );
    setPublishing(false);

    if (result.ok) {
      router.push("/admin/menu");
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  const lowConfidenceCount = rows.filter((row) => row.confidence === "low").length;

  return (
    <div className="space-y-6">
      {phase === "idle" ? (
        <div className="rounded-lg border-2 border-dashed border-stone-300 bg-white p-10 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-mint text-leaf">
            <Upload size={24} />
          </div>
          <p className="mt-4 font-black">Upload your menu</p>
          <p className="mt-1 text-sm text-stone-500">
            PDF or a clear photo. We read up to {MAX_PAGES} pages.
          </p>
          <button
            className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-leaf px-5 py-3 font-black text-white"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Sparkles size={18} />
            Choose file
          </button>
          <input
            accept=".pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
              event.target.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
          {error ? (
            <p className="mt-4 text-sm font-bold text-rose-700">{error}</p>
          ) : null}
        </div>
      ) : null}

      {phase === "working" ? (
        <div className="rounded-lg border border-stone-200 bg-white p-10 text-center">
          <Loader2 className="mx-auto animate-spin text-leaf" size={28} />
          <p className="mt-4 font-black">
            {progress.total === 0
              ? "Opening your menu…"
              : `Reading page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            This takes a moment — we&rsquo;re reading each page with AI.
          </p>
          {progress.total > 0 ? (
            <div className="mx-auto mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-leaf transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "review" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-4">
            <div>
              <p className="font-black">
                Found {rows.length} item{rows.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                Review and fix anything below, then add them to your menu.
                {lowConfidenceCount > 0
                  ? ` ${lowConfidenceCount} need a closer look (highlighted).`
                  : ""}
                {failedPages.length > 0
                  ? ` ${failedPages.length} page(s) couldn't be read.`
                  : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="focus-ring rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-black text-stone-600 hover:bg-stone-50"
                onClick={() => {
                  setPhase("idle");
                  setPages([]);
                  setRows([]);
                  setError(null);
                }}
                type="button"
              >
                Start over
              </button>
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-5 py-2.5 font-black text-white disabled:opacity-60"
                disabled={publishing || rows.length === 0}
                onClick={() => void publish()}
                type="button"
              >
                {publishing ? <Loader2 className="animate-spin" size={16} /> : null}
                Add {rows.length} item{rows.length === 1 ? "" : "s"} to my menu
              </button>
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {error}
            </p>
          ) : null}

          {pages.map((page) => {
            const pageRows = rows.filter((row) => row.pageIndex === page.index);
            if (pageRows.length === 0) {
              return null;
            }
            return (
              <div
                className="grid gap-4 rounded-lg border border-stone-200 bg-white p-4 lg:grid-cols-[260px_1fr]"
                key={page.index}
              >
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={`Menu page ${page.index + 1}`}
                    className="w-full rounded-lg border border-stone-100"
                    src={page.dataUrl}
                  />
                  <p className="mt-1 text-center text-xs font-bold text-stone-400">
                    Page {page.index + 1}
                  </p>
                </div>
                <div className="space-y-2">
                  {pageRows.map((row) => (
                    <div
                      className={`rounded-lg border p-3 ${
                        row.confidence === "low"
                          ? "border-amber-300 bg-amber-50"
                          : "border-stone-100"
                      }`}
                      key={row.id}
                    >
                      <div className="flex items-start gap-2">
                        <div className="grid flex-1 gap-2 sm:grid-cols-2">
                          <input
                            aria-label="Item name"
                            className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold"
                            onChange={(event) => updateRow(row.id, { name: event.target.value })}
                            placeholder="Item name"
                            value={row.name}
                          />
                          <input
                            aria-label="Arabic name"
                            className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
                            dir="rtl"
                            onChange={(event) =>
                              updateRow(row.id, { name_ar: event.target.value || null })
                            }
                            placeholder="الاسم بالعربية"
                            value={row.name_ar ?? ""}
                          />
                          <input
                            aria-label="Category"
                            className="focus-ring rounded-lg border border-stone-200 px-3 py-2 text-sm"
                            onChange={(event) => updateRow(row.id, { category: event.target.value })}
                            placeholder="Category"
                            value={row.category}
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-stone-500">AED</span>
                            <input
                              aria-label="Price"
                              className="focus-ring w-24 rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold"
                              inputMode="decimal"
                              onChange={(event) =>
                                updateRow(row.id, { price: Number(event.target.value) })
                              }
                              type="number"
                              value={row.price}
                            />
                            <label className="ml-auto flex items-center gap-1 text-xs font-bold text-stone-600">
                              <input
                                checked={row.is_featured}
                                onChange={(event) =>
                                  updateRow(row.id, { is_featured: event.target.checked })
                                }
                                type="checkbox"
                              />
                              Featured
                            </label>
                          </div>
                        </div>
                        <button
                          aria-label={`Remove ${row.name}`}
                          className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => removeRow(row.id)}
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <p className="mt-1 text-right text-xs text-stone-400">
                        {formatAED(Number.isFinite(row.price) ? row.price : 0)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
