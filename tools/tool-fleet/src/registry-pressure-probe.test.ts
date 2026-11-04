import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import { readRegistryBytes } from './registry-stream';

for (const fault of [
  'none',
  'root',
  'pid1',
  'topology',
  'path',
  'artifact',
  'cancelled',
  'cancel-during-verify',
  'spawn',
  'wait',
  'stdout',
  'stderr',
  'oversized',
  'json',
  'cancel-active',
  'held-terminal',
  'stderr-bound',
  'cancel-stream',
  'wait-stream',
] as const)
  test(`fixed ACK launcher owns selected child and cancellation ${fault}`, async () => {
    const source = await readFile(
      new URL('./registry-pressure-probe.fixture.ts', import.meta.url),
      'utf8',
    );
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source
        .slice(source.indexOf('export async function runRegistryPressureAcknowledgement'))
        .replace('export ', '') + '\nreturn runRegistryPressureAcknowledgement;',
    );
    const selected = new AbortController();
    const failure = new Error('private selected failure');
    const effects: string[] = [];
    let receivedSignal: AbortSignal | undefined;
    let rescued = false;
    let rescue: ReturnType<typeof setTimeout> | undefined;
    const bytes = (text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    const streamFailure = new Error('private stream failure');
    let streamCancelled = false;
    let releaseTerminal: () => void = () => {
      throw new Error('Missing modeled terminal release');
    };
    const terminalGate = new Promise<void>((resolve) => {
      releaseTerminal = resolve;
    });
    const pendingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (fault === 'cancel-stream' || fault === 'wait-stream')
          rescue = setTimeout(() => {
            rescued = true;
            controller.close();
          }, 50);
        else controller.close();
      },
      cancel() {
        streamCancelled = true;
      },
    });
    const child = {
      pid: 42,
      exitCode: null,
      exited: Promise.resolve(0),
      stdout:
        fault === 'cancel-stream' || fault === 'wait-stream'
          ? pendingStream
          : fault === 'stdout'
            ? new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.error(streamFailure);
                },
              })
            : bytes(
                fault === 'oversized'
                  ? ' '.repeat(4097) + '{}'
                  : fault === 'json'
                    ? 'not-json'
                    : '{"allocation":"ENOSPC"}',
              ),
      stderr:
        fault === 'stderr-bound'
          ? bytes(' '.repeat(4097))
          : fault === 'stderr'
            ? bytes('private stderr')
            : bytes(''),
    };
    // Boundary: actual extracted fixed launcher with modeled spawn/artifact/waiter ports; real bounded stream reader and abort signals.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compile = new Function(
      'process',
      'readFile',
      'verifyRegistryHostArtifact',
      'Bun',
      'awaitMaintenanceChild',
      'readRegistryBytes',
      'observeRegistryPopulationOutput',
      body,
    ) as (...ports: unknown[]) => (installed: unknown, signal: AbortSignal) => Promise<unknown>;
    const run = compile(
      { pid: fault === 'pid1' ? 2 : 1, getuid: () => (fault === 'root' ? 1 : 0) },
      () =>
        Promise.resolve(
          fault === 'topology'
            ? 'foreign'
            : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0',
        ),
      (artifact: unknown) => {
        effects.push('verify');
        expect(artifact).toEqual({
          path: '/usr/local/libexec/puni-registry-maintenance/proof.js',
          sha256: 'a'.repeat(64),
        });
        if (fault === 'artifact') return Promise.reject(failure);
        if (fault === 'cancel-during-verify') selected.abort(failure);
        return Promise.resolve(new Uint8Array());
      },
      {
        spawn: (argv: unknown, options: unknown) => {
          effects.push('spawn');
          expect(argv).toEqual([
            '/usr/bin/setpriv',
            '--reuid=59001',
            '--regid=59001',
            '--clear-groups',
            '--',
            '/usr/local/libexec/puni-registry-authority/bun',
            '/usr/local/libexec/puni-registry-maintenance/proof.js',
            'pressure-ack',
          ]);
          expect(options).toEqual({
            detached: true,
            env: { PATH: '/usr/bin:/bin', LANG: 'C' },
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          if (fault === 'spawn') throw failure;
          return child;
        },
      },
      (actual: unknown, signal: AbortSignal) => {
        effects.push('wait');
        expect(actual).toBe(child);
        receivedSignal = signal;
        if (fault === 'held-terminal') return terminalGate;
        if (fault === 'wait' || fault === 'wait-stream') return Promise.reject(failure);
        if (
          fault === 'cancel-active' ||
          fault === 'stdout' ||
          fault === 'oversized' ||
          fault === 'stderr-bound'
        )
          return new Promise<void>((resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                effects.push('cancel');
                reject(signal.reason as Error);
              },
              { once: true },
            );
            rescue = setTimeout(() => {
              rescued = true;
              resolve();
            }, 50);
          });
        return Promise.resolve();
      },
      readRegistryBytes,
      observeRegistryPopulationOutput,
    );
    if (fault === 'cancelled') selected.abort(failure);
    const pending = run(
      {
        ordinary: {
          path: fault === 'path' ? '/foreign' : '/var/lib/puni-registry/registry/contents',
        },
        backupWorker: { sha256: 'a'.repeat(64) },
      },
      selected.signal,
    );
    if (fault === 'cancel-active' || fault === 'cancel-stream') {
      for (let count = 0; count < 20 && receivedSignal === undefined; count++)
        await new Promise((resolve) => setTimeout(resolve, 1));
      selected.abort(failure);
    }
    if (fault === 'held-terminal') {
      let completed = false;
      void pending.then(() => {
        completed = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const premature = completed;
      releaseTerminal();
      await pending;
      expect(premature).toBe(false);
      return;
    }
    let observation: unknown, refused: unknown;
    try {
      observation = await pending;
    } catch (cause) {
      refused = cause;
    } finally {
      clearTimeout(rescue);
    }
    if (fault === 'none') {
      expect(refused).toBeUndefined();
      expect(observation).toEqual({ allocation: 'ENOSPC' });
      expect(effects).toEqual(['verify', 'spawn', 'wait']);
      return;
    }
    expect(refused).toBeInstanceOf(Error);
    if (['root', 'pid1', 'topology', 'path', 'cancelled'].includes(fault)) {
      expect(effects).toEqual([]);
      return;
    }
    if (fault === 'artifact' || fault === 'cancel-during-verify') {
      expect(effects).toEqual(['verify']);
      expect(refused).toBe(failure);
      return;
    }
    if (fault === 'spawn') {
      expect(refused).toBe(failure);
      expect(effects).toEqual(['verify', 'spawn']);
      return;
    }
    const causes: unknown[] = [];
    const visit = (cause: unknown) => {
      causes.push(cause);
      if (cause instanceof AggregateError) for (const nested of cause.errors) visit(nested);
    };
    visit(refused);
    if (
      fault === 'wait' ||
      fault === 'cancel-active' ||
      fault === 'cancel-stream' ||
      fault === 'wait-stream'
    )
      expect(causes).toContain(failure);
    if (fault === 'stdout') expect(causes).toContain(streamFailure);
    if (['cancel-active', 'stdout', 'oversized', 'stderr-bound'].includes(fault)) {
      expect(rescued).toBe(false);
      expect(effects).toContain('cancel');
      expect(receivedSignal?.aborted).toBe(true);
    }
    if (fault === 'cancel-stream' || fault === 'wait-stream') {
      expect(rescued).toBe(false);
      expect(streamCancelled).toBe(true);
    }
    expect(effects.slice(0, 3)).toEqual(['verify', 'spawn', 'wait']);
  });
