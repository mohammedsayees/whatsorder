// lib/marketing/send-pipeline.ts
//
// Ledger-first marketing send. Every recipient is written to marketing_sends
// as `queued` BEFORE anything is sent; each row is then atomically claimed
// (queued/failed → sending) by exactly one invocation before WhatsApp is
// called, and its outcome recorded. So:
//
//   * a retry / double click / concurrent invocation never double-sends
//     (unique (poster_id, customer_phone) + the atomic claim);
//   * a run that hits its time budget leaves the rest `queued` and reports
//     them as pending — nothing is silently dropped;
//   * a queued row whose customer is no longer eligible (opted out, window
//     closed, frequency cap) is marked `skipped`, never sent.
//
// Pure orchestration over injected I/O so all of the above is unit-tested.

export const MARKETING_SEND_CONCURRENCY = 5;
/** Leaves headroom under the page's 60 s maxDuration for upload + revalidate. */
export const MARKETING_SEND_TIME_BUDGET_MS = 40_000;

export type MarketingSendStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "skipped";

export type MarketingSendRow = {
  id: string;
  customer_phone: string;
  conversation_id: string | null;
  status: MarketingSendStatus;
};

export type MarketingRecipient = {
  conversationId: string;
  phone: string;
};

export interface MarketingSendStore {
  /** Insert queued rows; existing (poster, phone) rows are left untouched. */
  queue(recipients: MarketingRecipient[], caption: string): Promise<boolean>;
  /** All ledger rows for this poster, or null on read error. */
  listForPoster(): Promise<MarketingSendRow[] | null>;
  /** queued|failed → sending. True only for the single invocation that won. */
  claim(rowId: string): Promise<boolean>;
  markSent(rowId: string, waMessageId: string, sentAt: Date): Promise<void>;
  markFailed(rowId: string, error: string): Promise<void>;
  markSkipped(rowIds: string[], reason: string): Promise<void>;
}

/** Sends to one recipient; returns the WhatsApp message id or null. */
export type MarketingSender = (row: MarketingSendRow) => Promise<string | null>;

export type MarketingSendResult = {
  sent: number;
  failed: number;
  /** Already sent this poster, claimed by another run, or no longer eligible. */
  skipped: number;
  /** Still queued: not reached within this run's time budget. */
  pending: number;
  error?: "ledger_unavailable" | "sender_unavailable";
};

export async function runMarketingSend(input: {
  store: MarketingSendStore;
  recipients: MarketingRecipient[];
  caption: string;
  /** Lazily prepares the sender (e.g. uploads media) only if work remains. */
  prepareSender: () => Promise<MarketingSender | null>;
  /**
   * Narrows this run (a campaign's segment). Ledger rows outside the scope are
   * left exactly as they are — not sent, not skipped.
   */
  scope?: (phone: string) => boolean;
  budgetMs?: number;
  concurrency?: number;
  now?: () => number;
}): Promise<MarketingSendResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const budgetMs = input.budgetMs ?? MARKETING_SEND_TIME_BUDGET_MS;
  const concurrency = Math.max(1, input.concurrency ?? MARKETING_SEND_CONCURRENCY);
  const result: MarketingSendResult = { sent: 0, failed: 0, skipped: 0, pending: 0 };

  // 1) Ledger first. Without a ledger there is no double-send protection, so
  //    fail closed and send nothing.
  if (input.recipients.length > 0) {
    const queued = await input.store.queue(input.recipients, input.caption);
    if (!queued) {
      return { ...result, error: "ledger_unavailable" };
    }
  }
  const rows = await input.store.listForPoster();
  if (!rows) {
    return { ...result, error: "ledger_unavailable" };
  }

  // 2) Partition. Only rows whose customer is eligible RIGHT NOW are sent.
  const eligible = new Set(input.recipients.map((recipient) => recipient.phone));
  const toSend: MarketingSendRow[] = [];
  const noLongerEligible: string[] = [];
  for (const row of rows) {
    if (input.scope && !input.scope(row.customer_phone)) {
      continue;
    }
    if (row.status === "queued" || row.status === "failed") {
      if (eligible.has(row.customer_phone)) {
        toSend.push(row);
      } else {
        noLongerEligible.push(row.id);
      }
    } else if (eligible.has(row.customer_phone)) {
      // Sent / sending / skipped earlier for someone who is in this run's
      // audience: they already have (or are getting) this poster.
      result.skipped += 1;
    }
  }
  if (noLongerEligible.length > 0) {
    await input.store.markSkipped(noLongerEligible, "no_longer_eligible");
    result.skipped += noLongerEligible.length;
  }
  if (toSend.length === 0) {
    return result;
  }

  const sender = await input.prepareSender();
  if (!sender) {
    // Rows stay queued; the next attempt picks them up.
    return { ...result, pending: toSend.length, error: "sender_unavailable" };
  }

  // 3) Bounded-concurrency worker pool with a time budget. Work not started
  //    before the budget runs out stays queued and is reported as pending.
  let cursor = 0;
  const worker = async () => {
    while (cursor < toSend.length) {
      if (now() - startedAt >= budgetMs) {
        return;
      }
      const row = toSend[cursor++];
      if (!(await input.store.claim(row.id))) {
        result.skipped += 1; // another invocation owns it
        continue;
      }
      let waMessageId: string | null = null;
      try {
        waMessageId = await sender(row);
      } catch {
        waMessageId = null;
      }
      if (waMessageId) {
        await input.store.markSent(row.id, waMessageId, new Date(now()));
        result.sent += 1;
      } else {
        await input.store.markFailed(row.id, "whatsapp_send_failed");
        result.failed += 1;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, toSend.length) }, worker)
  );
  result.pending = toSend.length - cursor;
  return result;
}
