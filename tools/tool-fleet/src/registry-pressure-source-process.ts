import { addAbortListener } from 'node:events';

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

function failureForExit(code: number): CleanupOutcome {
  // Proof: Dropping 77 or aliasing 255 broke the corresponding prefix tests.
  if (code === 77) return { state: 'unavailable', reason: 'source-refused', code: 'refused' };
  return { state: 'unavailable', reason: 'source-command-failed', code: 'ssh-exit' };
}

/** Starts the already admitted SSH command and supervises its two pipes and actual child exit. */
export async function readRegistryStatusProcess(
  argv: readonly string[],
  signal: AbortSignal,
  deadline: number,
  abortedAt: () => number,
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
  // Proof: A plain listener let the active fixture finish after shared abort. Omitting disposal leaked a listener.
  using _subscription = addAbortListener(signal, onAbort);
  // Proof: Ignoring the timestamp lost abort-first at preflight disposal. Accepting any abort lost cutoff-first without spawning.
  if (abortedAt() < cutoff) throw registryStatusCancelled();
  if (performance.now() >= cutoff) return statusTimeout;

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
  // Record natural failure independently while both pipes drain.
  const acquisition: { isActive: boolean; failure?: CleanupOutcome } = { isActive: true };
  const exited = (async () => child.exited)().then((code) => {
    // Proof: Omitting each exit guard broke the zero-frame, setup failure, earlier abort or cutoff case.
    if (
      code !== 0 &&
      acquisition.isActive &&
      interruption === undefined &&
      performance.now() < cutoff
    ) {
      // Proof: Omitting the exit receipt lost exit77 on the subsequent pipe fault.
      acquisition.failure = failureForExit(code);
    }
    return code;
  });
  // Proof: Dropping either EOF or exit settlement broke its independent completion test.
  const exchange = Promise.all([stdout.drained, stderr.drained, exited]).then(
    ([bytes, diagnostics, code]) => ({ bytes, diagnostics, code }),
    () => exchangeFailed,
  );
  const observed = await waitUntil(Promise.race([stop.promise, exchange]), cutoff);
  acquisition.isActive = false;
  // Proof: Replacing a recorded interruption with timeout broke the delayed abort test.
  const completed = observed === deadlineReached ? (interruption ?? statusTimeout) : observed;
  let outcome: RegistryStatusReply | undefined;
  let isComplete = false;
  if (typeof completed === 'object' && 'bytes' in completed) {
    if (completed.bytes !== undefined && completed.diagnostics !== undefined) {
      isComplete = true;
      // Proof: Treating a nonzero exit as received broke the exit-one prefix test.
      outcome =
        completed.code === 0
          ? { state: 'received', bytes: completed.bytes }
          : failureForExit(completed.code);
    }
  } else if (typeof completed === 'object') {
    outcome = completed;
  }

  // Proof: Omitting either cap lost its outcome after both clean and failed cleanup.
  // Removing the cached exit fallback lost the refusal after an unrelated pipe fault or later cutoff.
  const admitted =
    outcome === stdoutOverflow || outcome === stderrOverflow
      ? outcome
      : (acquisition.failure ?? outcome);

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
      admitted?.state === 'received'
        ? cleanup === deadlineReached
          ? statusTimeout
          : undefined
        : admitted;
    return { state: 'cleanup-failed', outcome: knownOutcome, settled };
  }
  // Proof: Returning the cached exit before cancellation broke controlled abort after exit77.
  if (completed === cancelled) throw registryStatusCancelled();
  if (admitted !== undefined) return admitted;
  throw new Error('registry status SSH exchange failed');
}
