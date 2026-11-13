import { describe, expect, it, vi } from "vitest";

import {
  runMarketingSend,
  type MarketingRecipient,
  type MarketingSendRow,
  type MarketingSendStore
} from "./send-pipeline";

/** In-memory ledger enforcing the DB's unique (poster, phone) + atomic claim. */
function memoryStore(options: { failQueue?: boolean; failList?: boolean } = {}) {
  const rows = new Map<string, MarketingSendRow & { caption: string; wamid?: string }>();
  let nextId = 1;
  const store: MarketingSendStore = {
    async queue(recipients, caption) {
      if (options.failQueue) return false;
      for (const recipient of recipients) {
        const exists = [...rows.values()].some(
          (row) => row.customer_phone === recipient.phone
        );
        if (!exists) {
          const id = `row-${nextId++}`;
          rows.set(id, {
            id,
            customer_phone: recipient.phone,
            conversation_id: recipient.conversationId,
            status: "queued",
            caption
          });
        }
      }
      return true;
    },
    async listForPoster() {
      if (options.failList) return null;
      return [...rows.values()].map((row) => ({ ...row }));
    },
    async claim(id) {
      // Yield so concurrent invocations genuinely interleave.
      await Promise.resolve();
      const row = rows.get(id);
      if (!row || (row.status !== "queued" && row.status !== "failed")) return false;
      row.status = "sending";
      return true;
    },
    async markSent(id, wamid) {
      const row = rows.get(id)!;
      row.status = "sent";
      row.wamid = wamid;
    },
    async markFailed(id) {
      rows.get(id)!.status = "failed";
    },
    async markSkipped(ids) {
      for (const id of ids) {
        const row = rows.get(id)!;
        if (row.status === "queued" || row.status === "failed") row.status = "skipped";
      }
    }
  };
  return { store, rows };
}

const recipients = (n: number): MarketingRecipient[] =>
  Array.from({ length: n }, (_, i) => ({
    conversationId: `conv-${i}`,
    phone: `97150000${String(i).padStart(4, "0")}`
  }));

function okSender() {
  const calls: string[] = [];
  const sender = vi.fn(async (row: MarketingSendRow) => {
    calls.push(row.customer_phone);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return `wamid.${row.customer_phone}`;
  });
  return { sender, calls };
}

