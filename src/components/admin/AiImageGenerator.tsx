"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  confirmGeneratedMenuItemImageAction,
  generateMenuItemImageAction
} from "@/app/admin/menu/ai-image/actions";
import {
  AI_IMAGE_STYLE_PRESETS,
  DEFAULT_AI_IMAGE_STYLE_PRESET
} from "@/lib/ai/image-style-presets";

type Phase = "idle" | "generating" | "ready" | "applying";

// "Generate AI Image" entry point + modal for the menu item editor. Renders the
// trigger button and owns the whole generate → preview → confirm flow. The menu
// item's image only changes when the admin clicks "Use this image", which calls
// confirmGeneratedMenuItemImageAction. Admin/staff path only — never imported by
// the customer bundle.
export function AiImageGenerator({
  canWrite,
  itemId,
  itemName,
  restaurantId,
  onApplied
}: {
  canWrite: boolean;
  itemId?: string;
  itemName: string;
  restaurantId?: string;
  onApplied: (imageUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stylePreset, setStylePreset] = useState<string>(DEFAULT_AI_IMAGE_STYLE_PRESET);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generation needs a saved item to attach to (the server keys the log + the
  // image update on menu_item_id).
  const canGenerate = canWrite && Boolean(itemId);
  const isBusy = phase === "generating" || phase === "applying";

  function reset() {
    setPhase("idle");
    setPreviewUrl(null);
    setGenerationId(null);
    setError(null);
    setStylePreset(DEFAULT_AI_IMAGE_STYLE_PRESET);
  }

  function close() {
    if (isBusy) {
      return;
    }
    setOpen(false);
    reset();
  }

  async function generate() {
    if (!itemId || isBusy) {
      return;
    }
    setError(null);
    setPhase("generating");

    const result = await generateMenuItemImageAction({
      menuItemId: itemId,
      stylePreset,
      restaurantId
    });

    if (!result.ok) {
      setError(result.error);
      setPhase(previewUrl ? "ready" : "idle");
      return;
    }

    setPreviewUrl(result.previewUrl);
    setGenerationId(result.generationId);
    setPhase("ready");
  }

  async function apply() {
    if (!generationId || isBusy) {
      return;
    }
    setError(null);
    setPhase("applying");

    const result = await confirmGeneratedMenuItemImageAction({
      generationId,
      restaurantId
    });

    if (!result.ok) {
      setError(result.error);
      setPhase("ready");
      return;
    }

    onApplied(result.imageUrl);
    setOpen(false);
    reset();
  }

  return (
    <>
      <button
        aria-disabled={!canGenerate}
        className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-leaf px-3 py-2 text-sm font-black text-leaf hover:bg-mint disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canGenerate}
        onClick={() => setOpen(true)}
        title={
          canGenerate ? undefined : "Save the item first to generate an AI image."
        }
        type="button"
      >
        <Sparkles size={14} />
        Generate AI Image
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-xl">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">Generate AI image</h2>
              <button
                className="focus-ring rounded-full p-2 text-stone-500 disabled:opacity-50"
                disabled={isBusy}
                onClick={close}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-stone-600">
              Create a professional food photo for{" "}
              <span className="font-black text-ink">{itemName || "this item"}</span> using AI.
            </p>

            <label className="mt-4 block text-sm font-black text-ink" htmlFor="ai-style-preset">
              Style
            </label>
            <select
              className="focus-ring mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm disabled:opacity-50"
              disabled={isBusy}
              id="ai-style-preset"
              onChange={(event) => setStylePreset(event.target.value)}
              value={stylePreset}
            >
              {AI_IMAGE_STYLE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>

            <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-linen">
              {phase === "generating" ? (
                <div className="grid h-56 place-items-center px-4 text-center text-sm font-bold text-ink/60">
                  Generating image…
                </div>
              ) : previewUrl ? (
                // Generated image lives in public Supabase Storage; a plain img
                // keeps it visible without remote image config.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={itemName ? `${itemName} AI preview` : "AI generated preview"}
                  className="h-56 w-full object-cover"
                  src={previewUrl}
                />
              ) : (
                <div className="grid h-56 place-items-center px-4 text-center text-sm font-bold text-ink/50">
                  Pick a style and tap Generate to preview an image.
                </div>
              )}
            </div>

            {error ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {phase === "ready" || phase === "applying" ? (
                <>
                  <button
                    className="focus-ring flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                    disabled={isBusy}
                    onClick={() => {
                      void apply();
                    }}
                    type="button"
                  >
                    {phase === "applying" ? "Applying…" : "Use this image"}
                  </button>
                  <button
                    className="focus-ring flex-1 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-black text-ink disabled:opacity-50"
                    disabled={isBusy}
                    onClick={() => {
                      void generate();
                    }}
                    type="button"
                  >
                    Regenerate
                  </button>
                </>
              ) : (
                <button
                  className="focus-ring flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                  disabled={isBusy}
                  onClick={() => {
                    void generate();
                  }}
                  type="button"
                >
                  {phase === "generating" ? "Generating…" : "Generate"}
                </button>
              )}
              <button
                className="focus-ring rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-black text-stone-600 disabled:opacity-50"
                disabled={isBusy}
                onClick={close}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
