import { deepEqual, ok, rejects, strictEqual } from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { test } from 'bun:test';

import { manifestDigest, organizationId, ownerId } from '../record-codecs';
import { closeFixtures } from '../testing/close-fixtures';
import { FixtureClock } from '../testing/fixtures';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';
import { createSqliteRunStore, isBusy, RunStoreContentionError } from './run-store';
import { configureDatabase } from './schema';

async function createLifecycleFixture(maxBusyAttempts = 100) {
  const directory = mkdtempSync(join(tmpdir(), 'store-lifecycle-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts,
    busyDelayMilliseconds: 5,
  };
  await (await bootstrapSqliteStores(options)).close();
  const database = new Database(options.path, { create: false, strict: true });
  configureDatabase(database);
  const stores = createSqliteRunStore(database, options);
  const blocker = new Database(options.path, { create: false, strict: true });
  const busy = Promise.withResolvers<undefined>();
  const originalRun = database.run.bind(database);
  const originalClose = database.close.bind(database);
  let nativeCloses = 0;
  let nativeReleased = false;
  let blockerReleased = false;
  let failure: Error | undefined;
  let cleanup: Promise<void> | undefined;
  Object.defineProperty(database, 'run', {
    configurable: true,
    value(...parameters: Parameters<Database['run']>) {
      try {
        return originalRun.apply(database, parameters);
      } catch (cause) {
        if (parameters[0] === 'BEGIN IMMEDIATE' && isBusy(cause)) busy.resolve(undefined);
        throw cause;
      }
    },
  });
  Object.defineProperty(database, 'close', {
    configurable: true,
    value() {
      nativeCloses += 1;
      if (failure !== undefined) throw failure;
      originalClose.call(database);
      nativeReleased = true;
    },
  });
  return {
    directory,
    options,
    database,
    blocker,
    stores,
    busy: busy.promise,
    nativeCloses: () => nativeCloses,
    unlock() {
      if (!blockerReleased && blocker.inTransaction) blocker.run('ROLLBACK');
    },
    failClose(cause: Error) {
      failure = cause;
    },
    close(): Promise<void> {
      if (cleanup !== undefined) return cleanup;
      cleanup = (async () => {
        // Proof: L5 removed this await from the actual deleting fixture; held-writer cleanup failed SQLITE-LIFECYCLE-14 on premature directory deletion. Exact restoration passed.
        await stores.close();
        blocker.close();
        blockerReleased = true;
        rmSync(directory, { recursive: true });
      })();
      return cleanup;
    },
    // Test-only fault recovery: restore native methods and release deliberately retained resources.
    release() {
      if (!blockerReleased) {
        if (blocker.inTransaction) blocker.run('ROLLBACK');
        blocker.close();
        blockerReleased = true;
      }
      Object.defineProperty(database, 'run', { configurable: true, value: originalRun });
      Object.defineProperty(database, 'close', { configurable: true, value: originalClose });
      if (!nativeReleased) originalClose.call(database);
      if (existsSync(directory)) rmSync(directory, { recursive: true });
    },
  };
}

/** Observes rejection immediately while retaining the original promises for later lifecycle assertions and settlement. */
function trackPending(pending: Promise<unknown>[], ...completions: Promise<unknown>[]): void {
  void Promise.allSettled(completions);
  pending.push(...completions);
}

async function waitForBusy(busy: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      busy,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('real SQLite BUSY was not observed'));
        }, 1000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

