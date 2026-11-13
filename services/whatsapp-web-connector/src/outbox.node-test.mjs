import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyStatus, createOutbox } from "./outbox.mjs";

const quiet = { warn() {}, error() {} };

function harness(options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "outbox-"));
  const delivered = [];
  const timers = [];
  let clock = 1_700_000_000_000;
  let replies = [];
  const outbox = createOutbox({
    dir,
    logger: quiet,
    now: () => clock,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    send: async (event) => {
      const reply = replies.length ? replies.shift() : "ok";
      if (reply === "ok") delivered.push(event.id);
      return reply;
    },
    ...options
  });
  return {
    dir,
    outbox,
    delivered,
    timers,
    files: () => readdirSync(dir).filter((n) => n.endsWith(".json")),
    reply: (...values) => { replies = values; },
    advance: (ms) => { clock += ms; }
  };
}

test("classifies app responses", () => {
  assert.equal(classifyStatus(503), "retry");
  assert.equal(classifyStatus(500), "retry");
  assert.equal(classifyStatus(429), "retry");
  assert.equal(classifyStatus(408), "retry");
  assert.equal(classifyStatus(401), "drop");
  assert.equal(classifyStatus(403), "drop");
});

test("delivers immediately when the app is up and leaves nothing on disk", async () => {
  const h = harness();
  await h.outbox.deliver({ id: "m1" });
  assert.deepEqual(h.delivered, ["m1"]);
  assert.deepEqual(h.files(), []);
});

test("keeps messages on disk while the app is down, then delivers them in order", async () => {
  const h = harness();
  h.reply("retry");
  await h.outbox.deliver({ id: "m1" });
  h.reply("retry");
  await h.outbox.deliver({ id: "m2" });
  assert.deepEqual(h.delivered, []);
  assert.equal(h.files().length, 2);
  assert.equal(statSync(path.join(h.dir, h.files()[0])).mode & 0o777, 0o600);
  assert.equal(h.timers.length, 1, "one retry timer, not one per message");
  assert.equal(h.timers[0].ms, 1000);

  // App back: the scheduled retry drains the queue in arrival order.
  await h.timers[0].fn();
  assert.deepEqual(h.delivered, ["m1", "m2"]);
  assert.deepEqual(h.files(), []);
});

test("backs off exponentially up to the cap", async () => {
  const h = harness({ maxDelayMs: 4000 });
  h.reply("retry");
  await h.outbox.deliver({ id: "m1" });
  for (let i = 0; i < 4; i += 1) {
    h.reply("retry");
    await h.timers.at(-1).fn();
  }
  assert.deepEqual(h.timers.map((t) => t.ms), [1000, 2000, 4000, 4000, 4000]);
});

test("survives a restart: a new outbox on the same dir delivers what was left", async () => {
  const h = harness();
  h.reply("retry");
  await h.outbox.deliver({ id: "m1" });
  const delivered = [];
  const restarted = createOutbox({
    dir: h.dir,
    logger: quiet,
    now: () => 1_700_000_000_000 + 60_000,
    setTimer: () => 0,
    send: async (event) => (delivered.push(event.id), "ok")
  });
  await restarted.flush();
  assert.deepEqual(delivered, ["m1"]);
});

test("drops events the app rejects for good, and moves on", async () => {
  const h = harness();
  h.reply("drop", "ok");
  await h.outbox.enqueue({ id: "bad" });
  await h.outbox.enqueue({ id: "good" });
  await h.outbox.flush();
  assert.deepEqual(h.delivered, ["good"]);
  assert.deepEqual(h.files(), []);
});

test("drops expired and unreadable events, and caps the queue size", async () => {
  const h = harness({ maxItems: 2, maxAgeMs: 60_000 });
  await h.outbox.enqueue({ id: "old" });
  h.advance(61_000);
  await h.outbox.enqueue({ id: "a" });
  await h.outbox.enqueue({ id: "b" });
  await h.outbox.enqueue({ id: "c" });
  writeFileSync(path.join(h.dir, "9999999999999-000000-00000000-0000-0000-0000-000000000000.json"), "{oops");
  await h.outbox.flush();
  // Cap keeps the newest 2 files ("c" and the unreadable one); the rest go.
  assert.deepEqual(h.delivered, ["c"]);
  assert.deepEqual(h.files(), []);
});

test("an event queued during a run is delivered without waiting for a timer", async () => {
  const h = harness();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const delivered = [];
  const outbox = createOutbox({
    dir: h.dir,
    logger: quiet,
    now: () => 1_700_000_000_000,
    setTimer: () => 0,
    send: async (event) => {
      if (event.id === "m1") await gate;
      delivered.push(event.id);
      return "ok";
    }
  });
  const first = outbox.deliver({ id: "m1" });
  await new Promise((resolve) => setImmediate(resolve));
  const second = outbox.deliver({ id: "m2" });
  release();
  await Promise.all([first, second]);
  assert.deepEqual(delivered, ["m1", "m2"]);
});
