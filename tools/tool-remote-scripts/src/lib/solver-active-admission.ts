import type { EdgePolicySnapshot } from './edge-policy';
import { captureInitialHandoff, type InitialHandoffGraph } from './initial-handoff-graph';
import { AuthorityCleanupUnknown } from './installed-authority-supervision';
import { assertSame } from './managed-cohort';
import { assertExecutingSolver } from './solver-execution';
import { captureSolverFile, captureSolverTuple, type SolverFile } from './solver-host';
import { observeSolverLaunch } from './solver-launch-observation';
import { resolveSolverImages } from './solver-restoration';

function assertActiveDeadline(deadline: number): void {
  const remaining = deadline - performance.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 120000)
    throw new Error('active solver admission deadline exceeded');
}

function spawnActiveImage(args: string[], signal: AbortSignal) {
  return Bun.spawn(['docker', ...args], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    signal,
    killSignal: 'SIGKILL',
  });
}

/** A failed read is not EOF. Keep the actual child, original reads and cancellation custody in active HOLD. */
class ActiveImageCleanupUnknown extends AuthorityCleanupUnknown {
  readonly #custody: Readonly<{
    child: ReturnType<typeof spawnActiveImage>;
    stdout: Promise<string>;
    stderr: Promise<string>;
    exit: Promise<number>;
    controller: AbortController;
    timer: ReturnType<typeof setTimeout>;
  }>;
  constructor(custody: {
    child: ReturnType<typeof spawnActiveImage>;
    stdout: Promise<string>;
    stderr: Promise<string>;
    exit: Promise<number>;
    controller: AbortController;
    timer: ReturnType<typeof setTimeout>;
  }) {
    super();
    this.#custody = custody;
    Object.freeze(this.#custody);
  }
}

