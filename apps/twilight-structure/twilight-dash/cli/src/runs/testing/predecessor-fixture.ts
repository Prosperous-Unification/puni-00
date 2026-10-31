import { execFileSync, spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { parseOrThrow, type } from '@shared/validation';

import type { RunStore } from '../run-store';
import type { SqliteFormatIdentity } from '../sqlite/format';
import {
  type decodeFormat3Envelope,
  type decodeFormat3Response,
  type Format3Capture,
  type Format3Command,
  type Format3Expected,
  type Format3Mutation,
  type Format3Payload,
  type Format3Population,
  type Format3Request,
} from './format3-protocol';
/** Verifies extracted predecessor provider, format and legacy codecs before the worker can create or open SQLite. */
export function verifyPredecessorSource(
  directory: string,
  commit: string,
  sourceEntries: readonly string[],
) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: import.meta.dirname,
    encoding: 'utf8',
  }).trim();
  const prefix = 'apps/twilight-structure/twilight-dash/cli/src/runs/';
  return sourceEntries.map((relative) => {
    const path = prefix + relative;
    const expected = new Bun.CryptoHasher('sha256')
      .update(execFileSync('git', ['show', commit + ':' + path], { cwd: root }))
      .digest('hex');
    const actual = new Bun.CryptoHasher('sha256')
      .update(readFileSync(join(directory, path)))
      .digest('hex');
    // Proof: T8S1 omitted this comparison; tampering only owned archived format.ts then passed provenance verification. Restoring the comparison rejects the changed bytes.
    if (actual !== expected) throw new Error('predecessor source differs: ' + path);
    return { path: relative, sha256: actual };
  });
}
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

