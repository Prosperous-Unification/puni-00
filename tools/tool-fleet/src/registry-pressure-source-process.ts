import type { RegistryStatusReply } from './registry-pressure-source-contract';

export const statusTimeout = Object.freeze({
  state: 'unavailable',
  reason: 'source-timeout',
  code: 'deadline',
}) satisfies RegistryStatusReply;

const stdoutOverflow = Object.freeze({
  state: 'invalid-status',
  code: 'status-too-large',
}) satisfies RegistryStatusReply;

const stderrOverflow = Object.freeze({
  state: 'unavailable',
  reason: 'source-command-failed',
  code: 'stderr-too-large',
}) satisfies RegistryStatusReply;

export const deadlineReached = Symbol('registry status deadline');
const cancelled = Symbol('registry status cancelled');
const exchangeFailed = Symbol('registry status exchange failed');

export type CleanupOutcome = Exclude<RegistryStatusReply, { readonly state: 'received' }>;

interface CleanupFailure {
  readonly state: 'cleanup-failed';
  readonly outcome: CleanupOutcome | undefined;
  readonly settled: Promise<boolean>;
}

type Cutoff =
  typeof cancelled | typeof statusTimeout | typeof stdoutOverflow | typeof stderrOverflow;

/** Reserves the final second of the original caller budget for owned cleanup. */
export function acquisitionCutoff(deadline: number): number {
  // Proof: Removing the reserve broke the original deadline and reap test.
  return deadline - 1000;
}

export function registryStatusCancelled(): DOMException {
  return new DOMException('registry status read cancelled', 'AbortError');
}