for (const outcome of ['release', 'exhaust'] as const)
  test(
    'close drains admitted real SQLite writer and rejects queued calls: ' + outcome,
    async () => {
      const fixture = await createLifecycleFixture(outcome === 'release' ? 100 : 3);
      const pending: Promise<unknown>[] = [];
      try {
        fixture.blocker.run('BEGIN IMMEDIATE');
        const active = fixture.stores.runs.acquireOwnership(ownerId('active'), 0);
        trackPending(pending, active);
        // Attach the rejection observer before allowing the contention budget to expire.
        const activeCheck =
          outcome === 'exhaust'
            ? rejects(
                active,
                (cause: unknown) => cause instanceof RunStoreContentionError,
                'SQLITE-LIFECYCLE-01: admitted operation must preserve the bounded SQLite contention failure',
              )
            : active.then((reply) => {
                strictEqual(
                  reply.kind,
                  'applied',
                  'SQLITE-LIFECYCLE-02: already admitted operation must finish successfully when its lock is released',
                );
              });
        trackPending(pending, activeCheck);
        await waitForBusy(fixture.busy);
        const queued = fixture.stores.runs.acquireOwnership(ownerId('queued'), 0);
        const queuedCheck = rejects(
          queued,
          /run store is closed/,
          'SQLITE-LIFECYCLE-03: queued-before-close operation must reject at the unchanged transaction fence',
        );
        trackPending(pending, queuedCheck);
        const closing = fixture.stores.close();
        ok(
          closing instanceof Promise,
          'SQLITE-LIFECYCLE-04: close must return observable Promise completion',
        );
        const repeated = fixture.stores.close();
        ok(
          repeated instanceof Promise,
          'SQLITE-LIFECYCLE-05: close must return observable Promise completion',
        );
        trackPending(pending, repeated);
        let repeatedFinished = false;
        const observedRepeated = repeated.then(() => {
          repeatedFinished = true;
        });
        trackPending(pending, observedRepeated);
        let finished = false;
        const observed = closing.then(() => {
          finished = true;
        });
        trackPending(pending, observed);
        const lateRun = rejects(
          fixture.stores.runs.acquireOwnership(ownerId('late'), 0),
          /run store is closed/,
          'SQLITE-LIFECYCLE-06: operation invoked after close must reject through the existing lifecycle fence',
        );
        const lateArtifact = rejects(
          fixture.stores.artifacts.retainArtifact(new Uint8Array([9]), 'test/bytes'),
          /run store is closed/,
          'SQLITE-LIFECYCLE-07: operation invoked after close must reject through the existing lifecycle fence',
        );
        trackPending(pending, lateRun, lateArtifact);
        await Bun.sleep(1);
        strictEqual(
          finished,
          false,
          'SQLITE-LIFECYCLE-08: cleanup completion must stay pending while the real writer remains blocked',
        );
        strictEqual(
          repeatedFinished,
          false,
          'SQLITE-LIFECYCLE-09: repeated close must stay pending while admitted work is blocked',
        );
        strictEqual(
          fixture.nativeCloses(),
          0,
          'SQLITE-LIFECYCLE-10: native disposal must not run before admitted work drains',
        );
        if (outcome === 'release') fixture.blocker.run('ROLLBACK');
        await activeCheck;
        await queuedCheck;
        await lateRun;
        await lateArtifact;
        await observed;
        await observedRepeated;
        await fixture.stores.close();
        strictEqual(
          fixture.nativeCloses(),
          1,
          'SQLITE-LIFECYCLE-11: native disposal must run exactly once even across repeated or failed cleanup',
        );
        fixture.unlock();
        const reopened = await openSqliteStores(fixture.options);
        try {
          strictEqual(
            reopened.ownership.owner?.ownerId,
            outcome === 'release' ? ownerId('active') : undefined,
            'SQLITE-LIFECYCLE-12: reopened ownership must reflect only the admitted operation outcome',
          );
          deepEqual(
            fixture.blocker.query('SELECT * FROM run_artifact').all(),
            [],
            'SQLITE-LIFECYCLE-13: rejected late artifact operation must publish no rows',
          );
        } finally {
          await reopened.close();
        }
      } finally {
        fixture.unlock();
        await Promise.allSettled(pending);
        fixture.release();
      }
    },
  );

test('fixture cleanup waits for real drain before deleting storage', async () => {
  const fixture = await createLifecycleFixture();
  const pending: Promise<unknown>[] = [];
  try {
    fixture.blocker.run('BEGIN IMMEDIATE');
    const active = fixture.stores.runs.acquireOwnership(ownerId('active'), 0);
    trackPending(pending, active);
    await waitForBusy(fixture.busy);
    const closing = fixture.close();
    trackPending(pending, closing);
    const repeated = fixture.close();
    trackPending(pending, repeated);
    await Bun.sleep(1);
    strictEqual(
      existsSync(fixture.directory),
      true,
      'SQLITE-LIFECYCLE-14: fixture storage must remain while close is pending or has failed',
    );
    strictEqual(
      fixture.nativeCloses(),
      0,
      'SQLITE-LIFECYCLE-15: native disposal must not run before admitted work drains',
    );
    fixture.blocker.run('ROLLBACK');
    strictEqual(
      (await active).kind,
      'applied',
      'SQLITE-LIFECYCLE-16: already admitted operation must finish successfully when its lock is released',
    );
    await closing;
    await repeated;
    strictEqual(
      existsSync(fixture.directory),
      false,
      'SQLITE-LIFECYCLE-17: fixture storage must be deleted only after successful close',
    );
    strictEqual(
      fixture.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-18: native disposal must run exactly once even across repeated or failed cleanup',
    );
  } finally {
    fixture.unlock();
    await Promise.allSettled(pending);
    fixture.release();
  }
});

test('native close failure stays fenced and cannot delete fixture storage or retry', async () => {
  const fixture = await createLifecycleFixture();
  const failure = new Error('injected native close failure');
  try {
    fixture.failClose(failure);
    const closing = fixture.close();
    await rejects(
      closing,
      (cause: unknown) => cause === failure,
      'SQLITE-LIFECYCLE-19: close must reject with the original native disposal cause',
    );
    await rejects(
      fixture.close(),
      (cause: unknown) => cause === failure,
      'SQLITE-LIFECYCLE-20: close must reject with the original native disposal cause',
    );
    const bundleClosing = fixture.stores.close();
    await rejects(
      bundleClosing,
      (cause: unknown) => cause === failure,
      'SQLITE-LIFECYCLE-21: close must reject with the original native disposal cause',
    );
    await rejects(
      fixture.stores.runs.acquireOwnership(ownerId('late'), 0),
      /closed/,
      'SQLITE-LIFECYCLE-22: operation invoked after close must reject through the existing lifecycle fence',
    );
    await rejects(
      fixture.stores.runs.readManifest(manifestDigest('a'.repeat(64))),
      /closed/,
      'SQLITE-LIFECYCLE-23: operation invoked after close must reject through the existing lifecycle fence',
    );
    await rejects(
      fixture.stores.artifacts.retainArtifact(new Uint8Array([9]), 'test/bytes'),
      /closed/,
      'SQLITE-LIFECYCLE-24: operation invoked after close must reject through the existing lifecycle fence',
    );
    strictEqual(
      fixture.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-25: native disposal must run exactly once even across repeated or failed cleanup',
    );
    strictEqual(
      existsSync(fixture.directory),
      true,
      'SQLITE-LIFECYCLE-26: fixture storage must remain while close is pending or has failed',
    );
  } finally {
    fixture.release();
  }
});

