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
export const cancelled = Symbol('registry status cancelled');
const exchangeFailed = Symbol('registry status exchange failed');

export type CleanupOutcome = Exclude<RegistryStatusReply, { readonly state: 'received' }>;

interface CleanupFailure {
  readonly state: 'cleanup-failed';
  readonly outcome: CleanupOutcome | undefined;
  readonly settled: Promise<boolean>;
}

type Interruption =
  typeof cancelled | typeof statusTimeout | typeof stdoutOverflow | typeof stderrOverflow;

type Overflow = typeof stdoutOverflow | typeof stderrOverflow;

/** Shares the first observed interruption across acquisition, cleanup and public delivery. */
export class RegistryStatusRead {
  readonly cutoff: number;
  #interruption: Interruption | undefined;

  constructor(
    readonly signal: AbortSignal,
    readonly deadline: number,
  ) {
    // Proof: Removing the reserve broke the original deadline and reap test.
    this.cutoff = deadline - 1000;
  }

  observeCancellation(): Interruption | undefined {
    // Proof: Overwriting an observed cutoff lost timeout when the caller aborted from pipe cancellation.
    if (this.#interruption === undefined && this.signal.aborted) this.#interruption = cancelled;
    return this.#interruption;
  }

  observeAcquisition(overflow?: Overflow): Interruption | undefined {
    // Proof: Clock-first lost the blocked-listener pre-spawn tie. Clearing recorded overflow lost the first stderr cap.
    if (this.observeCancellation() === undefined) {
      // Proof: Strict greater-than admitted local I/O at exact cutoff equality.
      this.#interruption = performance.now() >= this.cutoff ? statusTimeout : overflow;
    }
    return this.#interruption;
  }

  /** Refuses an interrupted start before preflight or spawn. */
  admitStart(): CleanupOutcome | undefined {
    const interruption = this.observeAcquisition();
    // Proof: Mapping an interrupted start to timeout lost controlled pre-aborted admission.
    if (interruption === cancelled) throw registryStatusCancelled();
    return interruption;
  }

  /** Records expiry when observed, while its underlying work retains its own settlement. */
  async waitUntil<Value>(
    work: Promise<Value>,
    deadline = this.deadline,
  ): Promise<Value | typeof deadlineReached> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const expire = (): typeof deadlineReached => {
        // Proof: Deferring this decision lost the overdue-success timeout on abort during wait disposal.
        this.observeAcquisition();
        return deadlineReached;
      };
      const lapse = new Promise<typeof deadlineReached>((resolve) => {
        function wait(): void {
          const remaining = deadline - performance.now();
          // Proof: Expiring on the first wakeup lost a complete frame still inside its acquisition budget.
          if (remaining <= 0) resolve(expire());
          else timer = setTimeout(wait, Math.ceil(remaining));
        }
        wait();
      });
      return await Promise.race([
        // Proof: Trusting timer delivery alone accepted the late EOF/exit callbacks.
        work.then((value) => (performance.now() >= deadline ? expire() : value)),
        lapse,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function registryStatusCancelled(): DOMException {
  return new DOMException('registry status read cancelled', 'AbortError');
}

function isAbsent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ESRCH';
}

type Pipe = ReadableStreamDefaultReader<Uint8Array>;

/** Copies only admitted bytes, discarding the first overflowing chunk and all diagnostics. */
async function collectPipe(
  pipe: Pipe,
  maximum: number,
  canAcquire: () => boolean,
  overflow: () => void,
): Promise<Uint8Array | undefined> {
  const bytes = new Uint8Array(maximum);
  let offset = 0;
  // Proof: Unconditional reading started I/O after reader setup crossed cutoff.
  while (canAcquire()) {
    const chunk = await pipe.read();
    // Proof: Skipping admission after read touched the delayed chunk past cutoff.
    if (!canAcquire()) return undefined;
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
  return undefined;
}

/** Owns a pipe starting at the getter, so partial setup failures enter child cleanup. */
function supervisePipe(
  open: () => ReadableStream<Uint8Array>,
  maximum: number,
  canAcquire: () => boolean,
  overflow: () => void,
) {
  let pipe: ReadableStream<Uint8Array> | undefined;
  let reader: Pipe | undefined;
  const drained = (async () => {
    pipe = open();
    reader = pipe.getReader();
    return collectPipe(reader, maximum, canAcquire, overflow);
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
  read: RegistryStatusRead,
): Promise<RegistryStatusReply | CleanupFailure> {
  const stop = Promise.withResolvers<Interruption>();
  const acquisition: { isActive: boolean; failure?: CleanupOutcome } = { isActive: true };
  function canAcquire(overflow?: Overflow): boolean {
    // Proof: Without the active guard a chunk released during setup-failure cleanup started another read.
    if (!acquisition.isActive) return false;
    const interruption = read.observeAcquisition(overflow);
    if (interruption === undefined) return true;
    // Proof: Without this wakeup the held stdout-overflow child ran until the acquisition timer.
    stop.resolve(interruption);
    return false;
  }
  const onAbort = () => {
    const interruption = read.observeCancellation();
    // Proof: Missing wakeup delayed shared abort; waking on a synthetic event interrupted a nonaborted signal.
    if (interruption !== undefined) stop.resolve(interruption);
  };
  // Proof: A plain listener let the active fixture finish after shared abort. Omitting disposal leaked a listener.
  using _subscription = addAbortListener(read.signal, onAbort);
  // Proof: Skipping the stopped return reached spawn after the no-abort preflight handoff crossed cutoff.
  const initial = read.admitStart();
  if (initial !== undefined) return initial;

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
    canAcquire,
    () => {
      canAcquire(stdoutOverflow);
    },
  );
  const stderr = supervisePipe(
    () => child.stderr,
    4096,
    canAcquire,
    () => {
      canAcquire(stderrOverflow);
    },
  );
  // Record natural failure independently while both pipes drain.
  const exited = (async () => child.exited)().then((code) => {
    // Proof: Caching a late exit lost timeout; caching exit zero replaced a complete received frame.
    if (canAcquire() && code !== 0) {
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
  const observed = await read.waitUntil(Promise.race([stop.promise, exchange]), read.cutoff);
  acquisition.isActive = false;
  // Proof: Using the raw wait result lost the actual timeout on the blocked exchange.
  const completed = read.observeCancellation() ?? observed;
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
  const cleanup = await read.waitUntil(settled);
  if (cleanup !== true) {
    // Proof: Always attaching timeout on overdue success lost the preceding cancellation during release.
    const knownOutcome =
      admitted?.state === 'received'
        ? cleanup === deadlineReached && read.observeCancellation() !== cancelled
          ? statusTimeout
          : undefined
        : admitted;
    return { state: 'cleanup-failed', outcome: knownOutcome, settled };
  }
  // Proof: Omitting controlled cancellation lost AbortError when the caller aborted before stdout overflow.
  if (read.observeCancellation() === cancelled) throw registryStatusCancelled();
  if (admitted !== undefined) return admitted;
  throw new Error('registry status SSH exchange failed');
}
