export const MAX_RECONNECT_ATTEMPTS = 6;

const RESET_AUTH_CODES = new Set([401, 411, 500]);
const NON_RETRYABLE_CODES = new Set([401, 403, 411, 440, 500]);

export function connectionClosePolicy({
  code,
  closing = false,
  reconnectAttempts = 0
}) {
  if (closing) {
    return {
      reconnect: false,
      removeAuth: true,
      reason: "Disconnected by user"
    };
  }

  if (NON_RETRYABLE_CODES.has(code)) {
    return {
      reconnect: false,
      removeAuth: RESET_AUTH_CODES.has(code),
      reason:
        code === 401
          ? "WhatsApp removed this linked device. Generate a new QR code."
          : `Connection closed (${code})`
    };
  }

  const nextAttempt = reconnectAttempts + 1;
  if (nextAttempt > MAX_RECONNECT_ATTEMPTS) {
    return {
      reconnect: false,
      removeAuth: false,
      reason: `Could not restore the WhatsApp connection after ${MAX_RECONNECT_ATTEMPTS} attempts.`
    };
  }

  return {
    reconnect: true,
    removeAuth: false,
    nextAttempt,
    // 515 is the expected post-pair socket restart, so resume almost immediately.
    delayMs:
      code === 515
        ? 250
        : Math.min(10_000, 1_000 * 2 ** Math.max(0, nextAttempt - 1))
  };
}