test('shared fixture cleanup awaits real drain and reports native failures after closing peers', async () => {
  const delayed = await createLifecycleFixture();
  const failing = await createLifecycleFixture();
  const failure = new Error('injected peer native close failure');
  const pending: Promise<unknown>[] = [];
  try {
    delayed.blocker.run('BEGIN IMMEDIATE');
    const active = delayed.stores.runs.acquireOwnership(ownerId('active'), 0);
    trackPending(pending, active);
    await waitForBusy(delayed.busy);
    failing.failClose(failure);
    let finished = false;
    const closing = closeFixtures([failing, delayed]);
    const observed = closing.then(
      () => {
        finished = true;
      },
      () => {
        finished = true;
      },
    );
    trackPending(pending, closing, observed);
    const checked = rejects(
      closing,
      (cause: unknown) => {
        ok(
          cause instanceof AggregateError,
          'SQLITE-LIFECYCLE-28: shared cleanup must reject with an aggregate after all peers settle',
        );
        deepEqual(
          cause.errors,
          [failure],
          'SQLITE-LIFECYCLE-29: aggregate cleanup failure must preserve every original cause in fixture order',
        );
        return true;
      },
      'SQLITE-LIFECYCLE-27: shared cleanup must report all original failures after attempting every peer',
    ).then(() => {
      finished = true;
    });
    trackPending(pending, checked);
    await Bun.sleep(1);
    strictEqual(
      finished,
      false,
      'SQLITE-LIFECYCLE-30: cleanup completion must stay pending while the real writer remains blocked',
    );
    strictEqual(
      existsSync(delayed.directory),
      true,
      'SQLITE-LIFECYCLE-31: fixture storage must remain while close is pending or has failed',
    );
    delayed.blocker.run('ROLLBACK');
    strictEqual(
      (await active).kind,
      'applied',
      'SQLITE-LIFECYCLE-32: already admitted operation must finish successfully when its lock is released',
    );
    await checked;
    strictEqual(
      existsSync(delayed.directory),
      false,
      'SQLITE-LIFECYCLE-33: fixture storage must be deleted only after successful close',
    );
    strictEqual(
      existsSync(failing.directory),
      true,
      'SQLITE-LIFECYCLE-34: fixture storage must remain while close is pending or has failed',
    );
    strictEqual(
      failing.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-35: native disposal must run exactly once even across repeated or failed cleanup',
    );
  } finally {
    delayed.unlock();
    await Promise.allSettled(pending);
    delayed.release();
    failing.release();
  }
});

test('shared fixture cleanup attempts every peer after synchronous close throws', async () => {
  const peer = await createLifecycleFixture();
  const failing = await createLifecycleFixture();
  const synchronousFailure = new Error('injected synchronous fixture close failure');
  const nativeFailure = new Error('injected peer native close failure');
  const synchronous = {
    close(): Promise<void> {
      throw synchronousFailure;
    },
  };
  try {
    failing.failClose(nativeFailure);
    await rejects(
      closeFixtures([synchronous, peer, failing]),
      (cause: unknown) => {
        ok(
          cause instanceof AggregateError,
          'SQLITE-LIFECYCLE-37: shared cleanup must reject with an aggregate after all peers settle',
        );
        deepEqual(
          cause.errors,
          [synchronousFailure, nativeFailure],
          'SQLITE-LIFECYCLE-38: aggregate cleanup failure must preserve every original cause in fixture order',
        );
        return true;
      },
      'SQLITE-LIFECYCLE-36: shared cleanup must report all original failures after attempting every peer',
    );
    strictEqual(
      peer.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-39: native disposal must run exactly once even across repeated or failed cleanup',
    );
    strictEqual(
      failing.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-40: native disposal must run exactly once even across repeated or failed cleanup',
    );
    strictEqual(
      existsSync(peer.directory),
      false,
      'SQLITE-LIFECYCLE-41: fixture storage must be deleted only after successful close',
    );
    strictEqual(
      existsSync(failing.directory),
      true,
      'SQLITE-LIFECYCLE-42: fixture storage must remain while close is pending or has failed',
    );
  } finally {
    peer.release();
    failing.release();
  }
});
