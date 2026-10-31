import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { organizationId } from '../record-codecs';
import { settleFixture } from './construct-fixture';
import { FixtureClock } from './fixtures';
import { createFormat4Fixture, openVerifiedFormat4Stores } from './format4-fixture';

function containsCause(failure: unknown, expected: unknown): boolean {
  return (
    failure === expected ||
    (failure instanceof Error && containsCause(failure.cause, expected)) ||
    (failure instanceof AggregateError &&
      failure.errors.some((cause) => containsCause(cause, expected)))
  );
}
function containsMessage(failure: unknown, text: string): boolean {
  return (
    (failure instanceof Error &&
      (failure.message.includes(text) || containsMessage(failure.cause, text))) ||
    (failure instanceof AggregateError &&
      failure.errors.some((cause) => containsMessage(cause, text)))
  );
}

for (const fault of ['import', 'open', 'close', 'close-before'] as const)
  test(`format4 bridge ${fault} failure retains source after independent worker closure`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'format4-bridge-'));
    const path = join(directory, 'runs.sqlite');
    const fixture = await createFormat4Fixture(path);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Restore the exact native function; fault wrappers invoke it with its original receiver.
    const nativeClose = Database.prototype.close;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Restore the exact native function; fault wrappers invoke it with its original receiver.
    const nativeQuery = Database.prototype.query;
    const sentinel = new Error(`owned native ${fault} failure`);
    const connections = new Map<Database, { readonly path: string; closed: boolean }>();
    function observeConnection(connection: Database) {
      const existing = connections.get(connection);
      if (existing !== undefined) return existing;
      const observed = { path: connection.filename, closed: false };
      connections.set(connection, observed);
      return observed;
    }
    let isWorkerClosed = false;
    function removeClosedRoots(): 'removed' | 'retained' {
      const observed = [...connections.values()];
      const isImportAborted =
        fault === 'import' &&
        faultedPath === ':memory:' &&
        observed.every((connection) => connection.path !== path);
      // Proof: fix-round1 001 blocked the exact owned native close while two reference closes and an inspection close succeeded; the old aggregate gate deleted both roots while the owned connection still answered SELECT. Exact per-connection closure now retains both roots until its controlled native close fulfills.
      // Proof: fix-round1 005 injected a body assertion failure after the blocked close; cleanup still retained both roots with the exact connection queryable, then removed them only after controlled native closure.
      if (
        isWorkerClosed &&
        observed.length > 0 &&
        observed.every((connection) => connection.closed) &&
        (isImportAborted || observed.some((connection) => connection.path === path))
      ) {
        rmSync(fixture.sourceDirectory, { recursive: true, force: true });
        rmSync(directory, { recursive: true, force: true });
        return 'removed';
      }
      console.log(
        JSON.stringify({
          event: 'native-closure-unestablished',
          retainedSource: fixture.sourceDirectory,
          retainedStore: directory,
          isWorkerClosed,
          connections: observed,
        }),
      );
      return 'retained';
    }
    let blockedConnection: Database | undefined;
    let faultedPath: string | undefined;
    let closingStore = false;
    let failure: unknown;
    await settleFixture(async () => {
      Database.prototype.close = function (...parameters) {
        const observed = observeConnection(this);
        if (fault === 'close-before' && closingStore && observed.path === path) {
          faultedPath = observed.path;
          // eslint-disable-next-line @typescript-eslint/no-this-alias -- This fault retains the exact native receiver for a physical closure witness and controlled cleanup.
          blockedConnection = this;
          throw sentinel;
        }
        nativeClose.apply(this, parameters);
        observed.closed = true;
        if (fault === 'close' && closingStore && observed.path === path) {
          faultedPath = observed.path;
          throw sentinel;
        }
      };
      // Test boundary: preserve the generic query port and exact native receiver; observe each connection before the selected import/open fault.
      Database.prototype.query = function (this: Database, sql: string) {
        const observed = observeConnection(this);
        if (fault === 'import' || (fault === 'open' && observed.path === path)) {
          faultedPath = observed.path;
          throw sentinel;
        }
        return nativeQuery.call(this, sql);
      } as typeof nativeQuery;
      try {
        const stores = await openVerifiedFormat4Stores(fixture, {
          path,
          organizationId: organizationId('organization'),
          capacity: 1,
          leaseMilliseconds: 100,
          clock: new FixtureClock(),
          maxBusyAttempts: 10,
          busyDelayMilliseconds: 1,
        });
        closingStore = true;
        await stores.close();
      } catch (cause) {
        failure = cause;
      } finally {
        Database.prototype.close = nativeClose;
        Database.prototype.query = nativeQuery;
      }
      const terminal = await Promise.race([
        fixture.worker.exited,
        Bun.sleep(1000).then(() => 'worker still running'),
      ]);
      expect(terminal).toEqual({ code: 0, signal: null });
      expect(existsSync(fixture.sourceDirectory)).toBe(true);
      expect(fixture.worker.stdoutClosed).toBe(true);
      expect(fixture.worker.stderrClosed).toBe(true);
      expect(containsCause(failure, sentinel)).toBe(true);
      expect(containsMessage(failure, fixture.sourceDirectory)).toBe(true);
      expect(String(failure)).toContain('format4 bridge');
      expect(failure).toBeInstanceOf(AggregateError);
      expect(faultedPath).toBe(fault === 'import' ? ':memory:' : path);
      if (fault === 'close-before') {
        expect(
          [...connections.values()].filter(
            (connection) => connection.path === ':memory:' && connection.closed,
          ).length,
        ).toBeGreaterThan(0);
        expect(
          [...connections.values()].filter(
            (connection) => connection.path === path && !connection.closed,
          ),
        ).toHaveLength(1);
      }
      console.log(
        JSON.stringify({
          fault,
          terminal,
          connections: [...connections.values()],
          faultedPath,
          retained: fixture.sourceDirectory,
          failure: String(failure),
        }),
      );
    }, [
      () => {
        Database.prototype.close = nativeClose;
        Database.prototype.query = nativeQuery;
      },
      async () => {
        await fixture.close().catch((cause: unknown) => {
          if (!String(cause).includes('source retained')) throw cause;
        });
      },
      async () => {
        expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
        isWorkerClosed = fixture.worker.stdoutClosed && fixture.worker.stderrClosed;
        expect(isWorkerClosed).toBe(true);
      },
      () => {
        const disposition = removeClosedRoots();
        try {
          if (fault === 'close-before') {
            if (blockedConnection === undefined)
              throw new Error('owned native fault was not reached');
            expect(blockedConnection.query('SELECT 1 AS open').get()).toEqual({ open: 1 });
            console.log(
              JSON.stringify({
                event: 'owned-native-retention',
                path,
                source: fixture.sourceDirectory,
                connections: [...connections.values()],
                sourceExists: existsSync(fixture.sourceDirectory),
                storeExists: existsSync(directory),
                exactConnectionStillOpen: true,
              }),
            );
            expect(disposition).toBe('retained');
            expect(existsSync(fixture.sourceDirectory)).toBe(true);
            expect(existsSync(directory)).toBe(true);
          } else expect(disposition).toBe('removed');
        } finally {
          if (blockedConnection !== undefined) {
            nativeClose.call(blockedConnection);
            observeConnection(blockedConnection).closed = true;
            console.log(
              JSON.stringify({ event: 'owned-native-controlled-close', path, closed: true }),
            );
            expect(removeClosedRoots()).toBe('removed');
          }
        }
      },
    ]);
  });

test('format4 bridge positive native closure releases source and worker', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format4-bridge-'));
  const path = join(directory, 'runs.sqlite');
  const fixture = await createFormat4Fixture(path);
  const stores = await openVerifiedFormat4Stores(fixture, {
    path,
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 10,
    busyDelayMilliseconds: 1,
  });
  try {
    await stores.close();
    expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
    expect(existsSync(fixture.sourceDirectory)).toBe(false);
    expect(fixture.worker.stdoutClosed).toBe(true);
    expect(fixture.worker.stderrClosed).toBe(true);
    expect(() => fixture.retainSource('late owner')).toThrow('source is closing');
    await stores.close();
  } finally {
    await stores.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
