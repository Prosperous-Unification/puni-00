import { rejects, strictEqual } from 'node:assert/strict';

import { describe, test } from 'bun:test';

import { awaitCompletion } from './deadline';

describe('awaitCompletion', () => {
  test('retains abort rejection when the underlying held promise later resolves', async () => {
    const held = Promise.withResolvers<number>();
    const abort = new AbortController();
    const pending = awaitCompletion(held.promise, abort.signal);
    const cause = new Error('fixture deadline');
    abort.abort(cause);
    held.resolve(17);
    await rejects(pending, (failure: unknown) => failure === cause);
  });

  test('rejects before starting observation when already aborted', async () => {
    const cause = new Error('already fenced');
    await rejects(
      awaitCompletion(Promise.resolve(17), AbortSignal.abort(cause)),
      (failure: unknown) => failure === cause,
    );
  });

  test('returns work fulfillment and preserves work rejection', async () => {
    const abort = new AbortController();
    strictEqual(await awaitCompletion(Promise.resolve(17), abort.signal), 17);
    const cause = new Error('operation failed');
    await rejects(
      awaitCompletion(Promise.reject(cause), abort.signal),
      (failure: unknown) => failure === cause,
    );
  });

  test('observes late rejection after abort without changing the abort cause', async () => {
    const held = Promise.withResolvers<number>();
    const abort = new AbortController();
    const pending = awaitCompletion(held.promise, abort.signal);
    const cause = new Error('fixture deadline');
    abort.abort(cause);
    held.reject(new Error('late work failure'));
    await rejects(pending, (failure: unknown) => failure === cause);
    await Bun.sleep(0);
  });
});
