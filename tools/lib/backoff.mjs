// Exponential backoff helpers (pure, no deps): 1s, 2s, 4s, 8s, 16s, then 30s at most.

/**
 * Delay before retry number `attempt` (0-based): baseMs * 2^attempt, capped at maxMs.
 * @param {number} attempt
 * @param {{baseMs?: number, maxMs?: number}} [opts]
 * @returns {number} milliseconds
 */
export function backoffDelay(attempt, { baseMs = 1000, maxMs = 30000 } = {}) {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call `fn(attempt)` until it resolves; on a throw wait backoffDelay() and try again.
 * After `maxAttempts` failures the last error is rethrown (onRetry is not called for it).
 * @template T
 * @param {(attempt: number) => T | Promise<T>} fn
 * @param {{maxAttempts?: number, baseMs?: number, maxMs?: number,
 *          onRetry?: (info: {attempt: number, delayMs: number, error: unknown}) => void,
 *          sleep?: (ms: number) => Promise<void>}} [opts]
 * @returns {Promise<T>}
 */
export async function retryWithBackoff(fn, { maxAttempts = Infinity, baseMs, maxMs, onRetry, sleep = defaultSleep } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt + 1 >= maxAttempts) throw error;
      const delayMs = backoffDelay(attempt, { baseMs, maxMs });
      if (onRetry) onRetry({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}

/**
 * Stateful backoff for reconnect loops. next() returns the current delay and advances;
 * reset() starts over (call it after a successful connection).
 * @param {{baseMs?: number, maxMs?: number}} [opts]
 * @returns {{next: () => number, reset: () => void, readonly attempt: number}}
 */
export function createBackoff(opts = {}) {
  let attempt = 0;
  return {
    next() { return backoffDelay(attempt++, opts); },
    reset() { attempt = 0; },
    get attempt() { return attempt; },
  };
}
