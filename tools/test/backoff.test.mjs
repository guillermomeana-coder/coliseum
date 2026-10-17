import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay, retryWithBackoff, createBackoff } from '../lib/backoff.mjs';

test('backoffDelay: 1,2,4,8,16,30,30 seconds', () => {
  const seq = [0, 1, 2, 3, 4, 5, 6].map((a) => backoffDelay(a));
  assert.deepEqual(seq, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
});

test('backoffDelay: cap and custom options', () => {
  assert.equal(backoffDelay(100), 30000);
  assert.equal(backoffDelay(3, { baseMs: 10, maxMs: 50 }), 50);
  assert.equal(backoffDelay(2, { baseMs: 10, maxMs: 50 }), 40);
});

test('retryWithBackoff: succeeds on the 3rd try, onRetry called twice', async () => {
  const retries = [];
  const sleeps = [];
  const seen = [];
  const result = await retryWithBackoff(async (attempt) => {
    seen.push(attempt);
    if (attempt < 2) throw new Error(`fail ${attempt}`);
    return 'ok';
  }, {
    onRetry: (r) => retries.push(r),
    sleep: async (ms) => { sleeps.push(ms); },
  });
  assert.equal(result, 'ok');
  assert.deepEqual(seen, [0, 1, 2]);
  assert.deepEqual(retries.map((r) => r.delayMs), [1000, 2000]);
  assert.deepEqual(retries.map((r) => r.attempt), [0, 1]);
  assert.equal(retries[0].error.message, 'fail 0');
  assert.deepEqual(sleeps, [1000, 2000]);
});

test('retryWithBackoff: maxAttempts rethrows the last error', async () => {
  let calls = 0;
  let retried = 0;
  await assert.rejects(
    retryWithBackoff(async () => { throw new Error(`boom ${++calls}`); }, {
      maxAttempts: 3,
      onRetry: () => retried++,
      sleep: async () => {},
    }),
    { message: 'boom 3' },
  );
  assert.equal(calls, 3);
  assert.equal(retried, 2);
});

test('createBackoff: next() advances, reset() returns to 1000', () => {
  const b = createBackoff();
  assert.equal(b.attempt, 0);
  assert.deepEqual([b.next(), b.next(), b.next()], [1000, 2000, 4000]);
  assert.equal(b.attempt, 3);
  b.reset();
  assert.equal(b.attempt, 0);
  assert.equal(b.next(), 1000);
});
