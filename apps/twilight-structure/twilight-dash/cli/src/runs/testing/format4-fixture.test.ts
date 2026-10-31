import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { organizationId } from '../record-codecs';
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

for (const fault of ['import', 'open', 'close'] as const)
  test(`format4 bridge ${fault} failure retains source after independent worker closure`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'format4-bridge-'));
    const path = join(directory, 'runs.sqlite');
    const fixture = await createFormat4Fixture(path);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Restore the exact native function; fault wrappers invoke it with its original receiver.
    const nativeClose = Database.prototype.close;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Restore the exact native function; fault wrappers invoke it with its original receiver.
    const nativeQuery = Database.prototype.query;
    const sentinel = new Error(`owned native ${fault} failure`);
    let nativeClosed = 0;
    let faultedPath: string | undefined;
    let closingStore = false;
    let failure: unknown;
    try {
      Database.prototype.close = function (...parameters) {
        nativeClose.apply(this, parameters);
        nativeClosed += 1;
        if (fault === 'close' && closingStore) {
          faultedPath = this.filename;
          throw sentinel;
        }
      };
      if (fault !== 'close')
        // Test boundary: preserve the generic query port while forwarding every non-target query to its original receiver; only the positively owned store path faults after import.
        Database.prototype.query = function (this: Database, sql: string) {
          if (fault === 'import' || this.filename === path) {
            faultedPath = this.filename;
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
      expect(nativeClosed).toBeGreaterThan(0);
      expect(faultedPath).toBe(fault === 'import' ? ':memory:' : path);
      console.log(
        JSON.stringify({
          fault,
          terminal,
          nativeClosed,
          faultedPath,
          retained: fixture.sourceDirectory,
          failure: String(failure),
        }),
      );
    } finally {
      Database.prototype.close = nativeClose;
      Database.prototype.query = nativeQuery;
      // Closure is established separately from the expected opaque bridge failure: the injected close first returned from native close, and the worker's actual terminal event is awaited.
      await fixture.close().catch((cause: unknown) => {
        if (!String(cause).includes('source retained')) throw cause;
      });
      expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
      if (nativeClosed > 0) {
        rmSync(fixture.sourceDirectory, { recursive: true, force: true });
        rmSync(directory, { recursive: true, force: true });
      } else
        expect(nativeClosed, 'native closure unestablished; retained ' + directory).toBeGreaterThan(
          0,
        );
    }
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
