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

/** The `start`/`end` intervals of each name in `log`, in milliseconds. */
export function intervalsOf(log: string): Map<string, { start: number; end: number | null }> {
  const spans = new Map<string, { start: number; end: number | null }>();
  if (!existsSync(log)) return spans;
  for (const line of readFileSync(log, 'utf8').split('\n')) {
    const [event, name, at] = line.split(' ') as [string, string?, string?];
    if (name === undefined || at === undefined) continue;
    if (event === 'start') spans.set(name, { start: Number(at), end: null });
    if (event === 'end') {
      const span = spans.get(name);
      if (span !== undefined) span.end = Number(at);
    }
  }
  return spans;
}

/** Whether two closed spans overlap. */
export function overlaps(
  left: { start: number; end: number | null },
  right: { start: number; end: number | null },
): boolean {
  const leftEnd = left.end ?? Number.POSITIVE_INFINITY;
  const rightEnd = right.end ?? Number.POSITIVE_INFINITY;
  return left.start < rightEnd && right.start < leftEnd;
}

/** Poll `probe` every 50 ms until it is true or `ms` pass; throws naming `what` on timeout. */
export async function eventually(what: string, probe: () => boolean, ms = 15_000): Promise<void> {
  const until = Date.now() + ms;
  while (!probe()) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(50);
  }
}