describe("runMarketingSend", () => {
  it("queues every recipient before sending and records each outcome", async () => {
    const { store, rows } = memoryStore();
    const { sender } = okSender();
    const order: string[] = [];
    const spyQueue = store.queue;
    store.queue = async (...args) => {
      order.push("queue");
      return spyQueue(...args);
    };
    const result = await runMarketingSend({
      store,
      recipients: recipients(3),
      caption: "cap",
      prepareSender: async () => {
        order.push("prepare");
        return sender;
      }
    });
    expect(order).toEqual(["queue", "prepare"]);
    expect(result).toEqual({ sent: 3, failed: 0, skipped: 0, pending: 0 });
    expect([...rows.values()].every((row) => row.status === "sent")).toBe(true);
  });

  it("never double-sends on a second invocation for the same poster", async () => {
    const { store } = memoryStore();
    const { sender, calls } = okSender();
    const audience = recipients(4);
    await runMarketingSend({ store, recipients: audience, caption: "c", prepareSender: async () => sender });
    const prepare = vi.fn(async () => sender);
    const second = await runMarketingSend({ store, recipients: audience, caption: "c", prepareSender: prepare });
    expect(calls).toHaveLength(4);
    expect(second).toEqual({ sent: 0, failed: 0, skipped: 4, pending: 0 });
    // Nothing left to send → no media upload at all.
    expect(prepare).not.toHaveBeenCalled();
  });

  it("never double-sends when two invocations race (double click)", async () => {
    const { store } = memoryStore();
    const { sender, calls } = okSender();
    const audience = recipients(12);
    const [a, b] = await Promise.all([
      runMarketingSend({ store, recipients: audience, caption: "c", prepareSender: async () => sender }),
      runMarketingSend({ store, recipients: audience, caption: "c", prepareSender: async () => sender })
    ]);
    expect(calls).toHaveLength(12);
    expect(new Set(calls).size).toBe(12);
    expect(a.sent + b.sent).toBe(12);
  });

  it("retries failed rows on the next invocation, but only those", async () => {
    const { store } = memoryStore();
    const audience = recipients(3);
    const flaky = vi.fn(async (row: MarketingSendRow) =>
      row.customer_phone === audience[1].phone ? null : `wamid.${row.customer_phone}`
    );
    const first = await runMarketingSend({ store, recipients: audience, caption: "c", prepareSender: async () => flaky });
    expect(first).toMatchObject({ sent: 2, failed: 1 });
    const { sender, calls } = okSender();
    const second = await runMarketingSend({ store, recipients: audience, caption: "c", prepareSender: async () => sender });
    expect(calls).toEqual([audience[1].phone]);
    expect(second).toMatchObject({ sent: 1, failed: 0, skipped: 2 });
  });

  it("caps concurrency at 5", async () => {
    const { store } = memoryStore();
    let inFlight = 0;
    let peak = 0;
    const sender = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return "wamid";
    };
    const result = await runMarketingSend({ store, recipients: recipients(20), caption: "c", prepareSender: async () => sender });
    expect(result.sent).toBe(20);
    expect(peak).toBe(5);
  });

  it("leaves recipients queued and reports them when the time budget runs out", async () => {
    const { store, rows } = memoryStore();
    let clock = 0;
    const sender = async () => {
      clock += 10; // each send "takes" 10 ms
      return "wamid";
    };
    const result = await runMarketingSend({
      store,
      recipients: recipients(10),
      caption: "c",
      prepareSender: async () => sender,
      budgetMs: 25,
      concurrency: 1,
      now: () => clock
    });
    expect(result.sent).toBe(3);
    expect(result.pending).toBe(7);
    const statuses = [...rows.values()].map((row) => row.status);
    expect(statuses.filter((status) => status === "queued")).toHaveLength(7);

    // The next run finishes the job without resending anyone.
    const { sender: next, calls } = okSender();
    const resumed = await runMarketingSend({ store, recipients: recipients(10), caption: "c", prepareSender: async () => next });
    expect(calls).toHaveLength(7);
    expect(resumed).toMatchObject({ sent: 7, pending: 0, skipped: 3 });
  });

  it("skips queued rows whose customer is no longer eligible (e.g. replied STOP)", async () => {
    const { store, rows } = memoryStore();
    const audience = recipients(3);
    await runMarketingSend({
      store,
      recipients: audience,
      caption: "c",
      prepareSender: async () => null // upload failed → all stay queued
    });
    const { sender, calls } = okSender();
    const result = await runMarketingSend({
      store,
      recipients: audience.slice(1), // customer 0 opted out meanwhile
      caption: "c",
      prepareSender: async () => sender
    });
    expect(calls).not.toContain(audience[0].phone);
    expect(result).toMatchObject({ sent: 2, skipped: 1 });
    expect([...rows.values()].find((row) => row.customer_phone === audience[0].phone)?.status).toBe("skipped");
  });

  it("fails closed when the ledger cannot be written or read", async () => {
    const prepare = vi.fn(async () => okSender().sender);
    for (const options of [{ failQueue: true }, { failList: true }]) {
      const { store } = memoryStore(options);
      const result = await runMarketingSend({ store, recipients: recipients(2), caption: "c", prepareSender: prepare });
      expect(result).toMatchObject({ sent: 0, error: "ledger_unavailable" });
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it("reports recipients as pending when the sender cannot be prepared", async () => {
    const { store } = memoryStore();
    const result = await runMarketingSend({ store, recipients: recipients(2), caption: "c", prepareSender: async () => null });
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0, pending: 2, error: "sender_unavailable" });
  });

  it("counts a thrown send as failed, not sent", async () => {
    const { store } = memoryStore();
    const result = await runMarketingSend({
      store,
      recipients: recipients(1),
      caption: "c",
      prepareSender: async () => async () => {
        throw new Error("network");
      }
    });
    expect(result).toMatchObject({ sent: 0, failed: 1 });
  });
});
