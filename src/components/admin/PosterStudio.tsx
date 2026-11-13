"use client";

// Poster Studio owner UI: template picker → subject picker → 3 generated
// variants → download / share / regenerate. A generator, not an editor — the
// only "edits" are regenerate copy, pick a variant, or switch to the
// text-only design. Mobile-first; critical actions stay reachable on a
// ~600px POS terminal viewport.

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent
} from "react";
import {
  Check,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Award,
  BadgePlus,
  PartyPopper,
  Star,
  Tag,
  Type
} from "lucide-react";

import {
  refreshPosterUrlsAction,
  sendPosterToRecentCustomersAction,
  type SendPosterState
} from "@/app/admin/marketing/actions";
import type {
  BestsellerOption,
  OfferOption
} from "@/app/admin/marketing/page";

type TemplateId = "bestseller" | "offer" | "new_item" | "loyalty" | "festival";
type PosterFormatId = "story" | "portrait" | "square";

const FORMATS: { id: PosterFormatId; label: string; aspect: string }[] = [
  { id: "story", label: "Story 9:16", aspect: "aspect-[9/16]" },
  { id: "portrait", label: "Feed 4:5", aspect: "aspect-[4/5]" },
  { id: "square", label: "Square 1:1", aspect: "aspect-square" }
];

function aspectClass(format: string | undefined): string {
  return FORMATS.find((entry) => entry.id === format)?.aspect ?? "aspect-[9/16]";
}

export type FestivalOption = { id: string; label: string; greeting: string };
export type LoyaltyOption = { enabled: boolean; summary: string };

type GeneratedVariant = {
  posterId: string;
  previewUrl: string;
  downloadUrl?: string;
  copy: { headline: string; subline: string; caption: string };
  /** AI caption + tracked store link, ready to paste. */
  shareCaption: string;
  variantIndex: number;
  theme?: string;
  format?: string;
};

type PosterUrlPair = {
  previewUrl: string | null;
  downloadUrl: string | null;
};

type HistoryEntry = {
  id: string;
  templateId: string;
  status: string;
  createdAt: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  headline: string;
  caption: string;
  shareCaption: string;
  sentCount: number;
  orderCount: number;
  format?: string;
};

/** The poster the action panel is acting on: a fresh variant or a history entry. */
type FocusedPoster = {
  source: "variant" | "history";
  posterId: string;
  headline: string;
  shareCaption: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  sentCount: number;
  orderCount: number;
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
  },
  {
    id: "new_item",
    label: "New item",
    description: "Announce a dish that just joined the menu.",
    icon: BadgePlus
  },
  {
    id: "loyalty",
    label: "Loyalty",
    description: "Invite customers to fill their stamp card.",
    icon: Award
  },
  {
    id: "festival",
    label: "Festival",
    description: "Greet customers for an occasion.",
    icon: PartyPopper
  }
];