/** Pins the archive and its wrapper-owned protocol decoder without selecting production behavior. */
export interface PredecessorSource {
  readonly commit: string;
  readonly label: 'format3' | 'format4';
  readonly identity: SqliteFormatIdentity;
  readonly sourceEntries: readonly string[];
  readonly workerFiles: readonly string[];
  readonly decodeEnvelope: typeof decodeFormat3Envelope;
  readonly decodeResponse: typeof decodeFormat3Response;
}
/** Owns an immutable git archive, pinned-module worker, bounded request IDs, drained pipes and final child cleanup. The worker is loaded before the caller can migrate its database. Terminal failures survive idle periods and are reported after cleanup, including on repeated close. Read-only worker metadata lets lifecycle tests await actual process termination without timing guesses. */
export async function createPredecessorFixture(
  source: PredecessorSource,
  path: string,
  mode: 'bootstrap' | 'open' = 'bootstrap',
) {
  const { commit, identity } = source;
  const workerPath =
    'apps/twilight-structure/twilight-dash/cli/src/runs/testing/' + source.label + '-worker.ts';
  const { directory, sourceFiles } = extractPredecessorSource(source);
  const child = spawn(
    process.execPath,
    [join(directory, workerPath), path, commit, mode, directory],
    {
      cwd: directory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined },
    },
  );
  let stderr = '';
  let isReady = false;
  let terminalFailure: { readonly cause: unknown } | undefined;
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const ready = Promise.withResolvers<undefined>();
  // close also settles failed process creation, which emits error without exit.
  const exited = Promise.withResolvers<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>();
  const pending = new Map<
    string,
    {
      resolve(value: Format3Payload): void;
      expected: Format3Expected;
      reject(cause: unknown): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const lines = createInterface({ input: child.stdout });
  function failWorker(cause: unknown) {
    terminalFailure ??= { cause };
    ready.reject(cause);
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(cause);
    }
    pending.clear();
  }
  const readyTimer = setTimeout(() => {
    failWorker(new Error(`${source.label} worker readiness timed out`));
    child.kill('SIGKILL');
  }, 30_000);
  child.on('error', failWorker);
  child.on('close', (code, signal) => {
    const failure = new Error(
      `${source.label} worker exited ${String(code)}/${String(signal)}: ${stderr}`,
    );
    if (!isReady || code !== 0 || signal !== null || pending.size !== 0) failWorker(failure);
    exited.resolve({ code, signal });
  });
  lines.on('line', (line) => {
    try {
      const response = source.decodeEnvelope(JSON.parse(line, reviveCell));
      if (response.kind === 'ready') {
        if (
          response.sourceCommit !== commit ||
          JSON.stringify(response.sourceFiles) !== JSON.stringify(sourceFiles) ||
          JSON.stringify(response.format) !== JSON.stringify(identity)
        )
          throw new Error(`${source.label} worker source or complete bundle differs`);
        clearTimeout(readyTimer);
        isReady = true;
        ready.resolve(undefined);
        return;
      }
      const request = pending.get(response.requestId);
      if (request === undefined) throw new Error(`unknown ${source.label} response request`);
      const decoded = source.decodeResponse(response, request.expected);
      clearTimeout(request.timer);
      pending.delete(response.requestId);
      if (decoded.kind === 'error')
        request.reject(
          // Proof: fix-round1 008 substituted the old producer label; the actual format4 arity refusal lost its correct outer context. Diagnostic-only; cause and refusal remained.
          new Error(`${source.label} worker request refused: ${JSON.stringify(decoded.error)}`, {
            cause: decoded.error,
          }),
        );
      else request.resolve(decoded.payload);
    } catch (cause) {
      failWorker(cause);
      child.kill('SIGKILL');
    }
  });
  let nextId = 0;
  let closing: Promise<void> | undefined;
  const sourceOwners = new Map<symbol, string>();
  function requestWorker(
    command:
      | Omit<Extract<Format3Request, { kind: 'populate' }>, 'requestId'>
      | ({ readonly kind: 'invoke' } & Format3Command)
      | Omit<Extract<Format3Request, { kind: 'retain_artifact' }>, 'requestId'>
      | Omit<Extract<Format3Request, { kind: 'advance_clock' }>, 'requestId'>
      | Omit<Extract<Format3Request, { kind: 'arm_busy' }>, 'requestId'>
      | { readonly kind: 'capture' | 'hold_write' | 'release_write' | 'arm_callback' | 'close' },
  ): Promise<Format3Payload> {
    nextId += 1;
    const requestId = String(nextId);
    const response = Promise.withResolvers<Format3Payload>();
    const timer = setTimeout(() => {
      failWorker(new Error(`${source.label} request ${requestId} timed out`));
      child.kill('SIGKILL');
    }, 30_000);
    pending.set(requestId, { ...response, timer, expected: command });
    child.stdin.write(JSON.stringify({ ...command, requestId }) + '\n', (cause) => {
      if (cause !== null && cause !== undefined) failWorker(cause);
    });
    return response.promise;
  }
  async function closeFixture(): Promise<void> {
    if (closing !== undefined) {
      await closing;
      return;
    }
    closing = (async () => {
      const failures: unknown[] = [];
      // Proof: T8C1 withheld callback release; real admitted old callback hit bounded close timeout, child exited and the error survived cleanup. Exact restoration passed.
      for (const name of ['release_callback', 'release_busy']) {
        try {
          writeFileSync(join(directory, name), 'cleanup');
        } catch (cause) {
          failures.push(cause);
        }
      }
      const timer = setTimeout(() => {
        failWorker(new Error(`${source.label} worker close timed out`));
        child.kill('SIGKILL');
      }, 5_000);
      try {
        if (child.exitCode === null && child.signalCode === null)
          await requestWorker({ kind: 'close' });
      } catch (cause) {
        failures.push(cause);
      }
      try {
        child.stdin.end();
      } catch (cause) {
        failures.push(cause);
      }
      await exited.promise;
      clearTimeout(timer);
      clearTimeout(readyTimer);
      for (const release of [
        () => {
          lines.close();
        },
        () => child.stdout.destroy(),
        () => child.stderr.destroy(),
        () => {
          // Proof: Task3 046 removed this guard; the actual failed archived import retained no source despite its pending owner.
          if (sourceOwners.size !== 0)
            throw new Error(
              `predecessor source retained: ${directory}; pending owners: ${[...sourceOwners.values()].join(', ')}`,
            );
          rmSync(directory, { recursive: true, force: true });
        },
      ]) {
        try {
          release();
        } catch (cause) {
          failures.push(cause);
        }
      }
      // Proof: T3FIX1 removed only this reporting dependency; actual idle BB14 SIGKILL followed by observed terminal event made close resolve after cleanup; exact restoration passed.
      if (terminalFailure !== undefined && !failures.includes(terminalFailure.cause))
        failures.unshift(terminalFailure.cause);
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(failures, `${source.label} worker cleanup failed`);
    })();
    await closing;
  }
  try {
    await ready.promise;
  } catch (cause) {
    child.kill('SIGKILL');
    // Caller construction owners may remove their store directory only because this actual worker exit precedes readiness rejection, including independent archive cleanup failure.
    await exited.promise;
    try {
      await closeFixture();
    } catch (cleanupCause) {
      if (cleanupCause !== cause)
        throw new AggregateError([cause, cleanupCause], 'old worker readiness and cleanup failed', {
          cause: cleanupCause,
        });
    }
    throw cause;
  }
  function eventCount(
    event: 'invoked' | 'attempt_entered' | 'busy' | 'busy_paused' | 'callback_entered',
  ): number {
    const path = join(directory, event);
    // Proof: T8H1 injected NaN into the real entered marker; unvalidated Number comparison falsely resolved the handshake. Strict restored parsing rejected it.
    return existsSync(path)
      ? parseOrThrow(type('number.integer > 0'), Number(readFileSync(path, 'utf8')))
      : 0;
  }
  return {
    eventCount,
    async waitForEvent(
      event: 'invoked' | 'attempt_entered' | 'busy' | 'busy_paused' | 'callback_entered',
      count = 1,
    ) {
      const deadline = Date.now() + 15000;
      while (eventCount(event) < count) {
        if (terminalFailure !== undefined) throw terminalFailure.cause;
        if (Date.now() >= deadline) throw new Error('old worker ' + event + ' timed out');
        await Bun.sleep(2);
      }
    },
    async armBusy(minimumInvoked: 1 | 2) {
      const payload = await requestWorker({ kind: 'arm_busy', minimumInvoked });
      if (payload.action !== 'arm_busy') throw new Error(`${source.label} internal action differs`);
      return payload.value;
    },
    releaseBusy() {
      writeFileSync(join(directory, 'release_busy'), 'released');
    },
    async armCallback() {
      const payload = await requestWorker({ kind: 'arm_callback' });
      if (payload.action !== 'arm_callback')
        throw new Error(`${source.label} internal action differs`);
      return payload.value;
    },
    releaseCallback() {
      writeFileSync(join(directory, 'release_callback'), 'released');
    },
    /** Retains source until this in-process owner positively establishes native closure. */
    retainSource(owner: string) {
      // Proof: Task3 047 removed this guard; a positively closed fixture admitted a late owner after deleting its archive.
      if (closing !== undefined) throw new Error('predecessor source is closing');
      const lease = Symbol(owner);
      sourceOwners.set(lease, owner);
      return () => {
        sourceOwners.delete(lease);
      };
    },
    sourceDirectory: directory,
    sourceCommit: commit,
    sourceFiles,
    format: identity,
    worker: Object.freeze({
      pid: child.pid,
      exited: exited.promise,
      get stdoutClosed() {
        return child.stdout.closed;
      },
      get stderrClosed() {
        return child.stderr.closed;
      },
    }),
    async populate(population: Format3Population) {
      const payload = await requestWorker({ kind: 'populate', population });
      if (payload.action !== 'populate') throw new Error(`${source.label} internal action differs`);
      return payload.value;
    },
    async capture(): Promise<Format3Capture> {
      const payload = await requestWorker({ kind: 'capture' });
      if (payload.action !== 'capture') throw new Error(`${source.label} internal action differs`);
      return payload.value;
    },
    async prepareMutation(method: Format3Mutation): Promise<Format3Command> {
      const payload = await requestWorker({
        kind: 'populate',
        population: 'receipt_settled',
        mutation: method,
      });
      if (payload.action !== 'prepare') throw new Error(`${source.label} internal action differs`);
      const { action: _action, ...command } = payload;
      return command;
    },
    async invoke(command: Format3Command) {
      const payload = await requestWorker({ ...command, kind: 'invoke' });
      if (payload.action !== 'invoke') throw new Error(`${source.label} internal action differs`);
      return payload.value;
    },
    async retainArtifact(bytes: Uint8Array, mediaType: string) {
      const payload = await requestWorker({
        kind: 'retain_artifact',
        base64: Buffer.from(bytes).toString('base64'),
        mediaType,
      });
      if (payload.action !== 'retain_artifact')
        throw new Error(`${source.label} internal action differs`);
      return payload.value;
    },
    async advanceClock(milliseconds: number) {
      const payload = await requestWorker({ kind: 'advance_clock', milliseconds });
      if (payload.action !== 'advance_clock')
        throw new Error(`${source.label} internal action differs`);
      return payload.value;
    },
    async holdWrite() {
      const payload = await requestWorker({ kind: 'hold_write' });
      if (payload.action !== 'hold_write')
        throw new Error(`${source.label} internal action differs`);
      return payload.value;
    },
    async releaseWrite() {
      const payload = await requestWorker({ kind: 'release_write' });
      if (payload.action !== 'release_write')
        throw new Error(`${source.label} internal action differs`);
      return payload.value;
    },
    async retainManifest(...parameters: Parameters<RunStore['retainManifest']>) {
      const payload = await requestWorker({ kind: 'invoke', method: 'retainManifest', parameters });
      if (payload.action !== 'invoke' || payload.method !== 'retainManifest')
        throw new Error(`${source.label} internal method differs`);
      return payload.value;
    },
    close: closeFixture,
  };
}

/** Extracts and verifies one explicitly pinned archive; its caller owns removal after every native or worker owner closes. */
export function extractPredecessorSource(
  source: Pick<PredecessorSource, 'commit' | 'label' | 'sourceEntries' | 'workerFiles'>,
) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: import.meta.dirname,
    encoding: 'utf8',
  }).trim();
  const directory = mkdtempSync(join(tmpdir(), source.label + '-source-'));
  let sourceFiles: ReturnType<typeof verifyPredecessorSource>;
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', source.commit], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
    });
    execFileSync('tar', ['-xf', '-', '-C', directory], { input: archive });
    sourceFiles = verifyPredecessorSource(directory, source.commit, source.sourceEntries);
    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
    for (const name of source.workerFiles) {
      const relative = 'apps/twilight-structure/twilight-dash/cli/src/runs/testing/' + name;
      copyFileSync(join(root, relative), join(directory, relative));
    }
  } catch (cause) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch (cleanupCause) {
      throw new AggregateError([cause, cleanupCause], 'old source extraction and cleanup failed', {
        cause: cleanupCause,
      });
    }
    throw cause;
  }
  return { directory, sourceFiles };
}
