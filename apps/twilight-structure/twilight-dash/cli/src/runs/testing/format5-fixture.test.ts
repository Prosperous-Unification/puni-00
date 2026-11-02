import { deepStrictEqual, rejects } from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createManifest, createRun, unwrapReply } from './fixtures';
import { verifyFormat5Source } from './format5-fixture';
import { bootstrapFormat5Stores, openFormat5Stores } from './format5-fixture';
import { inspectFormat5Provider } from './format5-provider';
import { extractPredecessorSource } from './predecessor-fixture';
test('format5 source verifier rejects an actually rewritten c12 archive', () => {
  const source = extractPredecessorSource({
    commit: 'c12bb0e58215de3ba0c3da98a2198773d654a29c',
    label: 'format5',
    sourceEntries: ['sqlite/format.ts'],
    workerFiles: [],
  });
  try {
    const path = join(
      source.directory,
      'apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/format.ts',
    );
    writeFileSync(path, readFileSync(path, 'utf8') + '\n// injected source fault\n');
    expect(() => verifyFormat5Source(source.directory)).toThrow('predecessor source differs');
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { decodeCurrentAttempt } from '../record-codecs';
import { createFormat5Fixture } from './format5-fixture';
import { decodeFormat5Payload } from './format5-protocol';
import { createStoreDirectory } from './store-directory';
test('genuine format5 worker owns c12 source through native exit and both pipe closures', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format5-genuine-'));
  const owner = createStoreDirectory(directory, { recursive: true });
  const fixture = await createFormat5Fixture(join(directory, 'runs.sqlite'));
  owner.retainStore(fixture);
  await owner.runTest(async () => {
    expect(fixture.sourceCommit).toBe('c12bb0e58215de3ba0c3da98a2198773d654a29c');
    expect(fixture.format.version).toBe(5);
    await fixture.populate('receipt_settled');
    expect(
      (await fixture.capture()).tables.some(
        (table) => table.name === 'run5_receipt' && table.rows.length === 1,
      ),
    ).toBe(true);
  });
  expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
  expect(fixture.worker.stdoutClosed).toBe(true);
  expect(fixture.worker.stderrClosed).toBe(true);
  expect(existsSync(fixture.sourceDirectory)).toBe(false);
}, 60000);

test('format5 admit replay protocol preserves actual historical Attempt3 without admitting future Attempt4', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format5-attempt3-'));
  const owner = createStoreDirectory(directory, { recursive: true });
  const fixture = owner.retainStore(await createFormat5Fixture(join(directory, 'runs.sqlite')));
  await owner.runTest(async () => {
    await fixture.populate('claim_recovery_nonaccepted');
    const capture = await fixture.capture();
    const table = capture.tables.find((entry) => entry.name === 'run5_attempt');
    if (table === undefined) throw Error('historical attempt table missing');
    const serialized = table.rows[0]?.[table.columns.indexOf('record')];
    if (typeof serialized !== 'string') throw Error('historical attempt record missing');
    const attempt = decodeCurrentAttempt(JSON.parse(serialized));
    expect(attempt.version).toBe(3);
    expect(
      decodeFormat5Payload({
        action: 'invoke',
        method: 'admitAttempt',
        value: { kind: 'duplicate', value: attempt },
      }),
    ).toMatchObject({ value: { value: attempt } });
    expect(() =>
      decodeFormat5Payload({
        action: 'invoke',
        method: 'admitAttempt',
        value: { kind: 'duplicate', value: { ...attempt, version: 4 } },
      }),
    ).toThrow();
  });
  expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
  expect(fixture.worker.stdoutClosed).toBe(true);
  expect(fixture.worker.stderrClosed).toBe(true);
}, 60000);

for (const method of [
  'beginRecovery',
  'stageRecoveryFence',
  'recordRecoveryFence',
  'resolveRecovery',
] as const)
  test(
    'genuine format5 ' + method + ' returns its complete correlated recovery witness',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'format5-recovery-wire-'));
      console.log('Task3 genuine5 native creation ' + JSON.stringify({ method, directory }));
      const owner = createStoreDirectory(directory, { recursive: true });
      const fixture = owner.retainStore(await createFormat5Fixture(join(directory, 'runs.sqlite')));
      console.log(
        'Task3 genuine5 source ' + JSON.stringify({ method, directory: fixture.sourceDirectory }),
      );
      await owner.runTest(async () => {
        const command = await fixture.prepareMutation(method);
        expect(command.method).toBe(method);
        const reply = await fixture.invoke(command);
        expect(reply.kind).toBe('applied');
        if (reply.kind !== 'applied') throw new Error('genuine recovery command refused');
        const duplicate = await fixture.invoke(command);
        expect(duplicate).toEqual({ ...reply, kind: 'duplicate' });
        const selected = requireRecoveryCommand(command);
        const call = selected.parameters[0];
        const recoveryId =
          selected.method === 'beginRecovery'
            ? selected.parameters[0].intent.recoveryId
            : selected.parameters[0].recoveryId;
        const history = await fixture.observeRecovery(call.guard.scope, recoveryId);
        if (history === null) throw Error('native recovery observation absent');
        const original =
          method === 'beginRecovery'
            ? history
            : method === 'stageRecoveryFence'
              ? history.fences.at(-1)
              : method === 'recordRecoveryFence'
                ? history.observations.at(-1)
                : history.closure;
        if (original === undefined || original === null)
          throw Error('native recovery witness absent');
        expect(reply.value).toEqual(original);
        const payload = { action: 'invoke' as const, method, value: reply };
        deepStrictEqual(decodeFormat5Payload(payload), payload);
        const malformed = {
          ...payload,
          value: { ...reply, value: { ...reply.value, version: 2 } },
        };
        expect(() => decodeFormat5Payload(malformed)).toThrow();
        const decoded = decodeFormat5Payload(payload);
        const retained = structuredClone(decoded);
        Object.assign(reply.value, { unexpectedNativeMutation: true });
        expect(decoded).toEqual(retained);
      });
      expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
      expect(fixture.worker.stdoutClosed).toBe(true);
      expect(fixture.worker.stderrClosed).toBe(true);
      console.log(
        'Task3 genuine5 native closure ' +
          JSON.stringify({
            method,
            exit: await fixture.worker.exited,
            stdoutClosed: fixture.worker.stdoutClosed,
            stderrClosed: fixture.worker.stderrClosed,
            dbDirectoryExists: existsSync(directory),
            sourceDirectoryExists: existsSync(fixture.sourceDirectory),
          }),
      );
    },
    60000,
  );