export function PosterStudio({
  bestsellers,
  offers,
  newItems,
  loyalty,
  festivals,
  arabicAllowed,
  history,
  eligibleCount,
  themeLabels,
  defaultThemeId,
  frequencyCappedCount,
  sendBlockedReason
}: {
  bestsellers: BestsellerOption[];
  offers: OfferOption[];
  /** Newest available menu items (new-item template). */
  newItems: BestsellerOption[];
  loyalty: LoyaltyOption;
  /** Occasions for the restaurant's country. */
  festivals: FestivalOption[];
  /** Offer Arabic posters (UAE or Arabic details set). */
  arabicAllowed: boolean;
  history: HistoryEntry[];
  eligibleCount: number;
  /** Theme id → owner-facing name (from lib/poster/themes). */
  themeLabels: Record<string, string>;
  /** The restaurant's default poster theme (Settings → Poster branding). */
  defaultThemeId: string;
  /** Consented in-window customers held back by the 24h frequency cap. */
  frequencyCappedCount: number;
  /** Set when this restaurant cannot send at all (e.g. no own Cloud number). */
  sendBlockedReason: string | null;
}) {
  const [templateId, setTemplateId] = useState<TemplateId>("bestseller");
  const [subjectId, setSubjectId] = useState<string>(
    bestsellers[0]?.menuItemId ?? ""
  );
  const [textOnly, setTextOnly] = useState(false);
  const [format, setFormat] = useState<PosterFormatId>("story");
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [featuredItemId, setFeaturedItemId] = useState<string>("");
  const [themeMode, setThemeMode] = useState<"default" | "mix">("default");
  const [artStatus, setArtStatus] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  // Signed URLs expire after an hour; fresher ones minted on demand win.
  const [freshUrls, setFreshUrls] = useState<Record<string, PosterUrlPair>>({});
  const refreshAttempted = useRef(new Set<string>());
  const [variants, setVariants] = useState<GeneratedVariant[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Text-only setting the CURRENT variants were generated with.
  const [generatedTextOnly, setGeneratedTextOnly] = useState<boolean | null>(null);
  const [focusSource, setFocusSource] = useState<"variant" | "history">("variant");
  const [historyFocusId, setHistoryFocusId] = useState<string | null>(null);
  const [copiedPosterId, setCopiedPosterId] = useState<string | null>(null);
  // The poster the last send was for, so its summary isn't shown on another.
  const [lastSendPosterId, setLastSendPosterId] = useState<string | null>(null);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [sendState, sendAction, sendPending] = useActionState<
    SendPosterState,
    FormData
  >(sendPosterToRecentCustomersAction, {});

  useEffect(() => {
    if (sendState.sentAt || sendState.error) {
      setConfirmingSend(false);
    }
  }, [sendState]);

  const sendDisabledReason =
    sendBlockedReason ??
    (eligibleCount === 0
      ? frequencyCappedCount > 0
        ? "Everyone with an open chat window already got a marketing message in the last 24 hours."
        : "No customers who opted in have an open 24-hour chat window right now."
      : null);

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
    if (templateId === "new_item") {
      return newItems.map((option) => ({
        id: option.menuItemId,
        label: option.name,
        sublabel: option.priceLabel
      }));
    }
    if (templateId === "loyalty") {
      return loyalty.enabled ? [{ id: "loyalty", label: loyalty.summary, sublabel: "" }] : [];
    }
    if (templateId === "festival") {
      return festivals.map((option) => ({ id: option.id, label: option.label, sublabel: option.greeting }));
    }
    return offers.map((option) => ({
      id: option.offerId,
      label: option.title,
      sublabel: `Offer price ${option.priceLabel}`
    }));
  }, [templateId, bestsellers, offers, newItems, loyalty, festivals]);

  function pickTemplate(next: TemplateId) {
    setTemplateId(next);
    setVariants([]);
    setError(null);
    const first =
      next === "bestseller"
        ? bestsellers[0]?.menuItemId
        : next === "offer"
          ? offers[0]?.offerId
          : next === "new_item"
            ? newItems[0]?.menuItemId
            : next === "loyalty"
              ? loyalty.enabled
                ? "loyalty"
                : ""
              : festivals[0]?.id;
    setSubjectId(first ?? "");
    setFeaturedItemId("");
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
    setRateLimited(false);
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
            templateId === "offer"
              ? { offer_id: subjectId }
              : templateId === "loyalty"
                ? { loyalty: true }
                : templateId === "festival"
                  ? { festival: subjectId, ...(featuredItemId ? { menu_item_id: featuredItemId } : {}) }
                  : { menu_item_id: subjectId },
          forceTypographic: textOnly,
          themeMode,
          format,
          language: arabicAllowed ? language : "en"
        })
      });
      const payload = (await response.json()) as {
        variants?: GeneratedVariant[];
        error?: string;
        art?: string;
      };
      if (!response.ok || !payload.variants?.length) {
        setRateLimited(response.status === 429);
        setError(payload.error ?? "Poster generation failed. Try again.");
        return;
      }
      setVariants(payload.variants);
      setArtStatus(payload.art ?? null);
      setGeneratedTextOnly(textOnly);
      setFocusSource("variant");
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError("Poster generation failed. Check your connection and retry.");
      }
    } finally {
      setGenerating(false);
    }
  }

  const refreshUrls = useCallback(
    async (posterIds: string[]): Promise<Record<string, PosterUrlPair>> => {
      if (posterIds.length === 0) {
        return {};
      }
      try {
        const fresh = await refreshPosterUrlsAction(posterIds);
        const next: Record<string, PosterUrlPair> = {};
        for (const entry of fresh) {
          next[entry.posterId] = {
            previewUrl: entry.previewUrl,
            downloadUrl: entry.downloadUrl
          };
        }
        setFreshUrls((current) => ({ ...current, ...next }));
        return next;
      } catch {
        return {};
      }
    },
    []
  );

  // A broken preview (expired URL) gets one refresh per poster per page view,
  // so a genuinely missing file can't loop.
  const recoverImage = useCallback(
    (posterId: string) => {
      if (refreshAttempted.current.has(posterId)) {
        return;
      }
      refreshAttempted.current.add(posterId);
      void refreshUrls([posterId]);
    },
    [refreshUrls]
  );

  // History rows whose URL couldn't be signed at render time.
  useEffect(() => {
    const missing = history
      .filter((entry) => !entry.previewUrl)
      .map((entry) => entry.id)
      .filter((id) => !refreshAttempted.current.has(id));
    missing.forEach((id) => refreshAttempted.current.add(id));
    void refreshUrls(missing);
  }, [history, refreshUrls]);

  function previewFor(posterId: string, fallback: string | null | undefined) {
    return freshUrls[posterId]?.previewUrl ?? fallback ?? null;
  }

  // Always mint a fresh download URL first: the page may have been open for
  // longer than the URL lives. Falls back to the link's own href.
  async function downloadPoster(
    event: MouseEvent<HTMLAnchorElement>,
    posterId: string
  ) {
    event.preventDefault();
    const fallback = event.currentTarget.href;
    const fresh = await refreshUrls([posterId]);
    const url = fresh[posterId]?.downloadUrl ?? fallback;
    if (url) {
      window.location.assign(url);
    }
  }

  async function copyCaption(focused: FocusedPoster) {
    try {
      await navigator.clipboard.writeText(focused.shareCaption);
    } catch {
      // Clipboard API unavailable (http, old WebView): select-and-copy fallback.
      const area = document.createElement("textarea");
      area.value = focused.shareCaption;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopiedPosterId(focused.posterId);
    window.setTimeout(
      () => setCopiedPosterId((current) => (current === focused.posterId ? null : current)),
      2000
    );
  }

  const selected = variants[selectedIndex];
  const historyFocus = history.find((entry) => entry.id === historyFocusId);
  const focused: FocusedPoster | null =
    focusSource === "history" && historyFocus
      ? {
          source: "history",
          posterId: historyFocus.id,
          headline: historyFocus.headline,
          shareCaption: historyFocus.shareCaption,
          previewUrl: historyFocus.previewUrl,
          downloadUrl: historyFocus.downloadUrl,
          sentCount: historyFocus.sentCount,
          orderCount: historyFocus.orderCount
        }
      : focusSource === "variant" && selected
        ? {
            source: "variant",
            posterId: selected.posterId,
            headline: selected.copy.headline,
            shareCaption: selected.shareCaption,
            previewUrl: selected.previewUrl,
            downloadUrl: selected.downloadUrl ?? selected.previewUrl,
            sentCount: 0,
            orderCount: 0
          }
        : null;
  const textOnlyPending =
    variants.length > 0 && generatedTextOnly !== null && generatedTextOnly !== textOnly;

  function focusVariant(index: number) {
    setSelectedIndex(index);
    setFocusSource("variant");
    setConfirmingSend(false);
  }

  function focusHistory(posterId: string) {
    setHistoryFocusId(posterId);
    setFocusSource("history");
    setConfirmingSend(false);
  }

  function renderActionPanel(poster: FocusedPoster) {
    const showSendResult =
      lastSendPosterId === poster.posterId && (sendState.sentAt || sendState.error);
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        {poster.headline ? <p className="font-black text-ink">{poster.headline}</p> : null}
        <p className="mt-1 whitespace-pre-line break-words text-sm text-stone-600">
          {poster.shareCaption}
        </p>
        {poster.source === "history" ? (
          <p className="mt-2 text-xs font-bold text-stone-500">
            Sent to {poster.sentCount} customer{poster.sentCount === 1 ? "" : "s"} ·{" "}
            {poster.orderCount} order{poster.orderCount === 1 ? "" : "s"} from its link
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-black text-white hover:bg-ink/90"
            download
            href={
              freshUrls[poster.posterId]?.downloadUrl ??
              poster.downloadUrl ??
              poster.previewUrl ??
              undefined
            }
            onClick={(event) => downloadPoster(event, poster.posterId)}
          >
            <Download size={16} />
            Download — free
          </a>
          <button
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-bold text-stone-600 hover:border-leaf hover:text-leaf"
            onClick={() => copyCaption(poster)}
            type="button"
          >
            {copiedPosterId === poster.posterId ? <Check size={16} /> : <Copy size={16} />}
            {copiedPosterId === poster.posterId ? "Copied" : "Copy caption"}
          </button>
          {confirmingSend ? (
            <form
              action={sendAction}
              className="inline-flex"
              onSubmit={() => setLastSendPosterId(poster.posterId)}
            >
              <input name="posterId" type="hidden" value={poster.posterId} />
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
                Confirm send to up to {eligibleCount} customer
                {eligibleCount === 1 ? "" : "s"}
              </button>
            </form>
          ) : (
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-leaf px-4 py-2.5 text-sm font-black text-leaf hover:bg-mint disabled:cursor-not-allowed disabled:opacity-50"
              disabled={Boolean(sendDisabledReason) || sendPending}
              onClick={() => setConfirmingSend(true)}
              title={sendDisabledReason ?? undefined}
              type="button"
            >
              <Send size={16} />
              {poster.source === "history" && poster.sentCount > 0
                ? "Send again to new customers — free"
                : "Share to recent customers — free"}
              <span className="rounded-full bg-mint px-2 py-0.5 text-xs text-leaf">
                {eligibleCount}
              </span>
            </button>
          )}
          {poster.source === "variant" ? (
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-bold text-stone-600 hover:border-leaf hover:text-leaf disabled:opacity-50"
              disabled={generating}
              onClick={generate}
              type="button"
            >
              <RefreshCw size={16} />
              Regenerate copy
            </button>
          ) : null}
        </div>
        {sendBlockedReason ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {sendBlockedReason}
          </p>
        ) : (
          <p className="mt-3 text-xs text-stone-500">
            Goes only to customers who opted in to offers and messaged you in
            the last 24 hours, at most one marketing message per customer per
            day
            {frequencyCappedCount > 0 ? ` (${frequencyCappedCount} held back today)` : ""}
            . Nobody gets the same poster twice. &ldquo;Reply STOP to opt
            out.&rdquo; is added to every send.
          </p>
        )}
        {showSendResult && sendState.error ? (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
            {sendState.error}
          </p>
        ) : null}
        {showSendResult ? <SendSummary state={sendState} /> : null}
      </section>
    );
  }

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
            const disabled =
              (card.id === "offer" && offers.length === 0) ||
              (card.id === "loyalty" && !loyalty.enabled) ||
              (card.id === "new_item" && newItems.length === 0) ||
              (card.id === "festival" && festivals.length === 0);
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
                  {disabled
                    ? card.id === "loyalty"
                      ? "Turn on the stamp card in Settings first."
                      : card.id === "offer"
                        ? "No active offers right now."
                        : "Nothing to show yet."
                    : card.description}
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
            {templateId === "offer"
              ? "No active offers — create one under Menu first."
              : templateId === "loyalty"
                ? "Your stamp card is off. Turn it on in Settings to make loyalty posters."
                : "Add at least one available menu item to generate a poster."}
          </p>
        )}
        {templateId === "festival" && bestsellers.length > 0 ? (
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-600">
            Feature a dish (optional):
            <select
              className="focus-ring rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"
              onChange={(event) => setFeaturedItemId(event.target.value)}
              value={featuredItemId}
            >
              <option value="">No dish — greeting only</option>
              {bestsellers.map((option) => (
                <option key={option.menuItemId} value={option.menuItemId}>
                  {option.name} · {option.priceLabel}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-stone-600">Format:</span>
          {FORMATS.map((entry) => (
            <button
              aria-pressed={format === entry.id}
              className={`focus-ring rounded-full border px-3 py-1.5 font-bold transition ${
                format === entry.id ? "border-leaf bg-leaf text-white" : "border-stone-200 bg-white text-ink hover:border-leaf"
              }`}
              key={entry.id}
              onClick={() => setFormat(entry.id)}
              type="button"
            >
              {entry.label}
            </button>
          ))}
        </div>
        {arabicAllowed ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-stone-600">Language:</span>
            {(
              [
                ["en", "English"],
                ["ar", "العربية"]
              ] as const
            ).map(([id, label]) => (
              <button
                aria-pressed={language === id}
                className={`focus-ring rounded-full border px-3 py-1.5 font-bold transition ${
                  language === id ? "border-leaf bg-leaf text-white" : "border-stone-200 bg-white text-ink hover:border-leaf"
                }`}
                key={id}
                onClick={() => setLanguage(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-stone-600">
          <input
            checked={textOnly}
            className="h-4 w-4 accent-leaf"
            onChange={(event) => setTextOnly(event.target.checked)}
            type="checkbox"
          />
          <Type size={15} />
          Text-only design (skip the photo)
          <span className="font-normal text-stone-500">· applies to the next generation</span>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-stone-600">Look:</span>
          {(
            [
              ["default", `Your theme (${themeLabels[defaultThemeId] ?? defaultThemeId})`],
              ["mix", "One of each theme"]
            ] as const
          ).map(([mode, label]) => (
            <button
              aria-pressed={themeMode === mode}
              className={`focus-ring rounded-full border px-3 py-1.5 font-bold transition ${
                themeMode === mode
                  ? "border-leaf bg-leaf text-white"
                  : "border-stone-200 bg-white text-ink hover:border-leaf"
              }`}
              key={mode}
              onClick={() => setThemeMode(mode)}
              type="button"
            >
              {label}
            </button>
          ))}
          <a className="text-xs font-semibold text-leaf underline" href="/admin/settings#poster-branding">
            Change colours &amp; default look
          </a>
        </div>
        {textOnlyPending ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {textOnly
              ? "The posters below still use the photo."
              : "The posters below are text-only."}
            <button
              className="focus-ring rounded-md bg-amber-800 px-3 py-1 text-xs font-black text-white disabled:opacity-50"
              disabled={generating}
              onClick={generate}
              type="button"
            >
              Generate again to apply
            </button>
          </p>
        ) : null}
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
          <p
            className={`mt-3 rounded-lg p-3 text-sm font-semibold ${
              rateLimited ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"
            }`}
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {generating ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((index) => (
              <div
                className={`${aspectClass(format)} animate-pulse rounded-xl bg-stone-200`}
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
                  index === selectedIndex && focusSource === "variant"
                    ? "border-leaf"
                    : "border-transparent hover:border-stone-300"
                }`}
                key={variant.posterId}
                onClick={() => focusVariant(index)}
                type="button"
              >
                {/* Rendered PNGs come from short-lived signed URLs; the image optimizer would just re-proxy them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`Poster variant ${index + 1}: ${variant.copy.headline}`}
                  className={`${aspectClass(variant.format)} w-full object-cover`}
                  onError={() => recoverImage(variant.posterId)}
                  src={previewFor(variant.posterId, variant.previewUrl) ?? undefined}
                />
                {variant.theme && themeLabels[variant.theme] ? (
                  <span className="block bg-white px-2 py-1 text-left text-[11px] font-bold text-stone-500">
                    {themeLabels[variant.theme]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {!generating && variants.length > 0 && artStatus ? <ArtNote status={artStatus} /> : null}

      {/* 4 — actions for the selected variant */}
      {focused?.source === "variant" ? renderActionPanel(focused) : null}

      {/* history */}
      {history.length > 0 ? (
        <section>
          <h2 className="text-sm font-black uppercase tracking-wide text-stone-500">
            Recent posters
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {history.map((entry) => (
              <button
                aria-pressed={focused?.source === "history" && focused.posterId === entry.id}
                className={`focus-ring group overflow-hidden rounded-lg border-2 text-left transition ${
                  focused?.source === "history" && focused.posterId === entry.id
                    ? "border-leaf"
                    : "border-stone-200 hover:border-stone-300"
                }`}
                key={entry.id}
                onClick={() => focusHistory(entry.id)}
                type="button"
              >
                {previewFor(entry.id, entry.previewUrl) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    alt={`${entry.templateId} poster`}
                    className={`${aspectClass(entry.format)} w-full object-cover transition group-hover:opacity-90`}
                    onError={() => recoverImage(entry.id)}
                    src={previewFor(entry.id, entry.previewUrl) ?? undefined}
                  />
                ) : (
                  <div className={`${aspectClass(entry.format)} w-full bg-stone-100`} />
                )}
                <p className="truncate px-2 pt-1 text-[11px] font-bold capitalize text-stone-500">
                  {entry.templateId}
                </p>
                <p className="truncate px-2 pb-1 text-[11px] text-stone-500">
                  {entry.sentCount} sent · {entry.orderCount} order
                  {entry.orderCount === 1 ? "" : "s"}
                </p>
              </button>
            ))}
          </div>
          {focused?.source === "history" ? (
            <div className="mt-4">{renderActionPanel(focused)}</div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function SendSummary({ state }: { state: SendPosterState }) {
  const sent = state.sentCount ?? 0;
  const failed = state.failedCount ?? 0;
  const skipped = state.skippedCount ?? 0;
  const pending = state.pendingCount ?? 0;
  if (sent + failed + skipped + pending === 0) {
    return null;
  }
  return (
    <div className="mt-3 rounded-lg bg-mint p-3 text-sm text-leaf">
      <p className="font-semibold">
        Sent {sent} · Failed {failed} · Skipped {skipped}
        {pending > 0 ? ` · Not reached ${pending}` : ""}
      </p>
      {skipped > 0 ? (
        <p className="mt-1 text-xs text-stone-600">
          Skipped customers already got this poster or another marketing
          message in the last 24 hours, or are no longer opted in.
        </p>
      ) : null}
      {pending > 0 ? (
        <p className="mt-1 text-xs text-stone-600">
          {pending} customer{pending === 1 ? " is" : "s are"} still queued. Send
          again to finish — nobody gets the poster twice.
        </p>
      ) : null}
      {sent > 0 ? (
        <p className="mt-1 text-xs text-stone-600">
          Free — inside their 24-hour window.
        </p>
      ) : null}
    </div>
  );
}

const ART_NOTES: Record<string, string> = {
  ready: "Using the studio cut-out of this dish.",
  preparing:
    "We're making a studio cut-out (or background) for this dish. Generate again in about a minute to use it — these posters use your photo as it is.",
  limit: "Today's AI artwork allowance is used up, so these posters use your photo as it is. It resets tomorrow.",
  unavailable: "AI artwork couldn't be made for this dish just now, so these posters use your photo as it is."
};

function ArtNote({ status }: { status: string }) {
  const note = ART_NOTES[status];
  if (!note) return null;
  return (
    <p
      className={`-mt-4 rounded-lg p-3 text-sm font-semibold ${
        status === "ready" ? "bg-mint text-leaf" : "bg-stone-100 text-stone-600"
      }`}
    >
      {note}
    </p>
  );
}

