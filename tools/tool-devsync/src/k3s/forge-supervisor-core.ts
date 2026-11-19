export { createForgeNativeInspection } from './forge-native';
import { constants } from 'node:os';
import { verifyForgeInstallation } from './forge-installation';
import { fingerprintWorktree, INSTALL_REQUIRED, supervisorActionOf } from './forge-supervisor-state';
const POLL_MS = 2000;
const STOP_GRACE_MS = 20_000;
/** Required producer-owned observation. False is changed captured state; absence/unreadability/unknown required edges throw. */
export interface ForgeExecutionInspection { readonly inspect: () => Promise<boolean> }
export type ForgeSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';
/** Constructor-owned Bun/runtime/selection and one replaying control subscription; registration failure retains no subscription. */
export interface ForgeSupervisorContext {
  readonly runtime: string;
  readonly environment: Readonly<Partial<Record<string, string>>>;
  readonly selection: { readonly bytes: Uint8Array; readonly sha256: string; readonly directory: string; readonly entrypoint: string };
  readonly subscribeStop: (this: void, observer: (signal: ForgeSignal) => void) => () => void;
  readonly report: (this: void, message: string) => void | Promise<void>;
}
interface NativeExit {
  readonly code: number | null;
  readonly signal: unknown;
  readonly failure: unknown;
}
interface ForgeChild {
  readonly purpose: 'install' | 'development';
  readonly process: Bun.Subprocess;
  readonly joined: Promise<{ readonly status: number; readonly native: NativeExit }>;
}
function isSignal(value: unknown): value is NodeJS.Signals {
  return typeof value === 'string' && Object.hasOwn(constants.signals, value);
}
/** Start only the fixed frozen-install or delivered development vector; inherited streams are not readable EOF evidence. */
function launchForgeChild(
  purpose: ForgeChild['purpose'], root: string, context: ForgeSupervisorContext,
): ForgeChild {
  const native = Promise.withResolvers<NativeExit>();
  const argv = purpose === 'install'
    ? [context.runtime, '--no-env-file', '--config=/dev/null', 'install', '--frozen-lockfile']
    : [context.runtime, '--no-env-file', '--config=/dev/null', context.selection.entrypoint, 'dash', 'dev', '--repository', root];
  const environment = { ...context.environment };
  for (const name of ['BUN_OPTIONS', 'BUN_INSPECT_PRELOAD', 'NODE_OPTIONS', 'BUN_BE_BUN']) delete environment[name];
  const child = Bun.spawn(argv, {
    cwd: root, env: environment, stdio: ['ignore', 'inherit', 'inherit'], detached: true,
    onExit(_child, code, signal, failure) { native.resolve({ code, signal, failure }); },
  });
  const joined = Promise.all([child.exited, native.promise]).then(([status, observed]) => {
    if (observed.failure !== undefined) throw observed.failure;
    if (observed.signal === null) {
      if (observed.code === null || observed.code !== status)
        throw new Error('Forge child native and numeric exit disagree');
    } else if (!isSignal(observed.signal) || observed.code !== null || status !== 128 + constants.signals[observed.signal]) {
      throw new Error('Forge child signal and numeric exit disagree');
    }
    return { status, native: observed };
  });
  // The serialized supervisor awaits this same promise; retain it without an early unhandled rejection.
  void joined.catch(() => undefined);
  return { purpose, process: child, joined };
}
/**
 * Arm the 20s grace before transport, then allow at most 5s native hard-stop observation.
 * A PUNI parent must confirm normal 128+signal completion; hard kill or delivery/wait failure
 * forbids a successor. This does not establish Pod/cgroup or arbitrary descendant custody.
 */
