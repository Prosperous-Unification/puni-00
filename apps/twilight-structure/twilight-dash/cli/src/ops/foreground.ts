import type { Admission, QueueOutcome } from '@shared/heavy-lock';

import { readTermination } from './native-exit';

export interface Request {
  readonly argv: readonly [string, ...string[]];
  readonly label: string;
  readonly waitSeconds: number;
  readonly pollSeconds: number;
}
export interface Context {
  readonly path: string;
  readonly directory: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly signal: AbortSignal;
  readonly reportAdmission: (admission: Admission) => Promise<void>;
  /** Must settle within its executable's diagnostic budget, including reporting failure. */
  readonly reportUnconfirmed: (observation: {
    readonly pid: number;
    readonly cause: unknown;
  }) => Promise<void>;
}
export type Payload =
  | { readonly kind: 'exited'; readonly status: number }
  | { readonly kind: 'not-started'; readonly status: 126 | 127; readonly cause: unknown }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly cause: unknown };
type Observation =
  | { readonly kind: 'observed'; readonly status: unknown }
  | { readonly kind: 'failed'; readonly cause: unknown };

function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}

/**
 * Native exit is established independently of the numeric exited promise. A wait error is
 * reported once while an explicit referenced interval retains authority and the pending work.
 * That reference spans spawn and terminal observation, including an omitted callback dependency.
 * A missing-callback diagnostic is timed only after exposed exit settlement, never while running.
 * Only an error-free native exit notification permits settlement. Status observation is bounded
 * after that notification; its failure cannot release live foreground work. Bun1.4.4's callback
 * signal field is a string despite its numeric declaration. Decode that boundary and require
 * its status to agree with the separately observed numeric exited result.
 */
async function runPayload(
  argv: readonly string[],
  directory: string,
  environment: Record<string, string>,
  report: Context['reportUnconfirmed'],
): Promise<Payload> {
  const terminal = Promise.withResolvers<number>(),
    failures = new Set<unknown>();
  let pid: number | undefined,
    isTerminal = false;
  // Proof: removing this reference exited before payload readiness when the owned observer had no ambient child or top-level-await reference.
  const retention = setInterval(() => undefined, 1000);
  let callbackCheck: ReturnType<typeof setTimeout> | undefined;
  let reporting: Promise<{ kind: 'reported' } | { kind: 'failed'; cause: unknown }> | undefined;
  function recordFailure(owner: number, cause: unknown): void {
    failures.add(cause);
    reporting ??= Promise.resolve()
      .then(() => report({ pid: owner, cause }))
      .then(
        () => ({ kind: 'reported' as const }),
        (failure: unknown) => ({ kind: 'failed' as const, cause: failure }),
      );
  }
  let observed: Promise<Observation>;
  try {
    const child = Bun.spawn([...argv], {
      cwd: directory,
      env: environment,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      detached: false,
      onExit(native, code, signal, cause) {
        if (isTerminal) return;
        pid = native.pid;
        // Proof: accepting an erroneous native callback ended the owner in the native-wait-error retention test.
        if (cause !== undefined) {
          recordFailure(native.pid, cause);
          return;
        }
        const identity = readTermination(code, signal);
        // Proof: accepting a missing native identity settled instead of retaining the referenced mutex owner.
        if (identity.kind === 'unconfirmed') {
          recordFailure(native.pid, identity.cause);
          return;
        }
        isTerminal = true;
        terminal.resolve(identity.status);
      },
    });
    pid = child.pid;
    observed = child.exited.then(
      (status) => {
        if (!isTerminal)
          callbackCheck = setTimeout(() => {
            if (!isTerminal)
              recordFailure(
                child.pid,
                new Error('foreground native termination callback is missing'),
              );
          }, 1000);
        return { kind: 'observed' as const, status };
      },
      (cause: unknown) => {
        recordFailure(child.pid, cause);
        return { kind: 'failed' as const, cause };
      },
    );
  } catch (cause) {
    if (pid === undefined) {
      clearInterval(retention);
      if (hasCode(cause, 'ENOENT')) return { kind: 'not-started', status: 127, cause };
      if (hasCode(cause, 'EACCES') || hasCode(cause, 'ENOEXEC'))
        return { kind: 'not-started', status: 126, cause };
      throw new Error('cannot start foreground payload', { cause });
    }
    recordFailure(pid, cause);
    observed = Promise.resolve({ kind: 'failed', cause });
  }
  try {
    // Proof: skipping native termination settled before the actual payload in the isolated rejected-wait supervisor.
    const nativeStatus = await terminal.promise;
    if (callbackCheck !== undefined) clearTimeout(callbackCheck);
    const expiry = Promise.withResolvers<Observation>();
    const timer = setTimeout(() => {
      expiry.resolve({
        kind: 'failed',
        cause: new Error('foreground exit status did not settle after native termination'),
      });
    }, 1000);
    let observation: Observation;
    try {
      observation = await Promise.race([observed, expiry.promise]);
    } finally {
      clearTimeout(timer);
    }
    if (observation.kind === 'failed') recordFailure(pid, observation.cause);
    else if (
      typeof observation.status !== 'number' ||
      !Number.isInteger(observation.status) ||
      observation.status < 0 ||
      observation.status > 255
    )
      recordFailure(pid, new Error('foreground native exit status is invalid'));
    // Proof: removing correspondence accepted exposed status0 after actual native exit37.
    else if (observation.status !== nativeStatus)
      recordFailure(pid, new Error('foreground native exit identities disagree'));
    if (reporting !== undefined) {
      const diagnostic = await reporting;
      if (diagnostic.kind === 'failed') failures.add(diagnostic.cause);
    }
    if (failures.size !== 0)
      return {
        kind: 'failed',
        cause: new AggregateError([...failures], 'foreground exit observation failed'),
      };
    if (observation.kind !== 'observed' || typeof observation.status !== 'number')
      throw new Error('foreground terminal observation is missing');
    return { kind: 'exited', status: observation.status };
  } finally {
    clearInterval(retention);
    if (callbackCheck !== undefined) clearTimeout(callbackCheck);
  }
}

/**
 * Hold the canonical queue callback through foreground settlement. Explicit paths belong to the
 * composing boundary; production chooses the canonical host inode. Payload IO is native and
 * inherited, with no shell or buffered output relay. A holder-targeted signal cancels admission
 * before spawn; already started foreground work keeps its lock until native termination.
 */
export async function runForeground(
  request: Request,
  context: Context,
): Promise<QueueOutcome<Payload>> {
  const argv = [...request.argv],
    { label, waitSeconds, pollSeconds } = request;
  const { path, directory, signal, reportAdmission, reportUnconfirmed } = context;
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(context.environment))
    if (value !== undefined) environment[key] = value;
  const { runQueuedWork, createQueueRuntime } = await import('@shared/heavy-lock');
  return await runQueuedWork(
    { path, label, command: argv.join(' '), waitSeconds, pollSeconds },
    async (admission) => {
      await reportAdmission(admission);
      if (signal.aborted) return { kind: 'cancelled' };
      return await runPayload(argv, directory, environment, reportUnconfirmed);
    },
    createQueueRuntime(signal),
  );
}
