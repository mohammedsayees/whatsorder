import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { PaginationNav } from "@/components/admin/PaginationNav";
import { WhatsAppSectionNav } from "@/components/admin/WhatsAppSectionNav";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { getWhatsAppIntegration } from "@/lib/whatsapp-integration";
import {
  describeParse,
  parseOutcomeView,
  parserLabel,
  parseReviewRange,
  PARSE_REVIEW_RANGES,
  type OutcomeView
} from "@/lib/whatsapp-order-review";
import { getChatParseReview, PARSE_REVIEW_PAGE_SIZE } from "@/lib/whatsapp-order-review-data";

export const dynamic = "force-dynamic";

const toneClass: Record<OutcomeView["tone"], string> = {
  good: "bg-emerald-100 text-emerald-800",
  info: "bg-sky-100 text-sky-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-rose-100 text-rose-800",
  neutral: "bg-stone-100 text-stone-600"
};

export default async function WhatsAppParseReviewPage({
  searchParams
}: {
  searchParams: Promise<{ days?: string; problems?: string; page?: string }>;
}) {
  const [session, query] = await Promise.all([
    requireRestaurantRole(["restaurant_admin", "owner", "manager"]),
    searchParams
  ]);
  const { restaurant } = session;
  const days = parseReviewRange(query.days);
  const problemsOnly = query.problems === "1";
  const requestedPage = Number(query.page);
  const [review, integration] = await Promise.all([
    getChatParseReview(restaurant.id, {
      days, problemsOnly, page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
    }),
    getWhatsAppIntegration(restaurant.id)
  ]);
  const canManageAutomation = session.role === "owner" || session.role === "restaurant_admin";
  const totalParses = Object.values(review.counts).reduce((sum, n) => sum + n, 0);
  const summary: Array<{ label: string; value: number; tone: OutcomeView["tone"] }> = [
    { label: "Understood", value: review.counts.accepted, tone: "good" },
    { label: "Asked to clarify", value: review.counts.clarify, tone: "info" },
    { label: "Not understood / not an order", value: review.counts.rejected, tone: "warn" },
    { label: "AI errors", value: review.counts.error, tone: "bad" }
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <WhatsAppSectionNav active="parsing" canManageAutomation={canManageAutomation} integration={integration} />

      <section className="mt-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black">How the bot read order messages</h2>
        <p className="mt-1 text-sm text-stone-600">
          Each chat-ordering message and what the bot understood. Use “Not understood” rows to spot item names customers
          use that are not on your menu, then rename items or add Arabic names. Messages are kept for 90 days.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.map((item) => (
            <div className="rounded-xl bg-stone-50 p-3" key={item.label}>
              <p className="text-xs font-bold text-stone-500">{item.label}</p>
              <p className="mt-1 text-2xl font-black">{item.value}</p>
              {totalParses > 0 ? (
                <p className="text-xs font-semibold text-stone-400">{Math.round((item.value / totalParses) * 100)}%</p>
              ) : null}
            </div>
          ))}
        </div>

        <form action="/admin/integrations/whatsapp/parsing" className="mt-4 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4" method="get">
          <label className="text-sm font-bold">
            <span className="sr-only">Period</span>
            <select className="focus-ring rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-black text-stone-700" defaultValue={days} name="days">
              {PARSE_REVIEW_RANGES.map((value) => (
                <option key={value} value={value}>{value === 1 ? "Last 24 hours" : `Last ${value} days`}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input defaultChecked={problemsOnly} name="problems" type="checkbox" value="1" />
            Problems only
          </label>
          <button className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-black text-white" type="submit">Apply</button>
        </form>
      </section>

      <section className="mt-4 space-y-2">
        {review.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-12 text-center">
            <p className="font-black">No order messages in this period</p>
            <p className="mt-1 text-sm text-stone-500">
              {problemsOnly ? "Nothing went wrong. Clear “Problems only” to see every message." : "Chat-ordering messages appear here once customers start ordering by text."}
            </p>
          </div>
        ) : (
          review.rows.map((row) => {
            const outcome = parseOutcomeView(row);
            return (
              <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm" key={row.id}>
                <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                  <span className={`rounded-full px-2.5 py-1 ${toneClass[outcome.tone]}`}>{outcome.label}</span>
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">{parserLabel(row.parser)}</span>
                  <span className="font-semibold text-stone-400">{formatRestaurantShortDateTime(row.created_at, restaurant)}</span>
                  <Link
                    className="focus-ring ml-auto inline-flex items-center gap-1 text-leaf hover:underline"
                    href={`/admin/chats?filter=all&c=${encodeURIComponent(row.conversation_id)}`}
                  >
                    <MessageSquareText aria-hidden="true" size={14} />
                    Open chat
                  </Link>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm font-bold text-ink">“{row.input_text.slice(0, 500)}”</p>
                <p className="mt-1 text-sm text-stone-600">
                  <span className="font-bold text-stone-500">Understood as: </span>
                  {describeParse(row.parsed, review.names)}
                </p>
                {row.reason && outcome.problem ? (
                  <p className="mt-1 text-xs font-semibold text-stone-400">Reason: {row.reason}</p>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <PaginationNav
        basePath="/admin/integrations/whatsapp/parsing"
        page={review.page}
        pageSize={PARSE_REVIEW_PAGE_SIZE}
        query={{ days: String(days), ...(problemsOnly ? { problems: "1" } : {}) }}
        total={review.total}
        totalPages={review.totalPages}
      />
    </main>
  );
}