/** Bounds an await without changing its underlying work or granting a new deadline. */
export async function waitUntil<Value>(
  work: Promise<Value>,
  deadline: number,
): Promise<Value | typeof deadlineReached> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const lapse = new Promise<typeof deadlineReached>((resolve) => {
      timer = setTimeout(
        () => {
          resolve(deadlineReached);
        },
        Math.max(0, deadline - performance.now()),
      );
    });
    return await Promise.race([
      // Proof: Trusting timer delivery alone accepted the late EOF/exit callbacks.
      work.then((value) => (performance.now() >= deadline ? deadlineReached : value)),
      lapse,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function isAbsent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ESRCH';
}

type Pipe = ReadableStreamDefaultReader<Uint8Array>;

/** Copies only admitted bytes, discarding the first overflowing chunk and all diagnostics. */
async function collectPipe(
  pipe: Pipe,
  maximum: number,
  overflow: () => void,
): Promise<Uint8Array | undefined> {
  const bytes = new Uint8Array(maximum);
  let offset = 0;
  for (;;) {
    const chunk = await pipe.read();
    if (chunk.done) return bytes.subarray(0, offset);
    // Proof: Widening or shrinking either cap broke its overflow or exact-limit fixture.
    if (offset + chunk.value.byteLength > maximum) {
      overflow();
      return undefined;
    }
    // Proof: Skipping the copy broke the binary frame fixture.
    bytes.set(chunk.value, offset);
    offset += chunk.value.byteLength;
  }
}

/** Owns a pipe starting at the getter, so partial setup failures enter child cleanup. */
function supervisePipe(
  open: () => ReadableStream<Uint8Array>,
  maximum: number,
  overflow: () => void,
) {
  let pipe: ReadableStream<Uint8Array> | undefined;
  let reader: Pipe | undefined;
  const drained = (async () => {
    pipe = open();
    reader = pipe.getReader();
    return collectPipe(reader, maximum, overflow);
  })();
  return {
    drained,
    async close(isAbnormal: boolean): Promise<void> {
      if (reader === undefined) {
        // Proof: Treating a failed pipe getter as settled broke the partial setup ownership test.
        if (pipe === undefined) throw new Error('registry status SSH pipe setup failed');
        await pipe.cancel();
        return;
      }
      try {
        // Proof: Skipping cancellation broke the held-reader cutoff test.
        if (isAbnormal) await reader.cancel();
      } finally {
        reader.releaseLock();
      }
    },
  };
}

function terminateGroup(pid: number): boolean {
  try {
    // Proof: Targeting a PID broke the process-group assertion. Ignoring or always accepting signal failures broke the ESRCH and EPERM tests.
    process.kill(-pid, 'SIGKILL');
    return true;
  } catch (cause) {
    return isAbsent(cause);
  }
}

function replyForExit(code: number, bytes: Uint8Array): RegistryStatusReply {
  // Proof: Widening exit zero, dropping 77 or aliasing 255 broke the corresponding prefix tests.
  if (code === 0) return { state: 'received', bytes };
  if (code === 77) return { state: 'unavailable', reason: 'source-refused', code: 'refused' };
  return { state: 'unavailable', reason: 'source-command-failed', code: 'ssh-exit' };
}

/** Starts the already admitted SSH command and supervises its two pipes and actual child exit. */
export async function readRegistryStatusProcess(
  argv: readonly string[],
  signal: AbortSignal,
  deadline: number,
): Promise<RegistryStatusReply | CleanupFailure> {
  const cutoff = acquisitionCutoff(deadline);
  const stop = Promise.withResolvers<Cutoff>();
  let interruption: Cutoff | undefined;
  function interrupt(outcome: Cutoff): void {
    if (interruption !== undefined) return;
    interruption = performance.now() < cutoff ? outcome : statusTimeout;
    stop.resolve(interruption);
  }
  const onAbort = () => {
    // Proof: Replacing the active abort with timeout broke the busy read and reaping test.
    interrupt(cancelled);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    // Proof: Dropping either pre-spawn check broke the slow preflight or abort handoff test.
    if (performance.now() >= cutoff) return statusTimeout;
    if (signal.aborted) throw registryStatusCancelled();

    let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
    try {
      // Proof: Truncating argv or changing any spawn setting broke the intercepted fixed policy test.
      child = Bun.spawn([...argv], {
        cwd: '/',
        env: { LANG: 'C', LC_ALL: 'C' },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        detached: true,
      });
    } catch {
      throw new Error('registry status SSH spawn failed');
    }

    // Proof: Delaying stderr until stdout drained broke the mutually gated pipe test.
    const stdout = supervisePipe(
      () => child.stdout,
      65537,
      () => {
        interrupt(stdoutOverflow);
      },
    );
    const stderr = supervisePipe(
      () => child.stderr,
      4096,
      () => {
        interrupt(stderrOverflow);
      },
    );
    const exited = (async () => child.exited)();
    // Proof: Dropping either EOF or exit settlement broke its independent completion test.
    const exchange = Promise.all([stdout.drained, stderr.drained, exited]).then(
      ([bytes, diagnostics, code]) => ({ bytes, diagnostics, code }),
      () => exchangeFailed,
    );
    const observed = await waitUntil(Promise.race([stop.promise, exchange]), cutoff);
    // Proof: Replacing a recorded interruption with timeout broke the delayed abort test.
    const completed = observed === deadlineReached ? (interruption ?? statusTimeout) : observed;
    let outcome: RegistryStatusReply | undefined;
    let isComplete = false;
    if (typeof completed === 'object' && 'bytes' in completed) {
      if (completed.bytes !== undefined && completed.diagnostics !== undefined) {
        isComplete = true;
        outcome = replyForExit(completed.code, completed.bytes);
      }
    } else if (typeof completed === 'object') {
      outcome = completed;
    }

    const isTerminated = isComplete || terminateGroup(child.pid);
    // Proof: Omitting child or reader settlement, or ignoring a reader error, broke its cleanup test.
    const settled = Promise.allSettled([
      exited,
      stdout.close(!isComplete),
      stderr.close(!isComplete),
      stdout.drained,
      stderr.drained,
    ]).then(
      ([exit, stdoutClose, stderrClose]) =>
        isTerminated &&
        exit.status === 'fulfilled' &&
        stdoutClose.status === 'fulfilled' &&
        stderrClose.status === 'fulfilled',
    );
    // Proof: Granting extra cleanup time broke the known overflow original-deadline test.
    const cleanup = await waitUntil(settled, deadline);
    if (cleanup !== true) {
      // Proof: Leaking received bytes or losing deadline or exit refusal broke the three cleanup outcome tests.
      const knownOutcome =
        outcome?.state === 'received'
          ? cleanup === deadlineReached
            ? statusTimeout
            : undefined
          : outcome;
      return { state: 'cleanup-failed', outcome: knownOutcome, settled };
    }
    if (outcome !== undefined) return outcome;
    if (completed === cancelled) throw registryStatusCancelled();
    throw new Error('registry status SSH exchange failed');
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
