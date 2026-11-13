// Durable outbox for inbound customer messages.
//
// A message the app cannot accept right now (deploy, outage, maintenance
// window, cutover) is kept on disk and retried with backoff, in arrival
// order, instead of being dropped after a few seconds. The app de-duplicates
// on message id, so redelivery is safe.
//
// One JSON file per event in `dir` (on the persistent volume), mode 0600.
// Files are written to a temp name and renamed, so a crash never leaves a
// half-written event. Limits keep a long outage from filling the disk:
// events older than maxAgeMs, or beyond maxItems, are dropped with a warning.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE_PATTERN = /^\d{13}-\d{6}-[0-9a-f-]{36}\.json$/;

/** "retry" for transient failures, "drop" for ones a retry cannot fix. */
export function classifyStatus(status) {
  if (status === 408 || status === 425 || status === 429) return "retry";
  if (status >= 400 && status < 500) return "drop";
  return "retry";
}

export function createOutbox({
  dir,
  send,
  logger = console,
  maxItems = 5000,
  maxAgeMs = 24 * 60 * 60 * 1000,
  minDelayMs = 1000,
  maxDelayMs = 5 * 60 * 1000,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms)
}) {
  let sequence = 0;
  let flushing = null;
  let rerun = false;
  let timer = null;
  let delayMs = minDelayMs;

  async function ensureDir() {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }

  async function pending() {
    const names = (await readdir(dir).catch(() => [])).filter((name) => FILE_PATTERN.test(name));
    return names.sort();
  }

  async function enqueue(event) {
    await ensureDir();
    sequence = (sequence + 1) % 1_000_000;
    const name = `${String(now()).padStart(13, "0")}-${String(sequence).padStart(6, "0")}-${randomUUID()}.json`;
    const temp = path.join(dir, `.${name}.tmp`);
    await writeFile(temp, JSON.stringify(event), { mode: 0o600 });
    await rename(temp, path.join(dir, name));
    return name;
  }

  function schedule(ms) {
    if (timer) return;
    timer = setTimer(() => {
      timer = null;
      return flush().catch((error) => logger.error?.({ error: error?.message }, "outbox flush failed"));
    }, ms);
  }

  async function drain() {
    let names = await pending();
    if (names.length > maxItems) {
      const overflow = names.slice(0, names.length - maxItems);
      logger.warn?.({ dropped: overflow.length }, "outbox full: dropping oldest events");
      await Promise.all(overflow.map((name) => rm(path.join(dir, name), { force: true })));
      names = names.slice(overflow.length);
    }

    for (const name of names) {
      const file = path.join(dir, name);
      const queuedAt = Number(name.slice(0, 13));
      if (now() - queuedAt > maxAgeMs) {
        logger.warn?.({ file: name }, "outbox event expired: dropping");
        await rm(file, { force: true });
        continue;
      }

      let event;
      try {
        event = JSON.parse(await readFile(file, "utf8"));
      } catch {
        logger.warn?.({ file: name }, "outbox event unreadable: dropping");
        await rm(file, { force: true });
        continue;
      }

      const result = await send(event);
      if (result === "ok" || result === "drop") {
        if (result === "drop") logger.warn?.({ file: name, type: event?.type }, "outbox event rejected by app: dropping");
        await rm(file, { force: true });
        delayMs = minDelayMs;
        continue;
      }

      // Keep order: stop at the first event that still cannot be delivered.
      const remaining = (await pending()).length;
      logger.warn?.({ remaining, retryInMs: delayMs }, "outbox delivery deferred");
      schedule(delayMs);
      delayMs = Math.min(delayMs * 2, maxDelayMs);
      return;
    }
  }

  /**
   * Deliver everything queued, in order. A call made while a run is in
   * progress waits for it and then runs once more, so events queued mid-run
   * are not left behind.
   */
  function flush() {
    if (flushing) {
      rerun = true;
      return flushing;
    }
    flushing = (async () => {
      do {
        rerun = false;
        await drain();
      } while (rerun && !timer);
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  /** Queue an event, then try to deliver the queue. */
  async function deliver(event) {
    await enqueue(event);
    await flush();
  }

  return { enqueue, flush, deliver, pending };
}
