import { Buffer } from 'node:buffer';

import { type BatchObject, parseBlobBatch } from './blob-batch';
import type { CandidateEntry } from './read-candidate';

type Selection =
  { kind: 'read'; objects: ReadonlyMap<string, BatchObject> } | { kind: 'refused'; error: Error };

/**
 * One batch per selected entry list. Keyed by the array itself, so every consumer of one
 * candidate snapshot (including a `{ ...candidate }` copy) shares the read; a new snapshot is a
 * new key and the old one is collected with it.
 */
const selections = new WeakMap<readonly CandidateEntry[], Selection>();

function readSelection(repository: string, entries: readonly CandidateEntry[]): Selection {
  const requested = new Map<string, string>();
  for (const entry of entries) {
    if (entry.mode !== '160000' && !requested.has(entry.blob)) {
      requested.set(entry.blob, entry.path);
    }
  }
  if (requested.size === 0) return { kind: 'read', objects: new Map() };
  const invocation = Bun.spawnSync(['git', '-C', repository, 'cat-file', '--batch'], {
    // Proof (2026-10-12): without this setting, `production check ignores local Git replacement
    // objects for a selected journal blob` and `inspect-manual ignores Git replacement objects
    // for module indexes` both exit 1: the batch serves the replacement's bytes under the
    // selected identity, which the digest binding below refuses.
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    stdin: Buffer.from(`${[...requested.keys()].join('\n')}\n`, 'utf8'),
    stderr: 'pipe',
    stdout: 'pipe',
  });
  try {
    // Proof (2026-10-12): disabling this made `refuses a reader that exits early and does not
    // start a second one` report the empty output as ended early, hiding the reader's failure.
    if (invocation.exitCode !== 0) {
      const detail = invocation.stderr.toString('utf8').trim();
      throw new Error(
        `git cat-file --batch failed: ${detail.length === 0 ? `exit ${String(invocation.exitCode)}` : detail}`,
      );
    }
    return { kind: 'read', objects: parseBlobBatch(Buffer.from(invocation.stdout), requested) };
  } catch (cause) {
    // Kept, not swallowed: every later read of this selection rethrows it.
    if (!(cause instanceof Error)) throw cause;
    return { kind: 'refused', error: cause };
  }
}

/**
 * Reads one blob of a selected candidate by its object identity, never from the working tree.
 *
 * The first read of an entry list starts one `git cat-file --batch` for every non-Gitlink blob in
 * it and verifies each answer against the identity the selection named; later reads, from any
 * consumer of the same list, are served from that one read. A refused batch stays refused for the
 * list. Each call returns its own copy.
 * @throws Error when the blob is not part of `entries`, is missing from the repository, or the
 *   batch failed, ended early, named another object type or returned bytes of another identity.
 */
export function readSelectedBlob(
  repository: string,
  entries: readonly CandidateEntry[],
  blob: string,
  path: string,
): Uint8Array {
  let selection = selections.get(entries);
  if (selection === undefined) {
    selection = readSelection(repository, entries);
    // Proof (2026-10-12): dropping this made `reads every selected blob of one candidate in a
    // single cat-file batch` log four batches and the early-exit case two.
    selections.set(entries, selection);
  }
  // Proof (2026-10-12): skipping this rethrow made six refusal cases in `read-blob.test.ts` read
  // from an empty selection instead of naming the batch failure.
  if (selection.kind === 'refused') throw selection.error;
  const object = selection.objects.get(blob);
  // Proof (2026-10-12): disabling this made `refuses a blob that is not part of the selected
  // candidate` fail with a TypeError instead.
  if (object === undefined) {
    throw new Error(`selected blob ${blob} for ${path} is not part of the selected candidate`);
  }
  // Proof (2026-10-12): disabling this made `refuses a missing object for its own path and still
  // serves the others` fail with a TypeError instead of naming the blob and path.
  if (object.kind === 'missing') {
    throw new Error(`cannot read selected blob ${blob} for ${path}: missing from the repository`);
  }
  // A copy, not `Buffer#slice`, which is a view: a caller that mutated it would change the bytes
  // every later consumer of this selection reads.
  // Proof (2026-10-12): returning the view made `hands each caller its own copy of the selected
  // bytes` read six zero bytes back.
  return new Uint8Array(object.bytes);
}
