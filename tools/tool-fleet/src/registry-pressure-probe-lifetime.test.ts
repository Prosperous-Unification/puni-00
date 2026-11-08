import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';
import ts from 'typescript';

import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import { readRegistryBytes } from './registry-stream';

for (const fault of [
  'none',
  'signal-error',
  'group-live',
  'group-eperm',
  'group-unknown',
  'fulfilled-group-live',
] as const)
  test(`ACK launcher rescues live captured child after actual waiter exit-observation rejection ${fault}`, async () => {
    const [launcherSource, waiterSource] = await Promise.all([
      readFile(new URL('./registry-pressure-probe.fixture.ts', import.meta.url), 'utf8'),
      readFile(new URL('./registry-maintenance-process.ts', import.meta.url), 'utf8'),
    ]);
    const parsed = ts.createSourceFile('waiter.ts', waiterSource, ts.ScriptTarget.Latest, true);
    const waiter = parsed.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'awaitOwnedMaintenanceChild',
    );
    if (waiter === undefined) throw new Error('Actual owned waiter function missing');
    const transpile = (source: string) =>
      new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
    const failure = new Error('Owned exit observation rejected while still live');
    let live = true,
      waiterClosed = false,
      probes = 0;
    const signals: string[] = [];
    const cleanupFailure: unknown =
      fault === 'group-unknown'
        ? { code: 'EIO', private: 'not reflected' }
        : Object.assign(new Error('Owned cleanup observation failed'), { code: 'EPERM' });
    let clock = 0,
      sleeps = 0,
      rescued = false;
    const sleep = (milliseconds: number) => {
      expect(milliseconds).toBe(10);
      sleeps++;
      clock += 1000;
      if (sleeps === 6 && fault === 'group-live') {
        rescued = true;
        live = false;
      }
      return Promise.resolve();
    };
    const nativeProcess = {
      pid: 1,
      getuid: () => 0,
      kill(pid: number, signal: number | string) {
        expect(pid).toBe(-42);
        if (signal === 0) {
          probes++;
          if (fault === 'group-eperm' || fault === 'group-unknown') throw cleanupFailure;
          if (!live) throw Object.assign(new Error('Absent owned group'), { code: 'ESRCH' });
        } else {
          signals.push('group:' + String(signal));
          if (signal === 'SIGKILL' && fault !== 'fulfilled-group-live') live = false;
        }
      },
    };
    // Boundary: actual owned waiter code; FFI/process observations and the captured child capability are modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compileWaiter = new Function(
      'dlopen',
      'process',
      'Bun',
      'Date',
      transpile(waiter.getText(parsed)) + ';return awaitOwnedMaintenanceChild;',
    ) as (
      ...ports: unknown[]
    ) => (child: unknown, signal: AbortSignal, interrupt: boolean) => Promise<void>;
    const awaitOwned = compileWaiter(
      () => ({
        symbols: { getpgid: () => 42, waitpid: () => 0 },
        close: () => {
          waiterClosed = true;
        },
      }),
      nativeProcess,
      { sleep },
      { now: () => clock },
    );
    const bytes = (text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    const child = {
      pid: 42,
      exitCode: null,
      exited: fault === 'fulfilled-group-live' ? Promise.resolve(0) : Promise.reject(failure),
      stdout: bytes('{"allocation":"ENOSPC"}'),
      stderr: bytes(''),
      kill(signal: string): void {
        signals.push('child:' + signal);
        if (fault === 'signal-error') throw cleanupFailure;
        if (fault !== 'group-live') live = false;
      },
    };
    // Boundary: same extracted launcher, now coupled to the actual waiter rather than a canned waiter rejection.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compileLauncher = new Function(
      'process',
      'readFile',
      'verifyRegistryHostArtifact',
      'Bun',
      'awaitMaintenanceChild',
      'readRegistryBytes',
      'observeRegistryPopulationOutput',
      'Date',
      transpile(
        launcherSource
          .slice(launcherSource.indexOf('export async function runRegistryPressureAcknowledgement'))
          .replace('export ', ''),
      ) + ';return runRegistryPressureAcknowledgement;',
    ) as (...ports: unknown[]) => (installed: unknown, signal: AbortSignal) => Promise<unknown>;
    const run = compileLauncher(
      nativeProcess,
      () =>
        Promise.resolve(
          '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0',
        ),
      () => Promise.resolve(new Uint8Array()),
      { spawn: () => child, sleep },
      (owned: unknown, signal: AbortSignal) => awaitOwned(owned, signal, false),
      readRegistryBytes,
      observeRegistryPopulationOutput,
      { now: () => clock },
    );
    let refused: unknown;
    try {
      await run(
        {
          ordinary: { path: '/var/lib/puni-registry/registry/contents' },
          backupWorker: { sha256: 'a'.repeat(64) },
        },
        new AbortController().signal,
      );
    } catch (cause) {
      refused = cause;
    }
    expect(waiterClosed).toBe(true);
    expect(refused).toBeInstanceOf(AggregateError);
    const causes: unknown[] = [];
    const visit = (cause: unknown) => {
      causes.push(cause);
      if (cause instanceof AggregateError) for (const nested of cause.errors) visit(nested);
    };
    visit(refused);
    if (fault === 'fulfilled-group-live') {
      expect(signals).toEqual(['group:SIGKILL']);
      expect(live).toBe(true);
      expect(
        causes.some(
          (cause) =>
            cause instanceof Error &&
            cause.message === 'Maintenance descendant cleanup is unconfirmed',
        ),
      ).toBe(true);
      return;
    }
    expect(signals).toEqual(['child:SIGKILL']);
    expect(causes).toContain(failure);
    if (fault === 'none') {
      expect(live).toBe(false);
      expect(probes).toBeGreaterThan(0);
      return;
    }
    if (fault === 'group-live') expect(rescued).toBe(false);
    const uncertain = causes.find(
      (cause) =>
        cause instanceof AggregateError &&
        cause.message === 'Pressure ACK child failure and cleanup uncertainty',
    );
    expect(uncertain).toBeInstanceOf(AggregateError);
    expect((uncertain as AggregateError).errors[0]).toBe(failure);
    if (fault === 'group-live') {
      expect(live).toBe(true);
      expect(sleeps).toBe(5);
      expect((uncertain as AggregateError).errors[1]).toBeInstanceOf(Error);
    } else expect((uncertain as AggregateError).errors[1]).toBe(cleanupFailure);
  });
