// Display helpers for the WhatsApp chat-order parse review page. Pure: the
// stored parse result is described with today's menu names; ids that no longer
// exist are shown as removed rather than trusted.
import type { ChatParseResult } from "@/lib/whatsapp-order-flow";

export type ParseLogRow = {
  id: number;
  conversation_id: string;
  message_id: string;
  parser: "deterministic" | "gemini";
  model: string | null;
  input_text: string;
  parsed: unknown;
  outcome: "accepted" | "clarify" | "rejected" | "error";
  reason: string | null;
  created_at: string;
};

export const PARSE_REVIEW_RANGES = [1, 7, 30] as const;
export type ParseReviewRange = (typeof PARSE_REVIEW_RANGES)[number];

/** A deterministic miss that Gemini then handled is logged as a superseded row; the Gemini row is the outcome. */
export const SUPERSEDED_REASON_PREFIX = "unmatched; trying gemini";

export function parseReviewRange(value: string | undefined): ParseReviewRange {
  const days = Number(value);
  return (PARSE_REVIEW_RANGES as readonly number[]).includes(days) ? (days as ParseReviewRange) : 7;
}

export type OutcomeView = { label: string; tone: "good" | "info" | "warn" | "bad" | "neutral"; problem: boolean };

export function parseOutcomeView(row: Pick<ParseLogRow, "outcome" | "reason">): OutcomeView {
  if (row.outcome === "accepted") return { label: "Understood", tone: "good", problem: false };
  if (row.outcome === "clarify") return { label: "Asked to clarify", tone: "info", problem: false };
  if (row.outcome === "error") return { label: "AI error", tone: "bad", problem: true };
  if (row.reason === "not an order") return { label: "Not an order", tone: "neutral", problem: false };
  return { label: "Not understood", tone: "warn", problem: true };
}

export const parserLabel = (parser: ParseLogRow["parser"]) => (parser === "gemini" ? "AI" : "Exact match");

type Names = { items: Map<string, string>; options: Map<string, string> };

function resultOf(parsed: unknown): ChatParseResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  // Gemini rows store { raw, result }; deterministic rows store the result itself.
  const candidate = "result" in parsed ? (parsed as { result: unknown }).result : parsed;
  return candidate && typeof candidate === "object" && "kind" in candidate ? (candidate as ChatParseResult) : null;
}

const itemName = (id: string | null | undefined, names: Names) => (id && names.items.get(id)) || "removed item";

/** One line describing what the bot understood, e.g. "2 × Karak (Large) — less sugar". */
export function describeParse(parsed: unknown, names: Names): string {
  const result = resultOf(parsed);
  if (!result) return "—";
  switch (result.kind) {
    case "not_order": return "Passed to the receptionist";
    case "error": return result.message.slice(0, 200);
    case "unmatched": return result.queries.length ? `Not on the menu: ${result.queries.slice(0, 5).join(", ")}` : "Not on the menu";
    case "remove": return `Remove ${result.item_ids.map(id => itemName(id, names)).join(", ")}`;
    case "add": return result.lines.map(line => {
      const what = line.item_id
        ? itemName(line.item_id, names)
        : `one of ${line.candidates.map(id => itemName(id, names)).join(" / ") || "no items"}`;
      const options = (line.option_ids ?? []).map(id => names.options.get(id)).filter(Boolean);
      const note = line.note?.trim();
      return `${line.quantity} × ${what}${options.length ? ` (${options.join(", ")})` : ""}${note ? ` — ${note}` : ""}`;
    }).join("; ");
  }
}