async function stopForgeChild(child: ForgeChild, signal: ForgeSignal): Promise<void> {
  let primary: { readonly cause: unknown } | undefined;
  const failures: unknown[] = [];
  const expired = Promise.withResolvers<void>();
  const timer = setTimeout(() => { expired.resolve(); }, STOP_GRACE_MS);
  let joined: Awaited<ForgeChild['joined']> | undefined;
  try {
    try {
      if (child.purpose === 'install') process.kill(-child.process.pid, signal);
      else child.process.kill(signal);
    } catch (cause: unknown) { primary = { cause }; }
    const stopped = await Promise.race([
      child.joined.then((value) => ({ kind: 'joined' as const, value })),
      expired.promise.then(() => ({ kind: 'expired' as const })),
    ]);
    if (stopped.kind === 'joined') joined = stopped.value;
    else {
      try {
        if (child.purpose === 'install') process.kill(-child.process.pid, 'SIGKILL');
        else child.process.kill('SIGKILL');
      } catch (cause: unknown) { failures.push(cause); }
      const unconfirmed = new Error('Forge stop exceeded its grace; no successor is admitted');
      if (primary === undefined) primary = { cause: unconfirmed }; else failures.push(unconfirmed);
      const hardDeadline = Promise.withResolvers<void>();
      const hardTimer = setTimeout(() => { hardDeadline.resolve(); }, 5000);
      try {
        const terminal = await Promise.race([
          child.joined.then((value) => ({ kind: 'joined' as const, value })),
          hardDeadline.promise.then(() => ({ kind: 'unknown' as const })),
        ]);
        if (terminal.kind === 'joined') joined = terminal.value;
        else failures.push(new Error('Forge child native settlement remains unconfirmed'));
      } finally { clearTimeout(hardTimer); }
    }
  } catch (cause: unknown) {
    if (primary === undefined) primary = { cause }; else failures.push(cause);
  } finally { clearTimeout(timer); }
  if (joined !== undefined && child.purpose === 'development' &&
      (joined.status !== 128 + constants.signals[signal] || joined.native.code !== joined.status || joined.native.signal !== null)) {
    const refusal = new Error('PUNI parent did not confirm its controlled interruption completion; no successor is admitted');
    if (primary === undefined) primary = { cause: refusal }; else failures.push(refusal);
  }
  if (primary !== undefined)
    throw new AggregateError([primary.cause, ...failures], 'Forge child stop failed with unconfirmed descendant custody', { cause: primary.cause });
}

/**
 * Keep only an explicitly selected, reverified PUNI parent running from the worktree.
 * PUNI owns its Nx session; Forge signals that parent and admits no restart after uncertain stop.
 * Inherited Pod streams are not readable EOF evidence for this owner. Reusable calls return/throw;
 * only the executable boundary terminates the supervisor process.
 */
