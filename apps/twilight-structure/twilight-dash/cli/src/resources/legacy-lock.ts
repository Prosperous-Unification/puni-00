import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';

/**
 * The shell lock a host's legacy callers take (`bin/heavy-lock-lib.sh`, `dash-host-jobs` J12):
 * the library Dash sources to take it, and the lock path its `with_heavy_lock` is given. Dash
 * never reimplements the protocol: tickets, deadlines, the holder record, labels and dead-ticket
 * reclaim are the library's own (S6B-A1).
 */
export interface LegacyLock {
  readonly library: string;
  readonly lockPath: string;
}

/**
 * The production lock: the library of the checkout this Dash runs from, and the one canonical
 * path its `resolve_heavy_lock_path` answers. No variable or flag names another path, for the
 * reason that function's comment gives: a caller able to choose its lock can opt out of it.
 * @throws when the library is missing or does not answer a path.
 */
export function productionLegacyLock(): LegacyLock {
  // `src/resources` sits six levels below the workspace root, as `src/packaging` does.
  const library = resolve(import.meta.dir, '../../../../../../bin/heavy-lock-lib.sh');
  if (!existsSync(library))
    throw new Error(`the shell lock library ${library} is missing from this checkout`);
  const answer = spawnSync(
    'bash',
    ['-c', 'source "$1" && resolve_heavy_lock_path', 'dash-legacy-lock', library],
    { encoding: 'utf8', timeout: 10_000 },
  );
  const lockPath = answer.stdout.trim();
  if (answer.status !== 0 || lockPath === '')
    throw new Error(
      `the shell lock library ${library} answered no lock path (exit ${String(answer.status)}): ${answer.stderr.trim()}`,
    );
  return { library, lockPath };
}

/** Where a pool keeps the hold files of its legacy holders: `<root>/.dash/legacy-holds`. */
export function legacyHoldDirectory(root: string): string {
  return join(root, '.dash', 'legacy-holds');
}

/** The hold file of host job `jobId`'s legacy holder in observe mode. */
export function jobHoldFile(root: string, jobId: string): string {
  return join(legacyHoldDirectory(root), jobId);
}

/** The hold file of the singleton guard's legacy holder in concurrent mode. */
export function guardHoldFile(root: string): string {
  return join(legacyHoldDirectory(root), 'dash-singleton');
}

/**
 * The shell holder. `with_heavy_lock` queues this process's ticket, claims the flock in arrival
 * order and records this bash's pid and `$HEAVY_LOCK_LABEL` as the holder; its command prints
 * `held`, closes its stdout and keeps the flock for as long as the hold file exists. The flock
 * lives on this bash's fd 9, never on Dash: Dash dying closes nothing that releases it, and
 * whoever removes the hold file (the launcher at settlement, or `watch` once the job's compute
 * settles) ends it. Its stderr goes to Dash only until it holds, so a pipe Dash's own caller
 * reads is never kept open by a holder that outlives Dash. Killing this bash makes the kernel release the flock and leaves its holder
 * record for the next claimant to reclaim from a dead pid, the library's own rule.
 */
const HOLDER = [
  // Dash reads the holder's stderr only until it holds; a later write to that closed pipe must
  // not kill the holder that keeps the flock.
  "trap '' PIPE",
  'source "$1" || exit 70',
  'with_heavy_lock "$2" -- sh -c \'printf "held\\n"; exec 1>&-; while [ -e "$1" ]; do sleep 1; done\' dash-legacy-hold "$3"',
].join('\n');

/** What a legacy hold attempt asks the shell lock for. */
export interface LegacyHoldRequest {
  /** Created here, owner-only; it must not exist. Its removal releases the hold. */
  readonly holdFile: string;
  /** What `status` names the holder and its ticket by. */
  readonly label: string;
  /** The shell lock's `HEAVY_LOCK_WAIT_SECONDS`: 0 refuses 75 while anyone holds or is ahead. */
  readonly waitSeconds: number;
  /** The shell lock's `HEAVY_LOCK_POLL_SECONDS`, 1 to 30. */
  readonly pollSeconds: number;
  /** Aborting withdraws the ticket: the holder is sent TERM and the hold file removed. */
  readonly signal: AbortSignal;
  /** Where the shell lock's own lines (`waited 3s behind 1 tickets`) go until it holds. */
  readonly report: (line: string) => void;
}

/** A legacy hold in force: the shell holder's pid, how to end it, and its exit. */
export interface LegacyHold {
  readonly pid: number;
  /** Remove the hold file: the holder releases the flock within a second. */
  release(): void;
  /** The holder's exit status once it ends. */
  readonly exited: Promise<number>;
}

/** One hold attempt's outcome; `refused` carries the shell lock's own exit code (75, 70, 64). */
export type LegacyHoldOutcome =
  | { kind: 'held'; hold: LegacyHold }
  | { kind: 'refused'; exitCode: number }
  | { kind: 'cancelled' };

function exitOf(child: ChildProcess): Promise<number> {
  return new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code, signal) => {
      if (signal !== null) resolveExit(128 + constants.signals[signal]);
      else if (code === null)
        rejectExit(new Error('shell holder ended with neither a code nor a signal'));
      else resolveExit(code);
    });
  });
}

/**
 * Queue for and take the shell lock through its own library (J12), returning once the holder
 * reports it holds the flock, the library refuses (its exit code, its stderr already printed on
 * Dash's stderr), or `signal` aborts. The holder runs in its own session with `/` as its working
 * directory, so it is neither in a job's scope nor a hold on a job's tree.
 * @throws when the hold file exists already or cannot be created: a second holder under one
 * hold file would end with the first.
 */
