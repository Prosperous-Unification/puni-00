import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { assertInitialAccessSourceAllowed } from './initial-access-admission';

/** Reads a poller marker once: absence is legitimate, every other failed observation refuses. */
async function readMarker(state: string, name: string): Promise<string | undefined> {
  const path = join(state, name);
  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw new Error('cannot read initial-access marker: ' + path, { cause: error });
  }
  if (!entry.isFile() || (entry.mode & 0o444) === 0)
    throw new Error('unreadable initial-access marker: ' + path);
  const bytes = await readFile(path);
  const text = bytes.toString('utf8');
  if (!/^[0-9a-f]{40}\n?$/.test(text)) throw new Error('malformed initial-access marker: ' + path);
  return text.trimEnd();
}

/**
 * Installed, DB-free admission before poller marker publication, fast return or recovery reset.
 * Prints exactly three trusted marker tokens; '-' represents a legitimately absent marker.
 * @throws For malformed arguments, unreadable markers or any unsupported selected revision.
 */
export async function admitPollerSource(args: readonly string[]): Promise<string> {
  // Boundary: only the validated four-argument branch below uses these dense CLI values as paths.
  const [repository, current, target, state] = args;
  if (
    args.length !== 4 ||
    !isAbsolute(repository) ||
    !/^[0-9a-f]{40}$/.test(current) ||
    !/^[0-9a-f]{40}$/.test(target) ||
    !isAbsolute(state)
  )
    throw new Error(
      'usage: initial-access-cli <absolute-repository> <current-sha> <target-sha> <absolute-state>',
    );
  const proven = await readMarker(state, 'last-proven');
  const synced = await readMarker(state, 'last-synced');
  const awaiting = await readMarker(state, 'awaiting-recreate');
  await assertInitialAccessSourceAllowed(
    repository,
    synced === undefined ? [current, target] : [current, target, synced],
  );
  return [proven ?? '-', synced ?? '-', awaiting ?? '-'].join(' ');
}

if (import.meta.main) console.log(await admitPollerSource(process.argv.slice(2)));