export async function runForgeSupervisor(root: string, supplied: ForgeSupervisorContext, execution: ForgeExecutionInspection): Promise<number> {
  const context: ForgeSupervisorContext = {
    ...supplied, environment: { ...supplied.environment }, selection: { ...supplied.selection, bytes: Uint8Array.from(supplied.selection.bytes) },
  };
  const interruption: { signal: ForgeSignal | undefined } = { signal: undefined };
  const requested = Promise.withResolvers<void>();
  let child: ForgeChild | undefined;
  const stopAttempts = new Set<ForgeChild>();
  const transportFailures: unknown[] = [];
  const unsubscribe = context.subscribeStop((signal) => {
    if (interruption.signal === undefined) { interruption.signal = signal; requested.resolve(); }
    else if (child !== undefined && stopAttempts.has(child)) {
      try {
        if (child.purpose === 'install') process.kill(-child.process.pid, signal);
        else child.process.kill(signal);
      } catch (cause: unknown) { transportFailures.push(cause); }
    }
  });
  async function stopOwned(selected: ForgeChild, signal: ForgeSignal): Promise<void> {
    stopAttempts.add(selected);
    await stopForgeChild(selected, signal);
  }
  let primary: { readonly cause: unknown } | undefined;
  const cleanup: unknown[] = [];
  let status = 1;
  async function admitExecution(): Promise<boolean> {
    if (await execution.inspect()) return true;
    await context.report('supervisor execution changed; restarting the container to load its required source/config/runtime/assets');
    status = 0;
    return false;
  }
  async function verifySelection(): Promise<void> {
    await verifyForgeInstallation(context.selection.bytes, context.selection.sha256, context.selection.directory, context.selection.entrypoint);
  }
  async function install(): Promise<boolean> {
    if (interruption.signal !== undefined || !(await admitExecution())) return false;
    await verifySelection();
    if (interruption.signal !== undefined) return false;
    child = launchForgeChild('install', root, context);
    const outcome = await Promise.race([
      child.joined.then((value) => ({ kind: 'joined' as const, value })),
      requested.promise.then(() => ({ kind: 'stopped' as const })),
    ]);
    if (outcome.kind === 'stopped') {
      const signal = interruption.signal;
      if (signal === undefined) throw new Error('Forge stop event has no owning interruption');
      await stopOwned(child, signal); child = undefined; return false;
    }
    child = undefined;
    if (outcome.value.status !== 0 || outcome.value.native.code !== 0 || outcome.value.native.signal !== null) {
      await context.report(INSTALL_REQUIRED + ' bun install --frozen-lockfile exited ' + String(outcome.value.status));
      status = 65;
      return false;
    }
    return true;
  }
  // Historical shell-supervisor observation retained at the first-install placement; it does
  // not supply fresh native-child/selection/cancellation evidence for this replacement.
  // Proof: without this install before the first start, a live container restarted after a
  // failed install started the tiers on unsynced node_modules and crash-looped with no named
  // cause; with it the container stops first and `status` prints INSTALL REQUIRED, exit 4
  // (k3s-platform verify.md, F9 review).
  try {
    if (await install() && await admitExecution()) {
      let baseline = { restart: await fingerprintWorktree(root), supervisor: 'retained-execution' };
      if (interruption.signal === undefined) await verifySelection();
      if (interruption.signal === undefined) child = launchForgeChild('development', root, context);
      while (child !== undefined && interruption.signal === undefined) {
        const outcome = await Promise.race([
          child.joined.then((value) => ({ kind: 'joined' as const, value })),
          requested.promise.then(() => ({ kind: 'stopped' as const })),
          Bun.sleep(POLL_MS).then(() => ({ kind: 'poll' as const })),
        ]);
        if (outcome.kind === 'stopped') break;
        if (outcome.kind === 'joined') {
          child = undefined;
          await context.report('PUNI development parent exited with ' + String(outcome.value.status));
          status = outcome.value.status === 0 ? 1 : outcome.value.status;
          break;
        }
        const current = { restart: await fingerprintWorktree(root), supervisor: await execution.inspect() ? 'retained-execution' : 'changed-execution' };
        if (interruption.signal !== undefined) break;
        await verifySelection();
        if (interruption.signal !== undefined) break;
        const action = supervisorActionOf(baseline, current);
        if (action === 'none') continue;
        await stopOwned(child, 'SIGTERM'); child = undefined;
        if (action === 'exit') {
          await context.report('supervisor sources changed; restarting the container to load them'); status = 0; break;
        }
        if (!(await install()) || !(await admitExecution())) break;
        baseline = current;
        await verifySelection();
        if (interruption.signal === undefined) child = launchForgeChild('development', root, context);
      }
    }
    if (interruption.signal !== undefined) {
      if (child !== undefined) { await stopOwned(child, interruption.signal); child = undefined; }
      status = 128 + constants.signals[interruption.signal];
    }
  } catch (cause: unknown) { primary = { cause }; }
  if (child !== undefined && !stopAttempts.has(child)) {
    try { await stopOwned(child, 'SIGTERM'); } catch (cause: unknown) { cleanup.push(cause); }
  }
  try { unsubscribe(); } catch (cause: unknown) { cleanup.push(cause); }
  cleanup.push(...transportFailures);
  if (primary !== undefined) throw new AggregateError([primary.cause, ...cleanup], 'Forge supervision failed', { cause: primary.cause });
  if (cleanup.length !== 0) throw new AggregateError(cleanup, 'Forge supervision cleanup failed');
  return status;
}

