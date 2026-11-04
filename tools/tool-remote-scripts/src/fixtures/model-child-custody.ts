import { rm } from 'node:fs/promises';

import { expect } from 'bun:test';

import { readProductHostProc } from '../lib/product-host-proc';

export async function assertRealHostReader(): Promise<void> {
  const status = await readProductHostProc('/proc/self/status', 65536, performance.now() + 5000);
  expect(status).toMatch(/^NSpid:\s+\d+/m);
}

export interface ModelChild {
  readonly exit: number | null;
  readonly expired: boolean;
  readonly signal: NodeJS.Signals | null;
  readonly output: string;
  readonly settled: boolean;
  readonly failure: unknown;
}

export interface OwnedModelChild {
  readonly cancel: () => void;
  readonly completed: Promise<ModelChild>;
}

export class ModelPoolFailure extends Error {
  constructor(
    message: string,
    readonly settled: boolean,
    cause: unknown,
  ) {
    super(message, { cause });
  }
}

export type ModelProcess = Bun.Subprocess<'ignore', 'ignore', 'pipe'>;
export type ModelReader = ReadableStreamDefaultReader<Uint8Array>;
export type ModelChildProbe = (child: ModelProcess, reader: ModelReader) => Promise<void>;

async function removeModelFixture(directory: string, failures: readonly unknown[]): Promise<void> {
  try {
    await rm(directory, { recursive: true });
  } catch (cause) {
    if (failures.length > 0)
      throw new AggregateError([...failures, cause], 'model fixture refusal and cleanup failed', {
        cause,
      });
    throw cause;
  }
}

export async function withModelFixture<T>(directory: string, action: () => Promise<T>): Promise<T> {
  const cleanup = { retain: false };
  const failures: unknown[] = [];
  try {
    return await action();
  } catch (cause) {
    failures.push(cause);
    // Proof: removing retention deleted the real unread child's fixture; the shared-owner
    // control expected the directory to exist and observed false (2026-10-26).
    if (cause instanceof ModelPoolFailure && !cause.settled) cleanup.retain = true;
    throw cause;
  } finally {
    if (!cleanup.retain) await removeModelFixture(directory, failures);
  }
}

export function releaseModelReader(
  reader: ModelReader,
  failures: readonly unknown[],
  refuse: (cause: unknown) => void,
): void {
  try {
    reader.releaseLock();
  } catch (cause) {
    const failure =
      failures.length === 0
        ? cause
        : new AggregateError(
            [...failures, cause],
            'model stderr refusal and reader cleanup failed',
            { cause },
          );
    refuse(failure);
    throw failure;
  }
}

export function startModelChild(
  command: readonly string[],
  deadline: number,
  project: string,
  environment?: NodeJS.ProcessEnv,
  onFailure: (cause: unknown) => void = () => undefined,
  beforeDrain?: ModelChildProbe,
): OwnedModelChild {
  const child = Bun.spawn([...command], {
    cwd: project,
    // Proof: inherited FORCE_COLOR=1 made the actual child emit ANSI/checkmarks; the exact-name reporter control failed without this fixed child format.
    env: { ...(environment ?? process.env), FORCE_COLOR: '0' },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
    killSignal: 'SIGKILL',
  });
  const cancel = () => {
    child.kill('SIGKILL');
  };
  let failure: unknown = null;
  let expired = false;
  const refuse = (cause: unknown) => {
    if (failure === null) {
      failure = cause;
      onFailure(cause);
    }
    cancel();
  };
  // Proof: removing the SIGKILL watchdog let a late valid-looking child finish;
  // the focused owned-child timer negative failed its signal assertion.
  const timer = setTimeout(
    () => {
      expired = true;
      refuse(new Error('modeled product process child deadline expired'));
    },
    Math.max(0, deadline - performance.now()),
  );
  let output = '';
  const exit = child.exited.then(
    (code) => {
      if (code !== 0 || child.signalCode !== null)
        refuse(new Error('modeled product process child failed'));
      return code;
    },
    (cause: unknown) => {
      refuse(cause);
      throw cause;
    },
  );
  const drain = (async () => {
    let reader: ModelReader | undefined;
    const failures: unknown[] = [];
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      reader = child.stderr.getReader();
      // The control receives only original handles before the first read, not after an observed EOF.
      await beforeDrain?.(child, reader);
      for (;;) {
        const frame = await reader.read();
        if (frame.done) break;
        const remaining = Math.max(0, 65536 - bytes);
        bytes += frame.value.byteLength;
        output += decoder.decode(frame.value.subarray(0, remaining), { stream: true });
        // Proof: removing the byte-bound refusal accepted an actual 65537-byte child;
        // the owned-child output control failed with Missing expected rejection (2026-10-26).
        if (bytes > 65536 || output.length > 65536)
          refuse(new Error('modeled product process child output bound exceeded'));
        // Refusal cancels the exact child but keeps draining to EOF without retaining excess bytes.
      }
      output += decoder.decode();
    } catch (cause) {
      failures.push(cause);
      // Proof: omitting this refusal replaced the actual released-reader TypeError with
      // the later watchdog error; the shared-owner control failed its TypeError assertion.
      refuse(cause);
      throw cause;
    } finally {
      if (reader !== undefined)
        releaseModelReader(reader, failures, (cause) => {
          refuse(cause);
          failure = cause;
        });
    }
  })();
  const completed = (async (): Promise<ModelChild> => {
    // Proof: omitting this actual reader join let the external fixture observer run while
    // its pre-read continuation was held; the pool settlement control observed true instead of false.
    const terminal = await Promise.allSettled([exit, drain]);
    clearTimeout(timer);
    if (performance.now() >= deadline) {
      expired = true;
      refuse(new Error('modeled product process child deadline expired'));
    }
    const stopped = terminal[0];
    const drained = terminal[1];
    return {
      exit: stopped.status === 'fulfilled' ? stopped.value : null,
      expired,
      signal: child.signalCode,
      output,
      settled: stopped.status === 'fulfilled' && drained.status === 'fulfilled',
      failure,
    };
  })();
  return { cancel, completed };
}

export async function runModelChild(
  command: readonly string[],
  deadlineMs: number,
  project: string,
  environment?: NodeJS.ProcessEnv,
  probe?: ModelChildProbe,
): Promise<ModelChild> {
  const owned = startModelChild(
    command,
    performance.now() + deadlineMs,
    project,
    environment,
    undefined,
    probe,
  );
  const child = await owned.completed;
  if (!child.settled)
    throw new ModelPoolFailure(
      'modeled child exit or stderr settlement unproved',
      false,
      child.failure,
    );
  if (child.failure instanceof Error && child.failure.message.includes('output bound exceeded'))
    throw child.failure;
  return child;
}
