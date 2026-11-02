import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { identifyProcess } from './runtime';

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
 * `held` and keeps the flock for as long as the hold file exists. The flock lives on this bash's
 * fd 9, never on Dash: Dash dying closes nothing that releases it, and whoever removes the hold
 * file (the launcher at settlement, `watch` or `resources sweep` once the job's compute settles)
 * ends it. Both its output streams go to `<hold file>.log`, never to a pipe Dash reads, so a
 * Dash that vanishes while the holder still queues cannot break the library's claim with EPIPE
 * (review H2 of PR #818): the holder claims, holds and releases on its own. Killing this bash
 * makes the kernel release the flock and leaves its holder record for the next claimant to
 * reclaim from a dead pid, the library's own rule.
 */
const HOLDER = [
  'source "$1" || exit 70',
  'with_heavy_lock "$2" -- sh -c \'printf "held\\n"; while [ -e "$1" ]; do sleep 1; done\' dash-legacy-hold "$3"',
].join('\n');

/** The log beside hold file `holdFile`: the shell holder's stdout and stderr. */
export function holdLogFile(holdFile: string): string {
  return `${holdFile}.log`;
}

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
  /** The grace past `waitSeconds` before Dash ends a holder that neither held nor ended. */
  readonly claimGraceMs?: number;
}

/** A legacy hold in force: the shell holder's pid, how to end it, and its exit. */
export interface LegacyHold {
  readonly pid: number;
  /** Remove the hold file: the holder releases the flock within a second. */
  release(): void;
  /** The holder's exit status once it ends. */
  readonly exited: Promise<number>;
}

/**
 * One hold attempt's outcome; `refused` carries the shell lock's own exit code (75, 70, 64), or
 * 70 with a `reason` when Dash itself gave up on the holder.
 */
export type LegacyHoldOutcome =
  | { kind: 'held'; hold: LegacyHold }
  | { kind: 'refused'; exitCode: number; reason?: string }
  | { kind: 'cancelled' };

/** Between looks at the holder; every bound below is counted in these. */
const POLL_MS = 50;
/** How long past its wait budget a holder may take to claim or end before Dash ends it. */
const CLAIM_GRACE_MS = 15_000;
/** Polls the log gets, once the holder holds, to show the claim's own line (diagnostics only). */
const LOG_SETTLE_POLLS = 20;

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
  const log = holdLogFile(request.holdFile);
  const release = (): void => {
    rmSync(request.holdFile, { force: true });
    rmSync(log, { force: true });
  };
  let output: number;
  try {
    output = openSync(
      log,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_APPEND,
      0o600,
    );
  } catch (cause) {
    rmSync(request.holdFile, { force: true });
    throw cause;
  }
  let child: ChildProcess;
  try {
    child = spawn(
      'bash',
      ['-c', HOLDER, 'dash-legacy-hold', lock.library, lock.lockPath, request.holdFile],
      {
        cwd: '/',
        detached: true,
        stdio: ['ignore', output, output],
        env: {
          PATH: environment['PATH'] ?? '/usr/bin:/bin',
          HEAVY_LOCK_LABEL: request.label,
          HEAVY_LOCK_WAIT_SECONDS: String(request.waitSeconds),
          HEAVY_LOCK_POLL_SECONDS: String(request.pollSeconds),
        },
      },
    );
  } finally {
    closeSync(output);
  }
  const exited = exitOf(child);
  const pid = child.pid;
  // A holder that never started has no pid to name or signal. Not a check of its own: without
  // this exit the general path below answers the same 70 once `exited` rejects (review H7, G19
  // in verify.md); `a holder that cannot start is refused 70` (legacy-lock.test.ts) pins it.
  if (pid === undefined) {
    release();
    await exited.catch(() => undefined);
    return { kind: 'refused', exitCode: 70 };
  }
  /** End the holder's whole session and remove its files; the outcome names `reason`. */
  const abandon = async (reason: string): Promise<LegacyHoldOutcome> => {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
    }
    await exited.catch(() => undefined);
    release();
    return { kind: 'refused', exitCode: 70, reason };
  };
  // The hold file names its holder's identity (pid, boot, start), so a refusal over an
  // existing one can say whose it is and whether it still runs (review K5).
  try {
    const identity = identifyProcess(pid);
    writeFileSync(
      request.holdFile,
      identity === null
        ? `${String(pid)}\n`
        : `${String(pid)} ${identity.boot} ${identity.start}\n`,
    );
  } catch (cause) {
    // Proof: without it `a hold file that cannot be written ends the holder` (legacy-lock.test.ts)
    // threw with the detached holder still queued (2026-11-02, review K2).
    return abandon(`hold file ${request.holdFile} unwritable: ${errorText(cause)}`);
  }
  let offset = 0;
  let pending = '';
  let logSaysHeld = false;
  // A function, not the variable: `drain` sets it, which narrowing cannot see.
  const sawHeldLine = (): boolean => logSaysHeld;
  /** Forward the log's new complete lines; the log is diagnostics only, so it never fails this. */
  const drain = (): void => {
    let text: string;
    try {
      text = readFileSync(log, 'utf8');
    } catch {
      // Unreadable or gone: diagnostics lost, nothing decided by them.
      return;
    }
    pending += text.slice(offset);
    offset = text.length;
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line === 'held') logSaysHeld = true;
      else request.report(line);
    }
  };
  /**
   * Whether the holder holds: the shell lock's own holder record names its pid. The library
   * writes that record only under the flock and removes it before letting go, so it is the
   * lock's own answer; the `held` line in the log is not trusted (a full disk loses it).
   */
  const holds = (): boolean => {
    try {
      return readFileSync(join(`${lock.lockPath}.d`, 'holder'), 'utf8').trim() === String(pid);
    } catch {
      return false;
    }
  };
  const ended = { status: null as number | null };
  void exited.then(
    (status) => {
      ended.status = status;
    },
    () => {
      ended.status = 70;
    },
  );
  // The library refuses 75 at its own deadline; this bound backs it, counted in polls of at
  // least POLL_MS each, so a holder that neither claims nor ends is never waited on for ever.
  const polls = Math.ceil(
    (request.waitSeconds * 1000 + (request.claimGraceMs ?? CLAIM_GRACE_MS)) / POLL_MS,
  );
  for (let poll = 0; ; poll++) {
    drain();
    // Proof: deciding by the log's `held` line made `a holder whose log cannot be written still
    // holds, by the lock record itself` (legacy-lock.test.ts) wait past its bound (2026-11-02, K2).
    if (holds()) {
      // The lock decided; the log only follows it. Give the claim's own `waited …` line, which
      // the library prints just after recording the holder, a moment to reach the report.
      for (let wait = 0; !sawHeldLine() && wait < LOG_SETTLE_POLLS; wait++) {
        await Bun.sleep(POLL_MS);
        drain();
      }
      child.unref();
      return { kind: 'held', hold: { pid, release, exited } };
    }
    if (request.signal.aborted) {
      // The whole session: a waiting holder sleeps between polls, and bash defers its TERM
      // trap (ticket withdrawal, exit 143) until that foreground `sleep` ends.
      const outcome = await abandon('cancelled');
      drain();
      return outcome.kind === 'refused' ? { kind: 'cancelled' } : outcome;
    }
    if (ended.status !== null) {
      drain();
      release();
      // A holder that ended 0 without holding broke the protocol above; it is not a refusal
      // the library made, so it is reported as the library's "cannot make sense of it".
      // Proof: without the mapping `a holder that ends 0 without holding is refused 70`
      // (legacy-lock.test.ts) returned exit 0 as a refusal (2026-11-02, H7).
      return ended.status === 0
        ? { kind: 'refused', exitCode: 70, reason: 'the shell holder ended without holding' }
        : { kind: 'refused', exitCode: ended.status };
    }
    // Proof: without the bound `a holder that neither claims nor ends is ended at its bound`
    // (legacy-lock.test.ts) never returned (2026-11-02, review K2).
    if (poll >= polls)
      return abandon(
        `the shell holder neither held nor ended within ${String(request.waitSeconds)}s and its grace`,
      );
    await Bun.sleep(POLL_MS);
  }
}

/** `cause`'s message. */
function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
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
