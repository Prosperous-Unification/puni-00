import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LegacyLock } from './legacy-lock';

/** This repository's own shell lock library, which every legacy-lock test drives for real. */
export const LOCK_LIBRARY = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'bin',
  'heavy-lock-lib.sh',
);

/** A private lock at `<directory>/heavy.lock` through the real library. */
export function privateLegacyLock(directory: string): LegacyLock {
  return { library: LOCK_LIBRARY, lockPath: join(directory, 'heavy.lock') };
}

/** A legacy caller: `with_heavy_lock` with an explicit path, as an older checkout's launcher. */
export interface LegacyCaller {
  readonly pid: number;
  /** The caller's exit status. */
  readonly exited: Promise<number>;
}

/**
 * Start a legacy `with_heavy_lock` caller on `lock` that appends `start <name> <ms>` and
 * `end <name> <ms>` (wall milliseconds) to `log` around a `seconds`-long sleep.
 */
export function startLegacyCaller(
  lock: LegacyLock,
  name: string,
  log: string,
  options: { waitSeconds: number; seconds: number; pollSeconds?: number },
): LegacyCaller {
  const child = spawn(
    'bash',
    [
      '-c',
      'source "$1" && with_heavy_lock "$2" -- sh -c \'echo "start $1 $(date +%s%3N)" >> "$2"; sleep "$3"; echo "end $1 $(date +%s%3N)" >> "$2"\' legacy "$3" "$4" "$5"',
      'legacy-caller',
      lock.library,
      lock.lockPath,
      name,
      log,
      String(options.seconds),
    ],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
        HEAVY_LOCK_LABEL: `legacy:${name}`,
        HEAVY_LOCK_WAIT_SECONDS: String(options.waitSeconds),
        HEAVY_LOCK_POLL_SECONDS: String(options.pollSeconds ?? 1),
      },
    },
  );
  const exited = new Promise<number>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code, signal) => {
      resolveExit(code ?? (signal === null ? -1 : 128));
    });
  });
  if (child.pid === undefined) throw new Error('legacy caller did not start');
  return { pid: child.pid, exited };
}

/**
 * A run's span in an append-only log: `start` and `end` are the positions of its lines, which
 * order every writer by the instant its append happened (each line is one `O_APPEND` write);
 * `startMs` and `endMs` are the wall clock the writer read, kept for diagnostics only.
 */
export interface Span {
  start: number;
  end: number | null;
  startMs: number;
  endMs: number | null;
}

/**
 * The span of each name in `log` (`start <name> <ms>` and `end <name> <ms>` lines). Order is
 * read from the positions of the lines, never from the clocks the writers read: a wall clock a
 * runner steps backwards, or two readings within one millisecond, cannot fake or hide an
 * overlap (CI of #825). A name started twice, or ended unstarted, is a broken log and throws.
 */
export function intervalsOf(log: string): Map<string, Span> {
  const spans = new Map<string, Span>();
  if (!existsSync(log)) return spans;
  const lines = readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line !== '');
  for (const [position, line] of lines.entries()) {
    const [event, name, at] = line.split(' ') as [string, string?, string?];
    if (name === undefined || at === undefined || (event !== 'start' && event !== 'end'))
      throw new Error(`span log ${log} line ${String(position + 1)} malformed: ${line}`);
    const span = spans.get(name);
    if (event === 'start') {
      if (span !== undefined) throw new Error(`span log ${log}: ${name} started twice`);
      spans.set(name, { start: position, end: null, startMs: Number(at), endMs: null });
      continue;
    }
    if (span?.end !== null)
      throw new Error(`span log ${log}: ${name} ended without a start, or twice`);
    span.end = position;
    span.endMs = Number(at);
  }
  return spans;
}

/**
 * Whether two finished spans overlap: one started before the other's end line was written.
 * Positions are distinct, so spans that merely touch never overlap.
 * @throws when either span has no end: an unfinished run is not evidence either way.
 */
export function overlaps(left: Span, right: Span): boolean {
  if (left.end === null || right.end === null)
    throw new Error('a span without an end line cannot be judged for overlap');
  return left.start < right.end && right.start < left.end;
}

/** Poll `probe` every 50 ms until it is true or `ms` pass; throws naming `what` on timeout. */
export async function eventually(what: string, probe: () => boolean, ms = 15_000): Promise<void> {
  const until = Date.now() + ms;
  while (!probe()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(50);
  }
}
