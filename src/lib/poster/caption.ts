// lib/poster/caption.ts
//
// Builds the caption that goes out with a poster. Everything after the AI
// text is appended in CODE (never by the AI prompt) so it is always present,
// always worded the same and never duplicated:
//
//   <AI caption>
//
//   <tracked store link>            (Phase 3: ?src=poster-<id>)
//
//   Reply STOP to opt out.          (marketing sends only)

import { posterAttributionSource } from "@/lib/attribution";

/** WhatsApp Cloud API limit for image captions. */
export const WHATSAPP_CAPTION_MAX = 1024;

export const MARKETING_OPT_OUT_LINE = "Reply STOP to opt out.";
/** Arabic posters: "To unsubscribe send «إيقاف»" (matched by lib/marketing/opt-out.ts). */
export const MARKETING_OPT_OUT_LINE_AR = "للإلغاء أرسل «إيقاف».";

const OPT_OUT_LINES = [MARKETING_OPT_OUT_LINE, MARKETING_OPT_OUT_LINE_AR];

const SEPARATOR = "\n\n";

/** `<app url>/r/<slug>?src=poster-<posterId>` */
export function posterStoreLink(
  appUrl: string,
  restaurantSlug: string,
  posterId: string
): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/r/${encodeURIComponent(restaurantSlug)}?src=${posterAttributionSource(posterId)}`;
}

function stripAll(text: string, fragment: string): string {
  let result = text;
  while (fragment && result.includes(fragment)) {
    result = result.replace(fragment, "");
  }
  return result;
}

/**
 * AI caption + store link (+ opt-out line), within WhatsApp's caption limit.
 * Idempotent: a caption that already carries the link or the opt-out line is
 * not given a second one. The AI text is trimmed to make room — the link and
 * the opt-out line are never the part that gets cut.
 */
export function buildPosterCaption(
  aiCaption: string | null | undefined,
  options: { storeLink?: string | null; optOut?: boolean; language?: "en" | "ar" } = {}
): string {
  const storeLink = options.storeLink?.trim() || null;
  const tail = [
    storeLink,
    options.optOut
      ? options.language === "ar"
        ? MARKETING_OPT_OUT_LINE_AR
        : MARKETING_OPT_OUT_LINE
      : null
  ].filter((part): part is string => Boolean(part));

  let body = aiCaption ?? "";
  for (const line of OPT_OUT_LINES) {
    body = stripAll(body, line);
  }
  if (storeLink) {
    body = stripAll(body, storeLink);
  }
  body = body.trim();

  const tailText = tail.join(SEPARATOR);
  if (!body) {
    return tailText;
  }
  if (!tailText) {
    return body.slice(0, WHATSAPP_CAPTION_MAX);
  }
  const room = WHATSAPP_CAPTION_MAX - SEPARATOR.length - tailText.length;
  if (body.length > room) {
    body = `${body.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  }
  return `${body}${SEPARATOR}${tailText}`;
}

/** The caption sent with a marketing poster: AI text + link + opt-out line. */
export function buildMarketingCaption(
  aiCaption: string | null | undefined,
  storeLink?: string | null,
  language: "en" | "ar" = "en"
): string {
  return buildPosterCaption(aiCaption, { storeLink, optOut: true, language });
}
