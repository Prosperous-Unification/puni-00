import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';
import ts from 'typescript';

import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import { readRegistryBytes } from './registry-stream';

for (const fault of [
  'terminal',
  'empty',
  'zero-diagnostics',
  'rejected-exit',
  'group-live',
  'group-eperm',
  'selected-abort',
  'oversized',
  'malformed',
  'duplicate',
  'reporter',
] as const)
  test('ACK child failure retains bounded observation ' + fault, async () => {
    const [launcherSource, waiterSource] = await Promise.all([
      readFile(new URL('./registry-pressure-probe.fixture.ts', import.meta.url), 'utf8'),
      readFile(new URL('./registry-maintenance-process.ts', import.meta.url), 'utf8'),
    ]);
    const parsed = ts.createSourceFile('waiter.ts', waiterSource, ts.ScriptTarget.Latest, true);
    const waiter = parsed.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'awaitOwnedMaintenanceChild',
    );
    if (waiter === undefined) throw new Error('Missing actual owned waiter');
    const failure = new Error('private exit observation');
    const denied = Object.assign(new Error('private group observation'), { code: 'EPERM' });
    const reporter = new Error('private reporter');
    const selected = new AbortController();
    let clock = 0;
    let groupLive = fault === 'rejected-exit' || fault === 'group-live';
    const signals: string[] = [];
    const nativeProcess = {
      pid: 1,
      getuid: () => 0,
      kill: (_pid: number, signal: number | string) => {
        if (signal === 0) {
          if (fault === 'group-eperm') throw denied;
          if (!groupLive) throw Object.assign(new Error('absent'), { code: 'ESRCH' });
          return;
        }
        signals.push('group:' + String(signal));
      },
    };
    const transpile = (source: string) =>
      new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
    // Boundary: actual waiter body; only FFI, owned child, clock and group observations are modeled.
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
      () => ({ symbols: { getpgid: () => 42, waitpid: () => 0 }, close: () => undefined }),
      nativeProcess,
      {
        sleep: () => {
          clock += 1000;
          return Promise.resolve();
        },
      },
      { now: () => clock },
    );
    const marker =
      'task8-population-diagnostic:' +
      JSON.stringify({
        stage: 'retained',
        upstream503: false,
        readonlyAckMissing: false,
        liveFenceUnconfirmed: false,
        truncated: false,
        frames: [{ file: 'fixture-bundle', line: 17, column: 3 }],
        framesTruncated: false,
        partial: null,
      });
    const serialized =
      fault === 'empty'
        ? ''
        : fault === 'oversized'
          ? 'private-overbound '.repeat(300)
          : fault === 'malformed'
            ? 'task8-population-diagnostic:{private-token}\n'
            : (fault === 'duplicate' ? marker + '\n' : '') +
              marker +
              '\nNative host fixture operation failed\n';
    let cancelled = false;
    let delivered = false;
    let release: () => void = () => {
      throw new Error('Missing stderr release');
    };
    const stderr = new ReadableStream<Uint8Array>({
      start(controller) {
        release = () => {
          if (cancelled) return;
          delivered = true;
          controller.enqueue(new TextEncoder().encode(serialized));
          controller.close();
        };
      },
      cancel() {
        cancelled = true;
      },
    });
    const stdout = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{}'));
        controller.close();
      },
    });
    const child = {
      pid: 42,
      exitCode: fault === 'rejected-exit' ? null : fault === 'zero-diagnostics' ? 0 : 1,
      exited:
        fault === 'rejected-exit'
          ? Promise.reject(failure)
          : Promise.resolve(fault === 'zero-diagnostics' ? 0 : 1),
      stdout,
      stderr,
      kill(signal: string) {
        signals.push('child:' + signal);
        groupLive = false;
      },
    };
    let terminalFailure: unknown;
    const reports: unknown[] = [];
    // Boundary: actual launcher+waiter+bounded reader+redactor, with modeled admission/spawn and controlled real streams.
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
      'console',
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
      { spawn: () => child, sleep: () => Promise.resolve() },
      (owned: unknown, signal: AbortSignal) =>
        awaitOwned(owned, signal, false).catch((cause: unknown) => {
          terminalFailure = cause;
          throw cause;
        }),
      readRegistryBytes,
      observeRegistryPopulationOutput,
      { now: () => clock },
      {
        log(line: string) {
          if (fault === 'reporter') throw reporter;
          const observation: unknown = JSON.parse(line);
          reports.push(observation);
        },
      },
    );
    let rescued = false;
    const rescue = setTimeout(() => {
      rescued = true;
      selected.abort(new Error('independent stream rescue'));
    }, 100);
    const releaseTimer = setTimeout(release, 10);
    const abortTimer =
      fault === 'selected-abort'
        ? setTimeout(() => {
            selected.abort(failure);
          }, 2)
        : undefined;
    let refused: unknown;
    try {
      await run(
        {
          ordinary: { path: '/var/lib/puni-registry/registry/contents' },
          backupWorker: { sha256: 'a'.repeat(64) },
        },
        selected.signal,
      );
    } catch (cause) {
      refused = cause;
    } finally {
      clearTimeout(rescue);
      clearTimeout(releaseTimer);
      clearTimeout(abortTimer);
    }
    expect(refused).toBeInstanceOf(Error);
    expect(rescued).toBe(false);
    const causes: unknown[] = [];
    const visit = (cause: unknown) => {
      causes.push(cause);
      if (cause instanceof AggregateError) for (const nested of cause.errors) visit(nested);
    };
    visit(refused);
    if (fault !== 'zero-diagnostics') expect(causes).toContain(terminalFailure);
    expect(JSON.stringify(reports)).not.toContain('private');
    if (fault === 'reporter') {
      expect(causes).toContain(reporter);
      expect((refused as Error).cause).toBeInstanceOf(AggregateError);
      return;
    }
    const unavailable = [
      'rejected-exit',
      'group-live',
      'group-eperm',
      'selected-abort',
      'oversized',
    ].includes(fault);
    if (unavailable) {
      if (fault !== 'oversized') expect(delivered).toBe(false);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({
        pressureAckChildFailure: { stderr: { state: 'unavailable' } },
      });
      if (fault === 'rejected-exit') expect(signals).toContain('child:SIGKILL');
      if (fault === 'group-eperm') expect(causes).toContain(denied);
    } else {
      expect(delivered).toBe(true);
      expect(cancelled).toBe(false);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({
        pressureAckChildFailure: {
          terminal: { state: 'exited', code: fault === 'zero-diagnostics' ? 0 : 1 },
          stderr: {
            state: 'observed',
            observation: {
              bounded: true,
              diagnostic:
                fault === 'empty'
                  ? 'absent'
                  : fault === 'malformed'
                    ? 'invalid'
                    : fault === 'duplicate'
                      ? 'duplicate'
                      : 'valid',
            },
          },
        },
      });
      if (fault === 'terminal')
        expect(reports[0]).toMatchObject({
          pressureAckChildFailure: {
            stderr: {
              observation: {
                failure: { frames: [{ file: 'fixture-bundle', line: 17, column: 3 }] },
              },
            },
          },
        });
    }
  });
