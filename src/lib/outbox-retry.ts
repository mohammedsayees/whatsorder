// Bounded exponential backoff persisted with the payload across reloads.
export function queuedRetryUpdate(attempts: number, error: string, now = Date.now()) {
  const delay = Math.min(300_000, 20_000 * 2 ** Math.min(4, Math.max(0, attempts)));
  return { status: "queued" as const, attempts: attempts + 1,
    lastError: error, nextAttemptAt: now + delay };
}

export function outboxResultUpdate(result: { error?: string; retryUnchanged?: boolean; order?: { id: string } }, attempts: number, now = Date.now()) {
  if (result.error && !result.retryUnchanged) {
    return { status: "failed" as const, lastError: result.error, attempts: attempts + 1, nextAttemptAt: 0 };
  }
  if (!result.error && result.order?.id) return null;
  return queuedRetryUpdate(attempts, result.error ?? "Waiting for save confirmation.", now);
}
