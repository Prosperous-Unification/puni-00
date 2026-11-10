import { Buffer } from 'node:buffer';

import { parseBlobBatch } from '../inventory/blob-batch';
import {
  type CandidateEntry,
  type CandidateSnapshot,
  parseCommittedTreeEntries,
} from '../inventory/read-candidate';
import { type PreparationGitContext, runPreparationGit } from './preparation-git';

/** Private captured bytes back every fresh metadata/file read; returned JS values remain mutable. */
export interface CommittedSource {
  readSnapshot(): CandidateSnapshot;
  readFile(path: string): Uint8Array;
}
export type CaptureOutcome =
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 }
  | { readonly kind: 'captured'; readonly source: CommittedSource };

function readIdentity(bytes: Uint8Array): string {
  const identity = // Proof: capture-identity-utf8; `preserves invalid UTF8 tree identity decoding failure` failed under its recorded source fault and passed after restoration.
    new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\n$/u, '');
  // Proof: capture-identity-grammar; `refuses malformed tree identity returned with status0` failed under its recorded source fault and passed after restoration.
  if (!/^[0-9a-f]{40}$/u.test(identity))
    throw new Error('committed source query returned malformed identity');
  return identity;
}
function assertPaths(entries: readonly CandidateEntry[]): void {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (
      entry.path.split('/').some(
        (component) =>
          // Proof: capture-path-empty; `refuses noncanonical captured path "/absolute"` failed under its recorded source fault and passed after restoration.
          component === '' || // Proof: capture-path-dot; `refuses noncanonical captured path "a/./dot"` failed under its recorded source fault and passed after restoration.
          component === '.' || // Proof: capture-path-parent; `refuses noncanonical captured path "../escape"` failed under its recorded source fault and passed after restoration.
          component === '..',
      )
    )
      throw new Error('committed source path is not canonical: ' + entry.path);
    // Proof: capture-path-duplicate; `refuses duplicate captured paths before batching` failed under its recorded source fault and passed after restoration.
    if (paths.has(entry.path))
      throw new Error('committed source path is duplicated: ' + entry.path);
    paths.add(entry.path);
    // Proof: capture-gitlink; `refuses committed gitlinks before batching` failed under its recorded source fault and passed after restoration.
    if (entry.mode === '160000')
      throw new Error('current committed source capture does not support gitlinks');
  }
  for (const path of paths) {
    const components = path.split('/');
    for (let depth = 1; depth < components.length; depth++)
      // Proof: capture-path-ancestor; `rejects reverse-ordered file-ancestor collisions before batching` failed under its recorded source fault and passed after restoration.
      if (paths.has(components.slice(0, depth).join('/')))
        throw new Error('committed source path has a file ancestor: ' + path);
  }
}

/**
 * Capture exact selected commit/tree tuples and hash-verified blob bytes without reading the
 * worktree or reselecting HEAD. The caller supplies source authority established by preparation
 * selection; Git metadata/object mappings and runtime stay stable trusted prerequisites. Each
 * query reuses its existing child owner, including typed batch stdin and cancellation cleanup.
 * Snapshot/file capabilities return copies, so callers cannot mutate authoritative captured
 * state. This creates no physical snapshot, output directories, build roles or activation.
 * @throws for failed queries, noncanonical/conflicting paths, gitlinks, malformed batch data,
 * absent/substituted blobs and unknown file reads; owner and decoding failures propagate.
 */
