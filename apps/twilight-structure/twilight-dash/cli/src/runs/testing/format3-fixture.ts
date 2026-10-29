import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { parseOrThrow, type } from '@shared/validation';

import type { RunStore } from '../run-store';
import { FORMAT3_IDENTITY } from '../sqlite/format';

export type Format3Population =
  | 'queued'
  | 'prepared'
  | 'authority_pending'
  | 'authority_accepted'
  | 'claim_pending'
  | 'claim_accepted'
  | 'decision_consumed'
  | 'outbox_pending'
  | 'receipt_settled'
  | 'ownership_takeover';
export type Format3Request =
  | {
      readonly kind: 'populate';
      readonly requestId: string;
      readonly population: Format3Population;
    }
  | {
      readonly kind: 'invoke';
      readonly requestId: string;
      readonly method: 'retainManifest';
      readonly parameters: Parameters<RunStore['retainManifest']>;
    }
  | { readonly kind: 'capture' | 'close'; readonly requestId: string };
export type SqliteCaptureCell = null | string | number | bigint | Uint8Array;
export interface Format3Capture {
  readonly schema: readonly {
    readonly database: 'main' | 'temp';
    readonly type: string;
    readonly name: string;
    readonly table: string;
    readonly sql: string | null;
  }[];
  readonly tables: readonly {
    readonly name: string;
    readonly columns: readonly string[];
    readonly rows: readonly (readonly SqliteCaptureCell[])[];
  }[];
}
const commit = 'bb14bb1cf3afc0559e4d0864374e11c652751751';
const workerPath = 'apps/twilight-structure/twilight-dash/cli/src/runs/testing/format3-worker.ts';
const responseCodec = type({ kind: "'ready'", sourceCommit: 'string', format: 'unknown' })
  .or({ kind: "'reply'", requestId: 'string', value: 'unknown' })
  .or({ kind: "'error'", requestId: 'string', error: 'unknown' });
const cellCodec = type('null | string | number | bigint').or(type.instanceOf(Uint8Array));
const captureCodec = type({
  schema: type({
    database: "'main' | 'temp'",
    type: 'string',
    name: 'string',
    table: 'string',
    sql: 'string | null',
  }).array(),
  tables: type({ name: 'string', columns: 'string[]', rows: cellCodec.array().array() }).array(),
});
function reviveCell(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'kind' in value) {
    if (value.kind === 'sqlite_bigint')
      return BigInt(
        parseOrThrow(type({ kind: "'sqlite_bigint'", decimal: 'string' }), value).decimal,
      );
    if (value.kind === 'sqlite_blob')
      return new Uint8Array(
        Buffer.from(
          parseOrThrow(type({ kind: "'sqlite_blob'", base64: 'string' }), value).base64,
          'base64',
        ),
      );
  }
  return value;
}

/** Owns an immutable git archive, pinned-module worker, bounded request IDs, drained pipes and final child cleanup. The worker is loaded before the caller can migrate its database. */
export async function createFormat3Fixture(path: string) {
  const root = resolve('.');
  const directory = mkdtempSync(join(tmpdir(), 'format3-source-'));
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', commit], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
    });
    execFileSync('tar', ['-xf', '-', '-C', directory], { input: archive });
    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
    copyFileSync(join(root, workerPath), join(directory, workerPath));
  } catch (cause) {
    rmSync(directory, { recursive: true, force: true });
    throw cause;
  }
  const child = spawn(process.execPath, [join(directory, workerPath), path, commit], {
    cwd: directory,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined },
  });
  let stderr = '';
  let isReady = false;
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const ready = Promise.withResolvers<undefined>();
  // close also settles failed process creation, which emits error without exit.
  const exited = Promise.withResolvers<undefined>();
  const pending = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(cause: unknown): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const lines = createInterface({ input: child.stdout });
  function rejectRequests(cause: unknown) {
    ready.reject(cause);
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(cause);
    }
    pending.clear();
  }
  const readyTimer = setTimeout(() => {
    rejectRequests(new Error('format3 worker readiness timed out'));
    child.kill('SIGKILL');
  }, 30_000);
  child.on('error', rejectRequests);
  child.on('close', (code, signal) => {
    const failure = new Error(`format3 worker exited ${String(code)}/${String(signal)}: ${stderr}`);
    if (!isReady || code !== 0 || pending.size !== 0) rejectRequests(failure);
    exited.resolve(undefined);
  });
  lines.on('line', (line) => {
    try {
      const response = parseOrThrow(responseCodec, JSON.parse(line, reviveCell));
      if (response.kind === 'ready') {
        if (
          response.sourceCommit !== commit ||
          JSON.stringify(response.format) !== JSON.stringify(FORMAT3_IDENTITY)
        )
          throw new Error('format3 worker source or complete bundle differs');
        clearTimeout(readyTimer);
        isReady = true;
        ready.resolve(undefined);
        return;
      }
      const request = pending.get(response.requestId);
      if (request === undefined) throw new Error('unknown format3 response request');
      clearTimeout(request.timer);
      pending.delete(response.requestId);
      if (response.kind === 'error')
        request.reject(
          new Error(`format3 worker request refused: ${JSON.stringify(response.error)}`, {
            cause: response.error,
          }),
        );
      else request.resolve(response.value);
    } catch (cause) {
      rejectRequests(cause);
      child.kill('SIGKILL');
    }
  });
  let nextId = 0;
  let closing: Promise<void> | undefined;
  async function requestWorker(
    command:
      | Omit<Extract<Format3Request, { kind: 'populate' }>, 'requestId'>
      | Omit<Extract<Format3Request, { kind: 'invoke' }>, 'requestId'>
      | { readonly kind: 'capture' | 'close' },
  ): Promise<unknown> {
    nextId += 1;
    const requestId = String(nextId);
    const response = Promise.withResolvers<unknown>();
    const timer = setTimeout(() => {
      pending.delete(requestId);
      response.reject(new Error(`format3 request ${requestId} timed out`));
      child.kill('SIGKILL');
    }, 30_000);
    pending.set(requestId, { ...response, timer });
    child.stdin.write(JSON.stringify({ ...command, requestId }) + '\n', (cause) => {
      if (cause !== null && cause !== undefined) rejectRequests(cause);
    });
    return await response.promise;
  }
  async function closeFixture(): Promise<void> {
    if (closing !== undefined) {
      await closing;
      return;
    }
    closing = (async () => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
      try {
        if (child.exitCode === null && child.signalCode === null)
          await requestWorker({ kind: 'close' });
      } finally {
        child.stdin.end();
        await exited.promise;
        clearTimeout(timer);
        clearTimeout(readyTimer);
        lines.close();
        child.stdout.destroy();
        child.stderr.destroy();
        rmSync(directory, { recursive: true, force: true });
      }
    })();
    await closing;
  }
  try {
    await ready.promise;
  } catch (cause) {
    child.kill('SIGKILL');
    await exited.promise;
    clearTimeout(readyTimer);
    lines.close();
    rmSync(directory, { recursive: true, force: true });
    throw cause;
  }
  return {
    sourceCommit: commit,
    format: FORMAT3_IDENTITY,
    async populate(population: Format3Population) {
      return await requestWorker({ kind: 'populate', population });
    },
    async capture(): Promise<Format3Capture> {
      return parseOrThrow(captureCodec, await requestWorker({ kind: 'capture' }));
    },
    async retainManifest(...parameters: Parameters<RunStore['retainManifest']>) {
      return await requestWorker({ kind: 'invoke', method: 'retainManifest', parameters });
    },
    close: closeFixture,
  };
}
