import { deepEqual, rejects } from 'node:assert/strict';
import { ok, strictEqual } from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import { Database } from 'bun:sqlite';
import { test } from 'bun:test';

import { organizationId } from '../record-codecs';
import { bootstrapSqliteStores, openSqliteStores } from '../sqlite/open-stores';
import { FixtureClock } from './fixtures';
import { createStoreDirectory } from './store-directory';

const owners = [
  {
    file: '../open-stores.test.ts',
    name: 'production SQLite selection reopens persisted ports and ownership',
    rawProbe: false,
  },
  {
    file: '../sqlite/open-stores.db.test.ts',
    name: 'bootstrap refuses existing bytes and open retains organization capacity lease and ownership',
    rawProbe: false,
  },
  {
    file: '../sqlite/signals-receipts.db.test.ts',
    name: 'probe current claim corruption against intact historical execution',
    rawProbe: true,
  },
  {
    file: '../sqlite/signal-integrity.db.test.ts',
    name: 'reopen rejects coherently reused historical wait key',
    rawProbe: true,
  },
];
const Receipt = type({
  directories: 'string[]',
  providerCloses: 'number.integer >= 0',
  probeCloses: 'number.integer >= 0',
});
for (const owner of owners)
  for (const mode of ['close', 'work', 'work-close'] as const)
    test('owned directory cleanup: ' + owner.file + ' / ' + mode, async () => {
      const scratch = mkdtempSync(join(tmpdir(), 'store-directory-probe-'));
      const receiptPath = join(scratch, 'receipt.json');
      const child = Bun.spawn(
        [
          process.execPath,
          'test',
          '--preload',
          new URL('./store-directory-probe.ts', import.meta.url).pathname,
          new URL(owner.file, import.meta.url).pathname,
          '-t',
          '^' + owner.name + '$',
          '--timeout',
          '10000',
        ],
        {
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            STORE_DIRECTORY_PROBE_RECEIPT: receiptPath,
            STORE_DIRECTORY_PROBE_MODE: mode,
          },
        },
      );
      const stdout = new Response(child.stdout).text();
      const stderr = new Response(child.stderr).text();
      let directories: readonly string[] = [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const exit = await Promise.race([
          child.exited,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              reject(new Error('store directory child exceeded its cleanup budget'));
            }, 20000);
          }),
        ]);
        const output = (await stdout) + (await stderr);
        strictEqual(
          exit,
          1,
          'STORE-DIRECTORY-I1-01: injected original work or native disposal failure must propagate',
        );
        const receipt = parseOrThrow(Receipt, JSON.parse(readFileSync(receiptPath, 'utf8')));
        directories = receipt.directories;
        ok(
          directories.length > 0,
          'STORE-DIRECTORY-I1-02: actual provider-owned storage must be observed',
        );
        ok(
          receipt.providerCloses >= 1,
          'STORE-DIRECTORY-I1-03: every real cleanup owner must attempt provider disposal even after earlier work failure',
        );
        for (const directory of directories)
          strictEqual(
            existsSync(directory),
            mode !== 'work',
            'STORE-DIRECTORY-I1-04: directory deletion must depend on successful awaited provider disposal',
          );
        if (mode !== 'close')
          ok(
            output.includes('I1 injected work failure'),
            'STORE-DIRECTORY-I1-05: cleanup must preserve the original work failure',
          );
        if (mode !== 'work')
          ok(
            output.includes('I1 injected native provider disposal failure'),
            'STORE-DIRECTORY-I1-06: cleanup must surface the original native disposal failure',
          );
        if (owner.rawProbe)
          ok(
            receipt.probeCloses >= 1,
            'STORE-DIRECTORY-I1-07: direct finally cleanup must still synchronously close its raw probe',
          );
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (child.exitCode === null) child.kill('SIGKILL');
        await child.exited;
        await stdout;
        await stderr;
        if (directories.length === 0 && existsSync(receiptPath))
          directories = parseOrThrow(
            Receipt,
            JSON.parse(readFileSync(receiptPath, 'utf8')),
          ).directories;
        for (const directory of directories) rmSync(directory, { recursive: true, force: true });
        rmSync(scratch, { recursive: true, force: true });
      }
    });

function originalFailures(cause: unknown): unknown[] {
  return cause instanceof AggregateError
    ? cause.errors.flatMap((failure: unknown) => originalFailures(failure))
    : [cause];
}
for (const fault of ['provider', 'probe'] as const)
  test(
    'directory owner preserves work and ' + fault + ' failure while closing every real provider',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'directory-owner-'));
      const options = {
        path: join(directory, 'runs.sqlite'),
        organizationId: organizationId('organization'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock: new FixtureClock(),
        maxBusyAttempts: 2,
        busyDelayMilliseconds: 1,
      };
      const first = await bootstrapSqliteStores(options);
      const second = await openSqliteStores(options);
      const probe = new Database(options.path);
      const owner = createStoreDirectory(directory, { recursive: true });
      owner.retainStore(first);
      owner.retainStore(second);
      owner.retainProbe(probe);
      const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'close');
      if (descriptor === undefined) throw new Error('native close descriptor absent');
      const nativeClose = descriptor.value as Database['close'];
      const connections: Database[] = [];
      let probeCloses = 0;
      const failure = new Error('injected directory ' + fault + ' disposal failure');
      const workFailure = new Error('injected directory work failure');
      Object.defineProperty(Database.prototype, 'close', {
        ...descriptor,
        value(this: Database) {
          if (this === probe) {
            probeCloses += 1;
            if (fault === 'probe') throw failure;
          } else {
            connections.push(this);
            if (fault === 'provider' && connections.length === 1) throw failure;
          }
          nativeClose.call(this);
        },
      });
      try {
        await rejects(
          owner.runTest(() => Promise.reject(workFailure)),
          (cause: unknown) => {
            deepEqual(
              originalFailures(cause),
              [workFailure, failure],
              'STORE-DIRECTORY-I1-08: directory cleanup must retain original work and disposal causes',
            );
            return true;
          },
        );
        strictEqual(
          connections.length,
          2,
          'STORE-DIRECTORY-I1-09: a disposal failure must not prevent attempted closure of every owned provider',
        );
        strictEqual(
          probeCloses,
          1,
          'STORE-DIRECTORY-I1-10: the owned raw probe must close synchronously exactly once',
        );
        strictEqual(
          existsSync(directory),
          true,
          'STORE-DIRECTORY-I1-11: any owned connection disposal failure must preserve storage',
        );
      } finally {
        Object.defineProperty(Database.prototype, 'close', descriptor);
        probe.close();
        for (const connection of connections) connection.close();
        await Promise.allSettled([first.close(), second.close()]);
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
