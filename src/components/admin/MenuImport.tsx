"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import {
  extractMenuPageAction,
  generateMenuDescriptionsAction,
  importDraftMenuAction
} from "@/app/admin/menu/import/actions";
import { uploadMenuItemImageAction } from "@/app/actions";
import { formatAED } from "@/lib/currency";
import type { DraftMenuItem } from "@/lib/menu-extraction/extract";

type Phase = "idle" | "working" | "review";

type RenderedPage = { index: number; dataUrl: string };

type DraftRow = DraftMenuItem & { id: string; pageIndex: number; imageUrl: string | null };

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

async function fileToImagePage(file: File): Promise<RenderedPage[]> {
  const rawUrl = await readAsDataUrl(file);
  const image = await loadImage(rawUrl);
  // Downscale large phone photos so the payload stays small and legible,
  // mirroring how PDF pages are rendered. Menus need detail for small text,
  // so target a generous 1600px on the long edge.
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    return [{ index: 0, dataUrl: rawUrl }];
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return [{ index: 0, dataUrl: canvas.toDataURL("image/jpeg", 0.85) }];
}

// Shrink a chosen item photo before upload so it stays well under the menu
// image size limit, regardless of the source camera resolution.
async function downscaleToFile(file: File, maxEdge: number): Promise<File> {
  const image = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );

  return blob ? new File([blob], "menu-item.jpg", { type: "image/jpeg" }) : file;
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
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const [writingDescriptions, setWritingDescriptions] = useState(false);

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
    let lastError: string | null = null;

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
              pageIndex: page.index,
              imageUrl: null
            });
          });
        } else {
          failed.push(page.index);
          lastError = result.error;
        }
      } catch {
        failed.push(page.index);
        lastError = "The connection dropped while reading a page. Please try again.";
      }

      setProgress((current) => ({ ...current, done: current.done + 1 }));
    }

    setRows(collected);
    setFailedPages(failed);
    setPhase("review");

    if (collected.length === 0 && failed.length > 0) {
      setError(
        lastError ??
          "We couldn't read this menu automatically. You can add items by hand instead."
      );
    }
  }

  function updateRow(id: string, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  async function uploadRowImage(id: string, file: File) {
    setUploadingImageId(id);
    setError(null);
    try {
      const optimized = await downscaleToFile(file, 1000);
      const formData = new FormData();
      formData.set("image", optimized);
      formData.set("item_name", rows.find((row) => row.id === id)?.name || "menu-item");
      const result = await uploadMenuItemImageAction(formData);
      if (result.ok) {
        updateRow(id, { imageUrl: result.publicUrl });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't upload that image. Try a different one.");
    } finally {
      setUploadingImageId(null);
    }
  }

  async function writeDescriptionsWithAi() {
    const targets = rows.filter((row) => !row.description?.trim());
    if (targets.length === 0) {
      return;
    }
    setWritingDescriptions(true);
    setError(null);
    const result = await generateMenuDescriptionsAction(
      targets.map((row) => ({ name: row.name, category: row.category }))
    );
    setWritingDescriptions(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.description?.trim()
          ? row
          : { ...row, description: result.descriptions[row.name] ?? row.description }
      )
    );
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
        image_url: row.imageUrl
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
            <Sparkles size={24} />
          </div>
          <p className="mt-4 font-black">Let AI build your menu</p>
          <p className="mt-1 text-sm text-stone-500">
            Drop in your menu PDF or a photo. Our AI reads every item, price, and
            Arabic name for you — up to {MAX_PAGES} pages.
          </p>
          <button
            className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-leaf px-5 py-3 font-black text-white"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload size={18} />
            Upload menu
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
              : `AI is reading page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Hang tight — our AI is reading each item, price, and Arabic name.
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
              <p className="inline-flex items-center gap-1.5 font-black">
                <Sparkles className="text-leaf" size={16} />
                AI read {rows.length} item{rows.length === 1 ? "" : "s"} from your menu
              </p>
              <p className="mt-1 text-sm text-stone-500">
                Review and tweak anything below — add photos and descriptions — then
                publish to your live menu.
                {lowConfidenceCount > 0
                  ? ` ${lowConfidenceCount} need a closer look (highlighted).`
                  : ""}
                {failedPages.length > 0
                  ? ` ${failedPages.length} page(s) couldn't be read.`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-leaf px-4 py-2.5 text-sm font-black text-leaf hover:bg-mint disabled:opacity-60"
                disabled={writingDescriptions || rows.length === 0}
                onClick={() => void writeDescriptionsWithAi()}
                type="button"
              >
                {writingDescriptions ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Wand2 size={16} />
                )}
                Write descriptions with AI
              </button>
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
                Publish {rows.length} item{rows.length === 1 ? "" : "s"}
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

                      <div className="mt-2 flex items-start gap-3">
                        <div className="shrink-0 text-center">
                          {row.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt={row.name}
                              className="mb-1 h-16 w-16 rounded-lg border border-stone-200 object-cover"
                              src={row.imageUrl}
                            />
                          ) : null}
                          <label className="focus-ring inline-flex cursor-pointer items-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50">
                            {uploadingImageId === row.id ? (
                              <Loader2 className="animate-spin" size={13} />
                            ) : (
                              <ImagePlus size={13} />
                            )}
                            {row.imageUrl ? "Change" : "Add photo"}
                            <input
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              disabled={uploadingImageId === row.id}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  void uploadRowImage(row.id, file);
                                }
                                event.target.value = "";
                              }}
                              type="file"
                            />
                          </label>
                        </div>
                        <textarea
                          aria-label="Description"
                          className="focus-ring min-h-[3.5rem] flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm"
                          onChange={(event) =>
                            updateRow(row.id, { description: event.target.value || null })
                          }
                          placeholder="Short description (optional) — or use “Write descriptions with AI”"
                          value={row.description ?? ""}
                        />
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
