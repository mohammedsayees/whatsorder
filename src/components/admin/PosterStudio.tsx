"use client";

// Poster Studio owner UI: template picker → subject picker → 3 generated
// variants → download / share / regenerate. A generator, not an editor — the
// only "edits" are regenerate copy, pick a variant, or switch to the
// text-only design. Mobile-first; critical actions stay reachable on a
// ~600px POS terminal viewport.

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  Tag,
  Type
} from "lucide-react";

import {
  sendPosterToRecentCustomersAction,
  type SendPosterState
} from "@/app/admin/marketing/actions";
import type {
  BestsellerOption,
  OfferOption
} from "@/app/admin/marketing/page";

type TemplateId = "bestseller" | "offer";

type GeneratedVariant = {
  posterId: string;
  previewUrl: string;
  downloadUrl?: string;
  copy: { headline: string; subline: string; caption: string };
  variantIndex: number;
};

type HistoryEntry = {
  id: string;
  templateId: string;
  status: string;
  createdAt: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  caption: string;
};

const TEMPLATE_CARDS: {
  id: TemplateId;
  label: string;
  description: string;
  icon: typeof Star;
}[] = [
  {
    id: "bestseller",
    label: "Bestseller",
    description: "Show off what everyone keeps ordering.",
    icon: Star
  },
  {
    id: "offer",
    label: "Offer",
    description: "Push an active offer while it runs.",
    icon: Tag
  }
];

