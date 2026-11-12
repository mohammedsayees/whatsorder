import "server-only";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  SUPERSEDED_REASON_PREFIX,
  type ParseLogRow,
  type ParseReviewRange
} from "@/lib/whatsapp-order-review";

export const PARSE_REVIEW_PAGE_SIZE = 50;
const COLUMNS = "id, conversation_id, message_id, parser, model, input_text, parsed, outcome, reason, created_at";
// Hide deterministic misses that Gemini went on to handle; null reasons must survive the filter.
export const VISIBLE_ROWS_FILTER = `parser.eq.gemini,reason.is.null,reason.not.like.${SUPERSEDED_REASON_PREFIX.split(";")[0]}*`;
const PROBLEM_OUTCOMES = ["rejected", "error"] as const;

export type ParseReviewPage = {
  rows: ParseLogRow[];
  total: number;
  page: number;
  totalPages: number;
  counts: Record<ParseLogRow["outcome"], number>;
  names: { items: Map<string, string>; options: Map<string, string> };
};

/** Parse log for one restaurant (the caller passes the session's restaurant id). */
export async function getChatParseReview(restaurantId: string, options: {
  days: ParseReviewRange; problemsOnly: boolean; page: number;
}): Promise<ParseReviewPage> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Parse review database unavailable");
  const since = new Date(Date.now() - options.days * 24 * 60 * 60_000).toISOString();
  const page = Math.max(1, Math.floor(options.page) || 1);
  const scoped = (select: string, head = false) => admin.from("whatsapp_order_parse_logs")
    .select(select, head ? { count: "exact", head: true } : { count: "exact" })
    .eq("restaurant_id", restaurantId)
    .gte("created_at", since)
    .or(VISIBLE_ROWS_FILTER);

  let list = scoped(COLUMNS);
  if (options.problemsOnly) list = list.in("outcome", [...PROBLEM_OUTCOMES]);
  const from = (page - 1) * PARSE_REVIEW_PAGE_SIZE;
  const outcomes = ["accepted", "clarify", "rejected", "error"] as const;
  const [listResult, menu, catalog, ...countResults] = await Promise.all([
    list.order("created_at", { ascending: false }).range(from, from + PARSE_REVIEW_PAGE_SIZE - 1),
    getMenu(restaurantId, { admin: true }),
    getMenuOptionCatalog(restaurantId, { admin: true }),
    ...outcomes.map(outcome => scoped("id", true).eq("outcome", outcome))
  ]);
  if (listResult.error) throw new Error(`Parse review read failed: ${listResult.error.code}`);
  const total = listResult.count ?? 0;
  return {
    rows: (listResult.data ?? []) as unknown as ParseLogRow[],
    total,
    page,
    totalPages: Math.ceil(total / PARSE_REVIEW_PAGE_SIZE),
    counts: Object.fromEntries(outcomes.map((outcome, i) => [outcome, countResults[i].count ?? 0])) as ParseReviewPage["counts"],
    names: {
      items: new Map(menu.items.map(item => [item.id, item.name])),
      options: new Map(catalog.options.map(option => [option.id, option.name]))
    }
  };
}
