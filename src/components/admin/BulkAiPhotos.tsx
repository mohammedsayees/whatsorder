"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Square } from "lucide-react";

import {
  confirmGeneratedMenuItemImageAction,
  generateMenuItemImageAction
} from "@/app/admin/menu/ai-image/actions";
import { DEFAULT_AI_IMAGE_STYLE_PRESET } from "@/lib/ai/image-style-presets";

type Item = { id: string; name: string };

// One button to give every photo-less item an AI food photo. Reuses the
// single-item actions (auth, tenant scoping and the server-side daily limit
// all apply per photo) and applies each photo as soon as it is ready. Runs
// one at a time so progress is visible and Stop takes effect quickly.
export function BulkAiPhotos({ items }: { items: Item[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const stopRequested = useRef(false);

  if (items.length === 0 && !running && done === 0) {
    return null;
  }

  async function run() {
    stopRequested.current = false;
    setRunning(true);
    setMessage(null);
    let added = 0;
    let failed = 0;

    for (const item of items) {
      if (stopRequested.current) {
        break;
      }
      setCurrent(item.name);
      const generated = await generateMenuItemImageAction({
        menuItemId: item.id,
        stylePreset: DEFAULT_AI_IMAGE_STYLE_PRESET
      }).catch(() => ({ ok: false as const, error: "Couldn't generate an image just now." }));

      if (!generated.ok) {
        if (/daily/i.test(generated.error)) {
          setMessage(`Today's AI photo limit is reached. ${added} added; run this again tomorrow for the rest.`);
          stopRequested.current = true;
          break;
        }
        failed += 1;
        continue;
      }

      const applied = await confirmGeneratedMenuItemImageAction({ generationId: generated.generationId }).catch(
        () => ({ ok: false as const, error: "" })
      );
      if (applied.ok) {
        added += 1;
        setDone(added);
      } else {
        failed += 1;
      }
    }

    setRunning(false);
    setCurrent(null);
    setMessage((existing) =>
      existing ??
      (failed > 0
        ? `${added} photos added. ${failed} couldn't be made; try those from the item editor.`
        : `${added} photos added. You can swap any of them from the item editor.`)
    );
    router.refresh();
  }

  const total = items.length;

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <ImagePlus size={19} /> Photos sell food
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            {total > 0
              ? `${total} ${total === 1 ? "item has" : "items have"} no photo. Add AI food photos to all of them in one go (up to 20 a day).`
              : "Every item has a photo."}
          </p>
        </div>
        {running ? (
          <button
            type="button"
            onClick={() => {
              stopRequested.current = true;
            }}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 font-bold"
          >
            <Square size={15} /> Stop
          </button>
        ) : total > 0 ? (
          <button
            type="button"
            onClick={run}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-2.5 font-black text-white"
          >
            <ImagePlus size={17} /> Add AI photos to {total} {total === 1 ? "item" : "items"}
          </button>
        ) : null}
      </div>
      {running ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full rounded-full bg-leaf transition-all"
              style={{ width: `${Math.round((done / Math.max(1, total)) * 100)}%` }}
            />
          </div>
          <p className="mt-2 flex items-center gap-2 text-sm text-stone-600">
            <Loader2 className="animate-spin" size={14} /> {done} of {total} done. Making a photo for{" "}
            <strong>{current}</strong>…
          </p>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm font-semibold text-emerald-900">{message}</p> : null}
    </section>
  );
}