export async function captureCommittedSource(
  revision: string,
  context: PreparationGitContext,
): Promise<CaptureOutcome> {
  const captured: PreparationGitContext = {
    // Proof: capture-repository-capture; `captures repository and environment before the first owned await` failed under its recorded source fault and passed after restoration.
    repository: context.repository,
    runtime: {
      directory: context.runtime.directory,
      // Proof: capture-environment-capture; `captures repository and environment before the first owned await` failed under its recorded source fault and passed after restoration.
      environment: { ...context.runtime.environment },
    },
    subscribeInterrupts: context.subscribeInterrupts,
  };
  const cancellation: { status: 130 | 143 | undefined } = { status: undefined };
  const unsubscribe = captured.subscribeInterrupts((signal) => {
    cancellation.status ??= signal === 'SIGINT' ? 130 : 143;
  });
  // Proof: capture-prior-unsubscribe; `returns prior cancellation before malformed capture revision validation` failed under its recorded source fault and passed after restoration.
  unsubscribe();
  // Proof: capture-prior-cancel; `returns prior cancellation before malformed capture revision validation` failed under its recorded source fault and passed after restoration.
  if (cancellation.status !== undefined) return { kind: 'cancelled', status: cancellation.status };
  // Proof: capture-full-revision; `refuses nonfull capture revision "HEAD" before Git` failed under its recorded source fault and passed after restoration.
  if (!/^[0-9a-f]{40}$/u.test(revision))
    throw new Error('capture revision must be a full commit identity');
  const commit = await runPreparationGit(
    [
      'rev-parse',
      '--verify',
      '--end-of-options', // Proof: capture-selected-commit; `retains explicitly selected earlier commit and never silently reselects HEAD` failed under its recorded source fault and passed after restoration.
      revision + '^{commit}',
    ],
    captured,
  );
  // Proof: capture-cancel-commit; `owns commit capture cancellation before parsing partial output or starting later queries` failed under its recorded source fault and passed after restoration.
  if (commit.kind === 'cancelled') return { kind: 'cancelled', status: commit.status };
  // Proof: capture-commit-status; `refuses failed commit capture query with original diagnostics` failed under its recorded source fault and passed after restoration.
  if (commit.status !== 0)
    throw new Error('cannot resolve capture commit: ' + Buffer.from(commit.stderr).toString());
  // Proof: capture-commit-identity; `refuses substituted resolved commit before tree capture` failed under its recorded source fault and passed after restoration.
  if (readIdentity(commit.stdout) !== revision)
    throw new Error('capture revision resolves to another commit');
  const selected = await runPreparationGit(
    [
      'rev-parse',
      '--verify',
      '--end-of-options', // Proof: capture-selected-tree; `retains explicitly selected earlier commit and never silently reselects HEAD` failed under its recorded source fault and passed after restoration.
      revision + '^{tree}',
    ],
    captured,
  );
  // Proof: capture-cancel-selected; `owns tree capture cancellation before parsing partial output or starting later queries` failed under its recorded source fault and passed after restoration.
  if (selected.kind === 'cancelled') return { kind: 'cancelled', status: selected.status };
  // Proof: capture-tree-status; `refuses failed tree capture query with original diagnostics` failed under its recorded source fault and passed after restoration.
  if (selected.status !== 0)
    throw new Error('cannot resolve capture tree: ' + Buffer.from(selected.stderr).toString());
  const tree = readIdentity(selected.stdout);
  const listed = await runPreparationGit(
    // Proof: capture-listed-tree; `retains explicitly selected earlier commit and never silently reselects HEAD` failed under its recorded source fault and passed after restoration.
    ['ls-tree', '-r', '-z', '--full-tree', tree],
    captured,
  );
  // Proof: capture-cancel-listed; `owns entries capture cancellation before parsing partial output or starting later queries` failed under its recorded source fault and passed after restoration.
  if (listed.kind === 'cancelled') return { kind: 'cancelled', status: listed.status };
  // Proof: capture-entries-status; `refuses failed entries capture query with original diagnostics` failed under its recorded source fault and passed after restoration.
  if (listed.status !== 0)
    throw new Error('cannot list captured tree: ' + Buffer.from(listed.stderr).toString());
  const entries = parseCommittedTreeEntries(listed.stdout, tree);
  assertPaths(entries);
  const requested = new Map<string, string>();
  for (const entry of entries)
    if (!requested.has(entry.blob)) requested.set(entry.blob, entry.path);
  const files = new Map<string, Uint8Array>();
  // Proof: capture-empty-tree; `captures a real empty tree without starting a blob reader` failed under its recorded source fault and passed after restoration.
  if (requested.size !== 0) {
    const batch = await runPreparationGit(
      ['cat-file', '--batch'],
      captured,
      Buffer.from([...requested.keys()].join('\n') + '\n'),
    );
    // Proof: capture-cancel-batch; `returns cancellation before parsing a captured batch prefix and confirms group absence` failed under its recorded source fault and passed after restoration.
    if (batch.kind === 'cancelled') return { kind: 'cancelled', status: batch.status };
    // Proof: capture-batch-status; `refuses failed batch capture query with original diagnostics` failed under its recorded source fault and passed after restoration.
    if (batch.status !== 0)
      throw new Error('cannot read captured blob batch: ' + Buffer.from(batch.stderr).toString());
    const objects = parseBlobBatch(Buffer.from(batch.stdout), requested);
    for (const entry of entries) {
      const object = objects.get(entry.blob);
      // Proof: capture-absent-object; `refuses absent parsed object after a broken batch decoder instead of manufacturing empty bytes` failed under its recorded source fault and passed after restoration.
      if (object === undefined) throw new Error('captured blob absent from batch: ' + entry.path);
      // Proof: capture-missing-object; `refuses batch missing object rather than returning partial captured source` failed under its recorded source fault and passed after restoration.
      if (object.kind === 'missing')
        throw new Error('captured blob missing from repository: ' + entry.path);
      files.set(entry.path, object.bytes);
    }
  }
  return {
    kind: 'captured',
    source: {
      readSnapshot: () => ({
        selection: { kind: 'committed', revision, tree },
        // Proof: capture-entry-copy; `returns fresh snapshot and file copies without aliases across paths or callers` failed under its recorded source fault and passed after restoration.
        // Proof: capture-array-copy; `returns fresh snapshot and file copies without aliases across paths or callers` failed under its recorded source fault and passed after restoration.
        entries: entries.map((entry) => ({ ...entry })),
        untracked: [],
      }),
      readFile: (path) => {
        const bytes = files.get(path);
        // Proof: capture-unknown-file; `returns fresh snapshot and file copies without aliases across paths or callers` failed under its recorded source fault and passed after restoration.
        if (bytes === undefined) throw new Error('captured path is absent: ' + path);
        // Proof: capture-file-copy; `returns fresh snapshot and file copies without aliases across paths or callers` failed under its recorded source fault and passed after restoration.
        return new Uint8Array(bytes);
      },
    },
  };
}
