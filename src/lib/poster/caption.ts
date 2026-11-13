// lib/poster/caption.ts
//
// Builds the caption actually sent with a marketing poster. The opt-out line
// is appended in CODE (never by the AI prompt) so it is always present,
// always worded the same and never duplicated.

/** WhatsApp Cloud API limit for image captions. */
export const WHATSAPP_CAPTION_MAX = 1024;

export const MARKETING_OPT_OUT_LINE = "Reply STOP to opt out.";

const SEPARATOR = "\n\n";

/**
 * AI caption + opt-out line, within WhatsApp's caption limit. Idempotent: a
 * caption that already carries the line (e.g. the stored sent caption) is not
 * given a second one. The AI text is trimmed to make room — the opt-out line
 * is never the part that gets cut.
 */
export function buildMarketingCaption(aiCaption: string | null | undefined): string {
  let body = (aiCaption ?? "").trim();
  // Strip every existing copy of the line so it ends up exactly once, last.
  while (body.includes(MARKETING_OPT_OUT_LINE)) {
    body = body.replace(MARKETING_OPT_OUT_LINE, "");
  }
  body = body.trim();

  if (!body) {
    return MARKETING_OPT_OUT_LINE;
  }

  const room = WHATSAPP_CAPTION_MAX - SEPARATOR.length - MARKETING_OPT_OUT_LINE.length;
  if (body.length > room) {
    body = `${body.slice(0, room - 1).trimEnd()}…`;
  }
  return `${body}${SEPARATOR}${MARKETING_OPT_OUT_LINE}`;
}