import { Database } from 'bun:sqlite';

import { organizationId } from '../record-codecs';
import { settleFixture } from './construct-fixture';
import { FixtureClock } from './fixtures';
import { openVerifiedFormat5Stores } from './format5-fixture';
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
  test(`format5 bridge ${fault} failure retains source after independent worker closure`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'format5-bridge-'));
    const path = join(directory, 'runs.sqlite');
    const fixture = await createFormat5Fixture(path);
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
        const stores = await openVerifiedFormat5Stores(fixture, {
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
      expect(String(failure)).toContain('format5 bridge');
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

test('format5 bridge positive native closure releases source and worker', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format5-bridge-'));
  const path = join(directory, 'runs.sqlite');
  const fixture = await createFormat5Fixture(path);
  const stores = await openVerifiedFormat5Stores(fixture, {
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

for (const scenario of [
  'missing owner',
  'finished owner',
  'shared source',
  'pending source',
] as const)
  test(
    'format5 provider process owns ' + scenario,
    async () => {
      const providerModule = new URL('./format5-provider.ts', import.meta.url).pathname;
      const program = `import {strict as assert} from 'node:assert';import {existsSync,rmSync} from 'node:fs';import {installFormat5Lifetime,retainFormat5Provider,inspectFormat5Provider,closeFormat5Lifetime} from ${JSON.stringify(providerModule)};
 const scenario=${JSON.stringify(scenario)};let first,second;let imported=false;let importStarted=false;let failure;const sentinel=new Error('pending native source owner');
 function contains(cause){return cause===sentinel||cause instanceof Error&&contains(cause.cause)||cause instanceof AggregateError&&cause.errors.some(contains);}
 try{
 if(scenario==='missing owner'||scenario==='finished owner'){
  if(scenario==='finished owner'){installFormat5Lifetime();await closeFormat5Lifetime();}
  assert.throws(()=>{first=retainFormat5Provider('forbidden owner');},/requires an active format5-lifetime-preload/);assert.equal(inspectFormat5Provider(),undefined);
 }else{
  installFormat5Lifetime();first=retainFormat5Provider('first owner');importStarted=true;const original=await first.load();imported=true;
  if(scenario==='shared source'){second=retainFormat5Provider('second owner');assert.equal(await second.load(),original);assert.equal(inspectFormat5Provider().moduleLoadCount,1);assert.equal(inspectFormat5Provider().leaseCount,2);first.release();assert.equal(inspectFormat5Provider().leaseCount,1);assert.equal(existsSync(first.directory),true);second.release();await closeFormat5Lifetime();assert.equal(existsSync(first.directory),false);assert.equal(inspectFormat5Provider().leaseCount,0);}
  else{first.retain(sentinel);await assert.rejects(closeFormat5Lifetime(),cause=>cause instanceof AggregateError&&contains(cause)&&String(cause).includes(first.directory));assert.equal(existsSync(first.directory),true);assert.equal(inspectFormat5Provider().leaseCount,1);}
 }
 }catch(cause){failure={cause};}finally{
  if(importStarted&&!imported){first.retain(failure?.cause);console.log(JSON.stringify({event:'format5-source-import-uncertain',path:first.directory,nativeClosure:'unavailable'}));}else{
  if(second!==undefined)second.release();if(first!==undefined)first.release();
  const archive=inspectFormat5Provider();if(archive!==undefined&&existsSync(archive.directory)){
   // No native store is opened by this program. A successful module import has already closed its reference databases.
   assert.equal(archive.leaseCount,0);rmSync(archive.directory,{recursive:true});assert.equal(existsSync(archive.directory),false);
  }
  }
 }
 console.log(JSON.stringify({event:'format5-source-owner-observed',scenario,imported,source:inspectFormat5Provider()}));if(failure!==undefined)throw failure.cause;`;
      const argv = [process.execPath, '-e', program];
      const started = performance.now();
      const child = Bun.spawn(argv, { stdout: 'pipe', stderr: 'pipe' });
      console.log(
        JSON.stringify({
          event: 'format5-source-owner-child',
          argv,
          cwd: process.cwd(),
          pid: child.pid,
          scenario,
        }),
      );
      const observed = await Promise.allSettled([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const [exit, output, errors] = observed;
      if (
        exit.status !== 'fulfilled' ||
        output.status !== 'fulfilled' ||
        errors.status !== 'fulfilled'
      )
        throw new AggregateError(
          observed.flatMap((completion) => {
            if (completion.status !== 'rejected') return [];
            const cause: unknown = completion.reason;
            return [cause];
          }),
          'source-owner child observations incomplete',
        );
      console.log(
        JSON.stringify({
          event: 'format5-source-owner-child-closed',
          scenario,
          exitCode: exit.value,
          signalCode: child.signalCode,
          durationMs: performance.now() - started,
          stdout: output.value,
          stderr: errors.value,
          stdoutEOF: true,
          stderrEOF: true,
        }),
      );
      expect(exit.value).toBe(0);
      expect(child.signalCode).toBeNull();
      expect(errors.value).toBe('');
      expect(output.value).toContain('format5-source-owner-observed');
    },
    60000,
  );

import { ownerId } from '../record-codecs';
import { upgradeSqliteWrites } from '../sqlite/migrate-writes';
import type { Format5Capture, Format5Command } from './format5-protocol';
import { decodeFormat5Command } from './format5-protocol';
import type { HistoricalRunStore } from './predecessor-fixture';
type HistoricalRecoveryCommand = Extract<
  Format5Command,
  { method: 'beginRecovery' | 'stageRecoveryFence' | 'recordRecoveryFence' | 'resolveRecovery' }
>;
function requireRecoveryCommand(command: Format5Command): HistoricalRecoveryCommand {
  switch (command.method) {
    case 'beginRecovery':
    case 'stageRecoveryFence':
    case 'recordRecoveryFence':
    case 'resolveRecovery':
      return command;
    default:
      throw Error('selected native recovery command absent');
  }
}
async function invokeNativeRecovery(runs: HistoricalRunStore, command: HistoricalRecoveryCommand) {
  switch (command.method) {
    case 'beginRecovery':
      return await runs.beginRecovery(command.parameters[0]);
    case 'stageRecoveryFence':
      return await runs.stageRecoveryFence(command.parameters[0]);
    case 'recordRecoveryFence':
      return await runs.recordRecoveryFence(command.parameters[0]);
    case 'resolveRecovery':
      return await runs.resolveRecovery(command.parameters[0]);
  }
}
function readRefusalClock(capture: Format5Capture) {
  const meta = capture.tables.find((table) => table.name === 'run_meta');
  if (meta === undefined) throw Error('native capture metadata absent');
  const index = meta.columns.indexOf('last_observed_at'),
    clock = meta.rows[0]?.[index];
  if (index < 0 || (typeof clock !== 'number' && typeof clock !== 'bigint'))
    throw Error('native refusal clock absent');
  const exact = Number(clock);
  if (!Number.isSafeInteger(exact)) throw Error('native refusal clock is unsafe');
  return exact;
}
function omitRefusalClock(capture: Format5Capture) {
  return {
    ...capture,
    tables: capture.tables.map((table) =>
      table.name === 'run_meta'
        ? {
            ...table,
            rows: table.rows.map((row) =>
              row.map((cell, index) => (table.columns[index] === 'last_observed_at' ? 0 : cell)),
            ),
          }
        : table,
    ),
  };
}
for (const method of [
  'beginRecovery',
  'stageRecoveryFence',
  'recordRecoveryFence',
  'resolveRecovery',
] as const)
  test(
    'genuine5 ' +
      method +
      ' bridge preserves native stale refusal after real upgrade with clock-only change',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'format5-refusal-order-'));
      const owner = createStoreDirectory(directory, { recursive: true });
      const fixture = await createFormat5Fixture(join(directory, 'runs.sqlite'));
      const clock = new FixtureClock();
      const options = {
        path: join(directory, 'runs.sqlite'),
        organizationId: organizationId('organization'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock,
        maxBusyAttempts: 20,
        busyDelayMilliseconds: 1,
      };
      const native = owner.retainStore(await openVerifiedFormat5Stores(fixture, options));
      await owner.runTest(async () => {
        const command = requireRecoveryCommand(await fixture.prepareMutation(method));
        const call = command.parameters[0];
        const stale = requireRecoveryCommand(
          decodeFormat5Command({
            ...command,
            parameters: [
              {
                ...call,
                guard: {
                  ...call.guard,
                  ownership: { ...call.guard.ownership, ownerId: ownerId('stale-reader') },
                },
              },
            ],
          }),
        );
        await upgradeSqliteWrites(options);
        clock.advance(10);
        await fixture.advanceClock(20);
        const before = await fixture.capture();
        const raw = await invokeNativeRecovery(native.runs, stale);
        const afterNative = await fixture.capture();
        const bridge = await fixture.invoke(stale).then(
          (value) => ({ kind: 'returned' as const, value }),
          (cause: unknown) => ({ kind: 'thrown' as const, cause }),
        );
        const afterBridge = await fixture.capture();
        console.log(
          JSON.stringify(
            {
              event: 'genuine5-stale-recovery-native-versus-bridge',
              method,
              raw,
              bridge:
                bridge.kind === 'returned'
                  ? bridge
                  : { kind: bridge.kind, cause: String(bridge.cause) },
              before,
              afterNative,
              afterBridge,
            },
            (_key, value: unknown) =>
              typeof value === 'bigint'
                ? { kind: 'sqlite_bigint', decimal: String(value) }
                : value instanceof Uint8Array
                  ? { kind: 'sqlite_blob', base64: Buffer.from(value).toString('base64') }
                  : value,
          ),
        );
        expect(raw).toEqual({ kind: 'refused', reason: 'owner_stale' });
        expect(omitRefusalClock(afterNative)).toEqual(omitRefusalClock(before));
        expect(readRefusalClock(afterNative)).toBe(1010);
        expect(omitRefusalClock(afterBridge)).toEqual(omitRefusalClock(before));
        expect(readRefusalClock(afterBridge)).toBe(1020);
        expect(bridge).toEqual({ kind: 'returned', value: raw });
        clock.advance(10);
        await rejects(invokeNativeRecovery(native.runs, command), /incompatible/);
        await rejects(fixture.invoke(command), /incompatible/);
        expect(await fixture.capture()).toEqual(afterBridge);
      });
      expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
      expect(fixture.worker.stdoutClosed && fixture.worker.stderrClosed).toBe(true);
    },
    60000,
  );

import { decodeFormat5Envelope, decodeFormat5Response } from './format5-protocol';
test('genuine5 native COMMIT reply survives migration and a separate observation error', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format5-observation-cut-'));
  const owner = createStoreDirectory(directory, { recursive: true });
  const path = join(directory, 'runs.sqlite');
  const fixture = owner.retainStore(await createFormat5Fixture(path));
  await owner.runTest(async () => {
    const command = requireRecoveryCommand(await fixture.prepareMutation('beginRecovery'));
    if (command.method !== 'beginRecovery') throw Error('native begin command absent');
    const scope = command.parameters[0].guard.scope,
      recoveryId = command.parameters[0].intent.recoveryId;
    expect(await fixture.observeRecovery(scope, recoveryId)).toBeNull();
    const native = await fixture.invoke(command);
    expect(native.kind).toBe('applied');
    const committed = structuredClone(native);
    const journal = await fixture.observeRecovery(scope, recoveryId);
    if (journal === null) throw Error('committed native journal absent');
    if (native.kind !== 'applied') throw Error('native begin refused');
    deepStrictEqual(journal, native.value);
    expect(await fixture.observeRecovery(scope, 'unrecorded')).toBeNull();
    const envelope = decodeFormat5Envelope({
      kind: 'reply',
      requestId: 'independent',
      payload: { action: 'observe_recovery', version: 2, value: journal },
    });
    if (envelope.kind !== 'reply') throw Error('native observation envelope absent');
    expect(
      decodeFormat5Response(envelope, { kind: 'observe_recovery', scope, recoveryId }),
    ).toMatchObject({ payload: { value: journal } });
    expect(() =>
      decodeFormat5Response(envelope, { kind: 'observe_recovery', scope, recoveryId: 'different' }),
    ).toThrow('observation target differs');
    expect(() =>
      decodeFormat5Response(envelope, {
        kind: 'observe_recovery',
        scope: { ...scope, personId: 'different' },
        recoveryId,
      }),
    ).toThrow('observation target differs');
    expect(() =>
      decodeFormat5Payload({ action: 'observe_recovery', version: 3, value: journal }),
    ).toThrow();
    expect(() =>
      decodeFormat5Payload({
        action: 'observe_recovery',
        version: 2,
        value: { ...journal, version: 2 },
      }),
    ).toThrow();
    const observedPayload = {
      action: 'observe_recovery',
      version: 2,
      value: structuredClone(journal),
    };
    const observed = decodeFormat5Payload(observedPayload);
    const detached = structuredClone(observed);
    Object.assign(observedPayload.value.intent, { recoveryId: 'caller-mutation' });
    expect(observed).toEqual(detached);
    const probe = owner.retainProbe(new Database(path));
    probe.run('UPDATE run5_recovery_format SET journal_count=journal_count+1');
    await rejects(fixture.observeRecovery(scope, recoveryId), /corrupt/);
    deepStrictEqual(native, committed);
    probe.run('UPDATE run5_recovery_format SET journal_count=journal_count-1');
    const before = await fixture.capture();
    await upgradeSqliteWrites({
      path,
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    });
    const upgraded = await fixture.capture();
    await rejects(fixture.observeRecovery(scope, recoveryId), /incompatible/);
    deepStrictEqual(native, committed);
    expect(await fixture.capture()).toEqual(upgraded);
    console.log(
      JSON.stringify(
        {
          event: 'genuine5-independent-observation-after-native-commit',
          native,
          committed,
          before,
          upgraded,
          observation: 'incompatible',
        },
        (_key, value: unknown) =>
          typeof value === 'bigint'
            ? { kind: 'sqlite_bigint', decimal: String(value) }
            : value instanceof Uint8Array
              ? { kind: 'sqlite_blob', base64: Buffer.from(value).toString('base64') }
              : value,
      ),
    );
  });
  expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
  expect(fixture.worker.stdoutClosed && fixture.worker.stderrClosed).toBe(true);
}, 60000);

test('genuine5 independent observation refuses unknown scope instead of journal absence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format5-observation-absence-'));
  const owner = createStoreDirectory(directory, { recursive: true });
  const fixture = owner.retainStore(await createFormat5Fixture(join(directory, 'runs.sqlite')));
  await owner.runTest(async () => {
    const command = requireRecoveryCommand(await fixture.prepareMutation('beginRecovery'));
    if (command.method !== 'beginRecovery') throw Error('native begin command absent');
    const scope = command.parameters[0].guard.scope;
    expect(await fixture.observeRecovery(scope, 'absent-journal')).toBeNull();
    const before = await fixture.capture();
    const observation = await fixture
      .observeRecovery({ ...scope, personId: 'unknown-person' }, 'absent-journal')
      .then(
        (value) => ({ kind: 'returned' as const, value }),
        (cause: unknown) => ({ kind: 'thrown' as const, cause }),
      );
    const after = await fixture.capture();
    console.log(
      JSON.stringify(
        {
          event: 'genuine5-unknown-observation-scope',
          observation:
            observation.kind === 'returned'
              ? observation
              : { kind: observation.kind, cause: String(observation.cause) },
          before,
          after,
        },
        (_key, value: unknown) =>
          typeof value === 'bigint'
            ? { kind: 'sqlite_bigint', decimal: String(value) }
            : value instanceof Uint8Array
              ? { kind: 'sqlite_blob', base64: Buffer.from(value).toString('base64') }
              : value,
      ),
    );
    expect(observation.kind).toBe('thrown');
    if (observation.kind !== 'thrown') throw Error('unknown scope was reported as journal absence');
    expect(String(observation.cause)).toContain('format5 observation scope unavailable');
    expect(after).toEqual(before);
  });
  expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
  expect(fixture.worker.stdoutClosed && fixture.worker.stderrClosed).toBe(true);
}, 60000);

test('genuine5 observation snapshots submitted scope before caller mutation and keeps worker orderly', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format5-scope-snapshot-'));
  console.log(
    JSON.stringify({
      event: 'genuine5-scope-snapshot-created',
      directory,
      path: join(directory, 'runs.sqlite'),
    }),
  );
  const owner = createStoreDirectory(directory, { recursive: true });
  const fixture = owner.retainStore(await createFormat5Fixture(join(directory, 'runs.sqlite')));
  try {
    await owner.runTest(async () => {
      const command = requireRecoveryCommand(await fixture.prepareMutation('beginRecovery'));
      if (command.method !== 'beginRecovery') throw Error('native begin command absent');
      const native = await fixture.invoke(command);
      if (native.kind !== 'applied') throw Error('native begin refused');
      const scope = command.parameters[0].guard.scope,
        recoveryId = command.parameters[0].intent.recoveryId;
      const journal = await fixture.observeRecovery(scope, recoveryId);
      if (journal === null) throw Error('committed native journal absent');
      deepStrictEqual(journal, native.value);
      const expected = structuredClone(journal);
      const submittedScope = { ...scope };
      const originalScope = { ...submittedScope };
      const pending = fixture.observeRecovery(submittedScope, recoveryId);
      submittedScope.personId = 'caller-mutated-person';
      const observed = await pending;
      deepStrictEqual(observed, expected);
      expect(submittedScope.personId).toBe('caller-mutated-person');
      deepStrictEqual(await fixture.observeRecovery(originalScope, recoveryId), expected);
      const capture = await fixture.capture();
      expect(
        capture.tables.some(
          (table) => table.name === 'run5_recovery_journal' && table.rows.length === 1,
        ),
      ).toBe(true);
      console.log(
        JSON.stringify({
          event: 'genuine5-scope-snapshot-returned',
          directory,
          originalScope,
          submittedScope,
          journal: observed,
        }),
      );
    });
  } finally {
    console.log(
      JSON.stringify({
        event: 'genuine5-scope-snapshot-closure',
        directory,
        sourceDirectory: fixture.sourceDirectory,
        terminal: await fixture.worker.exited,
        stdoutClosed: fixture.worker.stdoutClosed,
        stderrClosed: fixture.worker.stderrClosed,
        directoryExists: existsSync(directory),
        sourceExists: existsSync(fixture.sourceDirectory),
      }),
    );
  }
  expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
  expect(fixture.worker.stdoutClosed && fixture.worker.stderrClosed).toBe(true);
  expect(existsSync(directory)).toBe(false);
  expect(existsSync(fixture.sourceDirectory)).toBe(false);
}, 60000);