export async function holdLegacyLock(
  lock: LegacyLock,
  request: LegacyHoldRequest,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<LegacyHoldOutcome> {
  mkdirSync(dirname(request.holdFile), { recursive: true, mode: 0o700 });
  writeFileSync(request.holdFile, '', { flag: 'wx', mode: 0o600 });
  const release = (): void => {
    rmSync(request.holdFile, { force: true });
  };
  const child = spawn(
    'bash',
    ['-c', HOLDER, 'dash-legacy-hold', lock.library, lock.lockPath, request.holdFile],
    {
      cwd: '/',
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: environment['PATH'] ?? '/usr/bin:/bin',
        HEAVY_LOCK_LABEL: request.label,
        HEAVY_LOCK_WAIT_SECONDS: String(request.waitSeconds),
        HEAVY_LOCK_POLL_SECONDS: String(request.pollSeconds),
      },
    },
  );
  const exited = exitOf(child);
  const pid = child.pid;
  const stdout = child.stdio[1];
  const stderr = child.stdio[2];
  if (pid === undefined || !(stdout instanceof Readable) || !(stderr instanceof Readable)) {
    release();
    const status = await exited.catch(() => 70);
    return { kind: 'refused', exitCode: status === 0 ? 70 : status };
  }
  let pending = '';
  stderr.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) request.report(line);
  });
  const held = new Promise<boolean>((resolveHeld) => {
    let text = '';
    stdout.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
      if (text.includes('held\n')) resolveHeld(true);
    });
    stdout.once('close', () => {
      resolveHeld(false);
    });
  });
  const aborted = new Promise<'aborted'>((resolveAbort) => {
    if (request.signal.aborted) resolveAbort('aborted');
    request.signal.addEventListener('abort', () => {
      resolveAbort('aborted');
    });
  });
  const first = await Promise.race([
    held.then((isHeld) => (isHeld ? ('held' as const) : ('ended' as const))),
    exited.then(() => 'ended' as const),
    aborted,
  ]);
  if (first === 'held') {
    stdout.destroy();
    // Let the event loop turn once so the claim's own `waited …` line, written just before
    // `held`, is reported before the pipe closes.
    await new Promise<void>((resolveTurn) => {
      setImmediate(resolveTurn);
    });
    if (pending !== '') request.report(pending);
    stderr.destroy();
    child.unref();
    return { kind: 'held', hold: { pid, release, exited } };
  }
  if (first === 'aborted') {
    // The whole session: a waiting holder sleeps between polls, and bash defers its TERM trap
    // (ticket withdrawal, exit 143) until that foreground `sleep` ends.
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
    }
    await exited.catch(() => undefined);
    release();
    return { kind: 'cancelled' };
  }
  release();
  const status = await exited;
  // A holder that ended 0 without saying `held` broke the protocol above; it is not a refusal
  // the library made, so it is reported as the library's "cannot make sense of it".
  return { kind: 'refused', exitCode: status === 0 ? 70 : status };
}

/** The shell lock's holder as its `status` reports it. */
export type LegacyHolderState =
  { kind: 'none' } | { kind: 'claiming' } | { kind: 'held'; pid: number; label: string };

/** A waiter in the shell lock's queue as its `status` reports it, oldest first. */
export interface LegacyWaiter {
  pid: number;
  label: string;
  ageSeconds: number;
  budget: string;
}

/** The shell lock's `status`: its holder, its waiters, and the lines it printed. */
export interface LegacyQueueStatus {
  holder: LegacyHolderState;
  waiters: LegacyWaiter[];
  lines: string[];
}

/**
 * Read the shell lock's queue through its own `report_heavy_lock_status`, the reader
 * `bin/with-heavy-lock.sh status` is (J13).
 * @throws when the library refuses (a holder or queue it cannot read, exit 70) or prints a line
 * this parser does not know: an unknown queue is never reported as an empty one.
 */
export function readLegacyQueue(lock: LegacyLock): LegacyQueueStatus {
  const answer = spawnSync(
    'bash',
    [
      '-c',
      'source "$1" && report_heavy_lock_status "$2"',
      'dash-legacy-status',
      lock.library,
      lock.lockPath,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (answer.status !== 0)
    throw new Error(
      `the shell lock's status refused (exit ${String(answer.status)}): ${answer.stderr.trim()}`,
    );
  const lines = answer.stdout.split('\n').filter((line) => line !== '');
  let holder: LegacyHolderState | null = null;
  const waiters: LegacyWaiter[] = [];
  for (const line of lines) {
    if (holder === null) {
      if (line === 'heavy lock: holder none') holder = { kind: 'none' };
      else if (line === 'heavy lock: holder claiming') holder = { kind: 'claiming' };
      else {
        const held = /^heavy lock: holder pid (\d+) label (.*)$/.exec(line);
        if (held !== null) holder = { kind: 'held', pid: Number(held[1]), label: held[2] };
      }
      if (holder !== null) continue;
    }
    const waiter =
      /^heavy lock: waiter pid (\d+) label (.*) age (-?\d+)s budget (\d+s left|expired)$/.exec(
        line,
      );
    if (waiter === null)
      throw new Error(
        `the shell lock's status printed ${JSON.stringify(line)}, which Dash cannot read`,
      );
    waiters.push({
      pid: Number(waiter[1]),
      label: waiter[2],
      ageSeconds: Number(waiter[3]),
      budget: waiter[4],
    });
  }
  if (holder === null) throw new Error("the shell lock's status printed no holder line");
  return { holder, waiters, lines };
}
