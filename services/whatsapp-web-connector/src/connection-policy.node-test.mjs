import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RECONNECT_ATTEMPTS,
  connectionClosePolicy
} from "./connection-policy.mjs";

test("515 restarts the socket without surfacing a disconnection", () => {
  assert.deepEqual(connectionClosePolicy({ code: 515 }), {
    reconnect: true,
    removeAuth: false,
    nextAttempt: 1,
    delayMs: 250
  });
});

test("transient disconnects retry with bounded backoff", () => {
  assert.deepEqual(
    connectionClosePolicy({ code: 408, reconnectAttempts: 2 }),
    {
      reconnect: true,
      removeAuth: false,
      nextAttempt: 3,
      delayMs: 4_000
    }
  );
});

test("logout removes stale credentials and asks for a new QR", () => {
  assert.deepEqual(connectionClosePolicy({ code: 401 }), {
    reconnect: false,
    removeAuth: true,
    reason: "WhatsApp removed this linked device. Generate a new QR code."
  });
});

test("manual disconnect does not reconnect", () => {
  assert.deepEqual(
    connectionClosePolicy({ code: 401, closing: true }),
    {
      reconnect: false,
      removeAuth: true,
      reason: "Disconnected by user"
    }
  );
});

test("retry exhaustion becomes a visible failure", () => {
  assert.deepEqual(
    connectionClosePolicy({
      code: 428,
      reconnectAttempts: MAX_RECONNECT_ATTEMPTS
    }),
    {
      reconnect: false,
      removeAuth: false,
      reason: `Could not restore the WhatsApp connection after ${MAX_RECONNECT_ATTEMPTS} attempts.`
    }
  );
});