/** Reads each actual image pipe to EOF and waits on the original child separately, even after another read fails. */
async function runActiveImage(
  args: string[],
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<string> {
  const remaining = deadline - performance.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 15000 || signal?.aborted)
    throw new Error('active image deadline exceeded');
  const controller = new AbortController();
  const child = spawnActiveImage(args, controller.signal);
  const abort = () => {
    controller.abort();
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, Math.max(1, deadline - performance.now()));
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const exit = child.exited;
  let unknown = false;
  try {
    const [output, errors, termination] = await Promise.allSettled([stdout, stderr, exit]);
    if (
      output.status === 'rejected' ||
      errors.status === 'rejected' ||
      termination.status === 'rejected'
    ) {
      unknown = true;
      throw new ActiveImageCleanupUnknown({ child, stdout, stderr, exit, controller, timer });
    }
    if (performance.now() >= deadline) throw new Error('active image deadline exceeded');
    if (termination.value !== 0) throw new Error('active image lookup failed');
    return output.value;
  } finally {
    // Unknown keeps its independently scheduled original-deadline abort as well as every original operation.
    if (!unknown) clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Settles every active-owned original image child/read before a known refusal can leave the lifetime lock. */
async function resolveActiveImages(references: readonly string[], deadline: number) {
  const operations: Promise<string>[] = [];
  const imageDeadline = Math.min(deadline, performance.now() + 15000);
  let images: Awaited<ReturnType<typeof resolveSolverImages>> | undefined;
  let failure: { cause: unknown } | undefined;
  try {
    images = await resolveSolverImages(
      references,
      (args, signal) => {
        const operation = runActiveImage(args, signal, imageDeadline);
        operations.push(operation);
        return operation;
      },
      imageDeadline,
    );
  } catch (cause) {
    failure = { cause };
  }
  const settled = await Promise.allSettled(operations);
  for (const operation of settled)
    if (operation.status === 'rejected' && operation.reason instanceof AuthorityCleanupUnknown)
      throw operation.reason;
  if (failure !== undefined) throw failure.cause;
  if (images === undefined) throw new Error('active image resolver returned no identities');
  return images;
}

/**
 * Verifies stored closure, actual execution/images and two independent current launch observations.
 * The caller must already own the original lifetime runtime lock. Unknown descendant custody stays
 * pending here with retained original operations/descriptors; it never escapes that lock's finally.
 * This read-only consumer returns no original owner, controller permission or recovery capability.
 */
export async function verifyActiveSolverPolicy(
  snapshot: EdgePolicySnapshot,
  deadline: number,
): Promise<void> {
  assertActiveDeadline(deadline);
  const retained: {
    graph: InitialHandoffGraph | undefined;
    operations: Set<Promise<unknown>>;
    tuples: (readonly SolverFile[])[];
    launches: Awaited<ReturnType<typeof observeSolverLaunch>>[];
    unknown: AuthorityCleanupUnknown | undefined;
  } = { graph: undefined, operations: new Set(), tuples: [], launches: [], unknown: undefined };
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let reported = false;
  const reportHold = () => {
    if (!reported) {
      console.error(
        '[wbs-solver-supervisor] active admission HOLD: original operation or cleanup remains unsettled; runtime lock retained',
      );
      reported = true;
    }
    keepalive ??= setInterval(() => retained, 30000);
  };
  const timer = setTimeout(reportHold, Math.max(1, deadline - performance.now()));
  async function settleOperation<T>(operation: Promise<T>): Promise<T> {
    retained.operations.add(operation);
    try {
      return await operation;
    } finally {
      retained.operations.delete(operation);
    }
  }
  try {
    retained.graph = await settleOperation(captureInitialHandoff(snapshot, deadline));
    assertActiveDeadline(deadline);
    const graph = retained.graph;
    retained.launches.push(
      await settleOperation(
        observeSolverLaunch(
          graph.admission.authorities.pins,
          graph.writerManifest,
          graph.runtimeLaunch,
          deadline,
        ),
      ),
    );
    assertActiveDeadline(deadline);
    await settleOperation(assertExecutingSolver());
    assertActiveDeadline(deadline);
    const capture: typeof captureSolverFile = async (path, maximum, config) => {
      assertActiveDeadline(deadline);
      const observed = await settleOperation(captureSolverFile(path, maximum, config));
      assertActiveDeadline(deadline);
      graph.retainExecutingFile(observed);
      return observed;
    };
    const installed = await settleOperation(captureSolverTuple(graph.admission.solver, capture));
    retained.tuples.push(installed);
    assertActiveDeadline(deadline);
    const references = installed.flatMap((file) => file.solverImages ?? []);
    const images = await settleOperation(resolveActiveImages(references, deadline));
    assertActiveDeadline(deadline);
    assertSame(graph.images, images, 'initial active immutable image coverage');
    graph.verifyClosure();
    assertActiveDeadline(deadline);
    await settleOperation(assertExecutingSolver());
    assertActiveDeadline(deadline);
    const closing = await settleOperation(captureSolverTuple(graph.admission.solver, capture));
    retained.tuples.push(closing);
    assertActiveDeadline(deadline);
    assertSame(installed, closing, 'initial active executing tuple readback');
    const closingImages = await settleOperation(
      resolveActiveImages(
        closing.flatMap((file) => file.solverImages ?? []),
        deadline,
      ),
    );
    assertActiveDeadline(deadline);
    assertSame(graph.images, closingImages, 'initial active immutable image readback');
    retained.launches.push(
      await settleOperation(
        observeSolverLaunch(
          graph.admission.authorities.pins,
          graph.writerManifest,
          graph.runtimeLaunch,
          deadline,
        ),
      ),
    );
    assertActiveDeadline(deadline);
    graph.assertStable();
    assertActiveDeadline(deadline);
  } catch (cause) {
    if (cause instanceof AuthorityCleanupUnknown) {
      retained.unknown = cause;
      reportHold();
      await new Promise<never>(() => undefined);
    }
    throw cause;
  } finally {
    clearTimeout(timer);
    if (keepalive !== undefined) clearInterval(keepalive);
    retained.graph?.closeFiles();
  }
}