test('optioned genuine5 bridge preserves caller configuration clock and exact replay through reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format5-optioned-'));
  const owner = createStoreDirectory(directory, { recursive: true });
  const clock = new FixtureClock();
  clock.advance(37);
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('optioned-organization'),
    capacity: 3,
    leaseMilliseconds: 271,
    clock,
    maxBusyAttempts: 17,
    busyDelayMilliseconds: 2,
  };
  let isOpening = false;
  owner.retainStore({
    close(): Promise<void> {
      if (isOpening) {
        console.log(
          JSON.stringify({
            event: 'optioned-genuine5-construction-retained',
            directory,
            nativeClosure: 'unestablished',
          }),
        );
        return Promise.reject(
          new Error('optioned native construction closure unestablished: ' + directory),
        );
      }
      return Promise.resolve();
    },
  });
  await owner.runTest(async () => {
    isOpening = true;
    const stores = owner.retainStore(await bootstrapFormat5Stores(options));
    isOpening = false;
    const database = owner.retainProbe(new Database(options.path, { create: false }));
    expect(
      database
        .query('SELECT schema_version,capacity,lease_milliseconds,last_observed_at FROM run_meta')
        .get(),
    ).toEqual({ schema_version: 5, capacity: 3, lease_milliseconds: 271, last_observed_at: 1037 });
    expect(database.query("SELECT name FROM sqlite_schema WHERE name='run6_record'").all()).toEqual(
      [],
    );
    verifyFormat5Source(stores.sourceDirectory);
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('optioned-owner'), 0));
    expect(ownership.organizationId).toBe(organizationId('optioned-organization'));
    expect(ownership.expiresAt).toBe(1308);
    clock.advance(11);
    const renewed = unwrapReply(await stores.runs.renewOwnership(ownership));
    expect(renewed.expiresAt).toBe(1319);
    const manifest = createManifest();
    unwrapReply(await stores.runs.retainManifest(renewed, manifest));
    const run = createRun({ manifestDigest: manifest.digest });
    expect(await stores.runs.createRun(renewed, run)).toEqual({ kind: 'applied', value: run });
    const snapshot = await stores.runs.readRun(run.runId);
    expect(snapshot.version).toBe(3);
    const captureRows = () =>
      database
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'run_%' ORDER BY name",
        )
        .all()
        .map(({ name }) => ({
          name,
          rows: database
            .query('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
            .all()
            .map((row) => JSON.stringify(row))
            .sort(),
        }));
    const before = captureRows();
    expect(await stores.runs.createRun(renewed, run)).toEqual({ kind: 'duplicate', value: run });
    expect(captureRows()).toEqual(before);
    await stores.close();
    expect(inspectFormat5Provider()?.leaseCount).toBe(0);
    const reopening = { ...options };
    isOpening = true;
    const pending = openFormat5Stores(reopening);
    const unrequested = join(directory, 'unrequested.sqlite');
    Object.assign(reopening, {
      path: unrequested,
      organizationId: organizationId('changed-organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
    });
    const reopened = owner.retainStore(await pending);
    isOpening = false;
    expect(reopened.sourceDirectory).toBe(stores.sourceDirectory);
    expect(await reopened.runs.readRun(run.runId)).toEqual(snapshot);
    expect(await reopened.runs.createRun(renewed, run)).toEqual({ kind: 'duplicate', value: run });
    expect(captureRows()).toEqual(before);
    expect(existsSync(unrequested)).toBe(false);
    await reopened.close();
    await reopened.close();
    expect(inspectFormat5Provider()?.leaseCount).toBe(0);
    console.log(
      JSON.stringify({
        event: 'optioned-genuine5-closed',
        directory,
        source: stores.sourceDirectory,
        nativeVersion: 5,
        capacity: 3,
        leaseMilliseconds: 271,
        lastObservedAt: 1048,
      }),
    );
  });
  expect(existsSync(directory)).toBe(false);
});