export function PosterStudio({
  bestsellers,
  offers,
  history,
  eligibleCount
}: {
  bestsellers: BestsellerOption[];
  offers: OfferOption[];
  history: HistoryEntry[];
  eligibleCount: number;
}) {
  const [templateId, setTemplateId] = useState<TemplateId>("bestseller");
  const [subjectId, setSubjectId] = useState<string>(
    bestsellers[0]?.menuItemId ?? ""
  );
  const [textOnly, setTextOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<GeneratedVariant[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [sendState, sendAction, sendPending] = useActionState<
    SendPosterState,
    FormData
  >(sendPosterToRecentCustomersAction, {});

  useEffect(() => {
    if (sendState.sentAt) {
      setConfirmingSend(false);
    }
  }, [sendState.sentAt]);

  const subjectOptions = useMemo(() => {
    if (templateId === "bestseller") {
      return bestsellers.map((option) => ({
        id: option.menuItemId,
        label: option.name,
        sublabel: option.soldQty
          ? `${option.soldQty}+ sold · ${option.priceLabel}`
          : option.priceLabel
      }));
    }
    return offers.map((option) => ({
      id: option.offerId,
      label: option.title,
      sublabel: `Offer price ${option.priceLabel}`
    }));
  }, [templateId, bestsellers, offers]);

  function pickTemplate(next: TemplateId) {
    setTemplateId(next);
    setVariants([]);
    setError(null);
    const first =
      next === "bestseller" ? bestsellers[0]?.menuItemId : offers[0]?.offerId;
    setSubjectId(first ?? "");
  }

  async function generate() {
    if (!subjectId || generating) {
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError(null);
    setVariants([]);
    setSelectedIndex(0);
    setConfirmingSend(false);
    try {
      const response = await fetch("/api/poster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          templateId,
          subjectRef:
            templateId === "bestseller"
              ? { menu_item_id: subjectId }
              : { offer_id: subjectId },
          forceTypographic: textOnly
        })
      });
      const payload = (await response.json()) as {
        variants?: GeneratedVariant[];
        error?: string;
      };
      if (!response.ok || !payload.variants?.length) {
        setError(payload.error ?? "Poster generation failed. Try again.");
        return;
      }
      setVariants(payload.variants);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError("Poster generation failed. Check your connection and retry.");
      }
    } finally {
      setGenerating(false);
    }
  }

  const selected = variants[selectedIndex];
  const hasSubjects = subjectOptions.length > 0;

  return (
    <div className="mt-6 space-y-8">
      {/* 1 — template */}
      <section>
        <h2 className="text-sm font-black uppercase tracking-wide text-stone-500">
          1 · Pick a template
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {TEMPLATE_CARDS.map((card) => {
            const Icon = card.icon;
            const active = templateId === card.id;
            const disabled = card.id === "offer" && offers.length === 0;
            return (
              <button
                className={`focus-ring rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-leaf bg-mint"
                    : "border-stone-200 bg-white hover:border-leaf"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                disabled={disabled}
                key={card.id}
                onClick={() => pickTemplate(card.id)}
                type="button"
              >
                <Icon className={active ? "text-leaf" : "text-stone-400"} size={22} />
                <p className="mt-2 font-black text-ink">{card.label}</p>
                <p className="mt-0.5 text-xs text-stone-600">
                  {disabled ? "No active offers right now." : card.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2 — subject */}
      <section>
        <h2 className="text-sm font-black uppercase tracking-wide text-stone-500">
          2 · Pick a subject
        </h2>
        {hasSubjects ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {subjectOptions.map((option) => {
              const active = subjectId === option.id;
              return (
                <button
                  className={`focus-ring rounded-full border px-4 py-2 text-left text-sm font-bold transition ${
                    active
                      ? "border-leaf bg-leaf text-white"
                      : "border-stone-200 bg-white text-ink hover:border-leaf"
                  }`}
                  key={option.id}
                  onClick={() => setSubjectId(option.id)}
                  type="button"
                >
                  {option.label}
                  <span
                    className={`ml-2 text-xs font-semibold ${active ? "text-mint" : "text-stone-500"}`}
                  >
                    {option.sublabel}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-stone-100 p-4 text-sm text-stone-600">
            {templateId === "bestseller"
              ? "Add at least one available menu item to generate a poster."
              : "No active offers — create one under Menu first."}
          </p>
        )}
        <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-stone-600">
          <input
            checked={textOnly}
            className="h-4 w-4 accent-leaf"
            onChange={(event) => setTextOnly(event.target.checked)}
            type="checkbox"
          />
          <Type size={15} />
          Text-only design (skip the photo)
        </label>
      </section>

      {/* 3 — generate */}
      <section>
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-leaf px-6 py-3 font-black text-white transition hover:bg-leaf/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasSubjects || !subjectId || generating}
          onClick={generate}
          type="button"
        >
          {generating ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Sparkles size={18} />
          )}
          {generating
            ? "Designing your posters…"
            : variants.length > 0
              ? "Generate again"
              : "Generate posters"}
        </button>
        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        {generating ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((index) => (
              <div
                className="aspect-[9/16] animate-pulse rounded-xl bg-stone-200"
                key={index}
              />
            ))}
          </div>
        ) : null}

        {!generating && variants.length > 0 ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {variants.map((variant, index) => (
              <button
                className={`focus-ring overflow-hidden rounded-xl border-2 transition ${
                  index === selectedIndex
                    ? "border-leaf"
                    : "border-transparent hover:border-stone-300"
                }`}
                key={variant.posterId}
                onClick={() => setSelectedIndex(index)}
                type="button"
              >
                {/* Rendered PNGs come from short-lived signed URLs; the image optimizer would just re-proxy them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`Poster variant ${index + 1}: ${variant.copy.headline}`}
                  className="aspect-[9/16] w-full object-cover"
                  src={variant.previewUrl}
                />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* 4 — actions for the selected variant */}
      {selected ? (
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="font-black text-ink">{selected.copy.headline}</p>
          <p className="mt-1 text-sm text-stone-600">{selected.copy.caption}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white hover:bg-ink/90"
              download
              href={selected.downloadUrl ?? selected.previewUrl}
            >
              <Download size={16} />
              Download — free
            </a>
            {confirmingSend ? (
              <form action={sendAction} className="inline-flex">
                <input name="posterId" type="hidden" value={selected.posterId} />
                <button
                  className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-4 py-2.5 text-sm font-black text-white hover:bg-leaf/90 disabled:opacity-50"
                  disabled={sendPending}
                  type="submit"
                >
                  {sendPending ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Send size={16} />
                  )}
                  Confirm send to {eligibleCount} customer
                  {eligibleCount === 1 ? "" : "s"}
                </button>
              </form>
            ) : (
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-leaf px-4 py-2.5 text-sm font-black text-leaf hover:bg-mint disabled:cursor-not-allowed disabled:opacity-50"
                disabled={eligibleCount === 0 || sendPending}
                onClick={() => setConfirmingSend(true)}
                title={
                  eligibleCount === 0
                    ? "No customers have an open 24-hour chat window right now."
                    : undefined
                }
                type="button"
              >
                <Send size={16} />
                Share to recent customers — free
                <span className="rounded-full bg-mint px-2 py-0.5 text-xs text-leaf">
                  {eligibleCount}
                </span>
              </button>
            )}
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-bold text-stone-600 hover:border-leaf hover:text-leaf disabled:opacity-50"
              disabled={generating}
              onClick={generate}
              type="button"
            >
              <RefreshCw size={16} />
              Regenerate copy
            </button>
          </div>
          {sendState.error ? (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
              {sendState.error}
            </p>
          ) : null}
          {sendState.sentAt ? (
            <p className="mt-3 rounded-lg bg-mint p-3 text-sm font-semibold text-leaf">
              Sent to {sendState.sentCount} customer
              {sendState.sentCount === 1 ? "" : "s"}
              {sendState.failedCount
                ? ` (${sendState.failedCount} failed)`
                : ""}
              . Free — inside their 24-hour window.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* history */}
      {history.length > 0 ? (
        <section>
          <h2 className="text-sm font-black uppercase tracking-wide text-stone-500">
            Recent posters
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {history.map((entry) => (
              <a
                className="focus-ring group overflow-hidden rounded-lg border border-stone-200"
                download
                href={entry.downloadUrl ?? undefined}
                key={entry.id}
              >
                {entry.previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    alt={`${entry.templateId} poster`}
                    className="aspect-[9/16] w-full object-cover transition group-hover:opacity-90"
                    src={entry.previewUrl}
                  />
                ) : (
                  <div className="aspect-[9/16] w-full bg-stone-100" />
                )}
                <p className="truncate px-2 py-1 text-[11px] font-bold capitalize text-stone-500">
                  {entry.templateId}
                  {entry.status === "sent_window" ? " · sent" : ""}
                </p>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
