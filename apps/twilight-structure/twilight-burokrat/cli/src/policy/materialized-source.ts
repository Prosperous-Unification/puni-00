import { realpathSync } from 'node:fs';
import { mkdir, open, symlink } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

import type { LintInterrupt, SubscribeLintInterrupts } from '../lint-interrupts';
import type { CommittedSource } from './committed-source';
import { reservePreparationDirectory } from './preparation-directory';
import type { PreparationSource } from './preparation-source';

export interface MaterializationContext {
  readonly callerDirectory: string;
  readonly selection: Extract<PreparationSource, { kind: 'ready' }>;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}
export type MaterializationOutcome =
  | { readonly kind: 'materialized'; readonly directory: string }
  | {
      readonly kind: 'cancelled';
      readonly status: 130 | 143;
      readonly directory: string | undefined;
    };

/** The original failure remains inspectable; an owned partial root is never deleted implicitly. */
export class MaterializationFailure extends Error {
  constructor(
    readonly directory: string | undefined,
    cause: unknown,
  ) {
    super(
      'source materialization failed' +
        (directory === undefined
          ? ' before output ownership'
          : '; retained directory: ' + directory) +
        ': ' +
        (cause instanceof Error ? cause.message : String(cause)),
      { cause },
    );
    this.name = 'MaterializationFailure';
  }
}

/**
 * Git2.43.0's narrow HFS .git predicate, not general Unicode normalization. Ordinary BOM/Unicode
 * spelling is preserved. {@link https://raw.githubusercontent.com/git/git/v2.43.0/utf8.c}
 */
function isGitMetadata(component: string): boolean {
  // Proof: material-metadata-200c; `refuses declared Git HFS metadata equivalence 200c` failed under its recorded source fault and passed after restoration.
  // Proof: material-metadata-202a; `refuses declared Git HFS metadata equivalence 202a` failed under its recorded source fault and passed after restoration.
  // Proof: material-metadata-206a; `refuses declared Git HFS metadata equivalence 206a` failed under its recorded source fault and passed after restoration.
  // Proof: material-metadata-feff; `refuses declared Git HFS metadata equivalence feff` failed under its recorded source fault and passed after restoration.
  // Proof: material-metadata-case; `refuses Git metadata path "folder/.GiT/HEAD" before output writes` failed under its recorded source fault and passed after restoration.
  return /^[.][gG][iI][tT]$/u.test(
    component.replace(/[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/gu, ''),
  );
}
function isWithin(root: string, path: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}

/**
 * Materialize captured bytes into one freshly reserved private POSIX directory. The existing
 * parent is resolved natively before the leaf is joined; candidate, toolkit, frozen runtime,
 * actual closure and every selected authority-file target stay protected. All logical parents
 * are created exactly once without accepting EEXIST, then regular files exclusively, then links.
 * Native target validation precedes ready; no later write can traverse a created link.
 * The caller owns interruption and later cleanup. Awaited writes/chmod/close preserve their
 * failures even after cancellation, and partial roots remain visible. Stable private-root and
 * authority metadata are premises; this is not a concurrent hostile-filesystem sandbox.
 * Git's narrow HFS metadata policy is enforced; native Mac collisions remain separately qualified.
 * @throws MaterializationFailure with original/aggregate cause and any retained owned root.
 * Interruption-registration failures propagate before ownership. No dependency installation,
 * source build, activation or archive is performed here.
 */
export async function materializeSource(
  source: CommittedSource,
  destination: string,
  context: MaterializationContext,
): Promise<MaterializationOutcome> {
  const callerDirectory = context.callerDirectory,
    selection = context.selection,
    subscribeInterrupts = context.subscribeInterrupts;
  let first: LintInterrupt | undefined, owned: string | undefined;
  const unsubscribe = subscribeInterrupts((signal) => {
    // Proof: material-first-reason; `retains first cancellation after a completed write and closes before returning` failed under its recorded source fault and passed after restoration.
    first ??= signal;
  });
  const readCancellation = ():
    Extract<MaterializationOutcome, { kind: 'cancelled' }> | undefined =>
    first === undefined
      ? undefined
      : {
          kind: 'cancelled',
          // Proof: material-cancel-status; `honors cancellation recorded by captured metadata before any output reservation` failed under its recorded source fault and passed after restoration.
          status: first === 'SIGINT' ? 130 : 143,
          directory: owned,
        };
  async function operation(): Promise<MaterializationOutcome> {
    const prior = readCancellation();
    // Proof: material-prior-cancel; `returns prior cancellation before reading malformed source or absent parent` failed under its recorded source fault and passed after restoration.
    if (prior !== undefined) return prior;
    const snapshot = source.readSnapshot(),
      // Proof: material-read-capability; `captures paths, selected authority and read capability before reservation awaits` failed under its recorded source fault and passed after restoration.
      readFile = source.readFile.bind(source);
    const files: { path: string; mode: 0o644 | 0o755 }[] = [],
      links: { path: string; target: string }[] = [],
      parents = new Set<string>();
    for (const entry of snapshot.entries) {
      const components = entry.path.split('/');
      if (
        // Proof: material-metadata; `refuses Git metadata path ".git/config" before output writes` failed under its recorded source fault and passed after restoration.
        components.some(isGitMetadata)
      )
        throw new Error('captured source path contains Git metadata: ' + entry.path);
      for (let depth = 1; depth < components.length; depth++)
        parents.add(components.slice(0, depth).join('/'));
      if (entry.mode === '120000') {
        const target = new TextDecoder('utf-8', {
          // Proof: material-link-utf8; `refuses invalid UTF8 link target before output reservation` failed under its recorded source fault and passed after restoration.
          // Proof: material-link-bom; `materializes exact binary bytes, executable modes, Unicode BOM names and captured symlinks` failed under its recorded source fault and passed after restoration.
          fatal: true,
          ignoreBOM: true,
        }).decode(readFile(entry.path));
        if (
          // Proof: material-link-empty; `refuses empty link target before output reservation` failed under its recorded source fault and passed after restoration.
          target === '' || // Proof: material-link-nul; `refuses NUL link target before output reservation` failed under its recorded source fault and passed after restoration.
          target.includes('\0') || // Proof: material-link-absolute; `refuses absolute link target before output reservation` failed under its recorded source fault and passed after restoration.
          isAbsolute(target)
        )
          throw new Error('captured source link target is empty, NUL or absolute: ' + entry.path);
        links.push({ path: entry.path, target });
      } else if (entry.mode === '100644' || entry.mode === '100755')
        files.push({ path: entry.path, mode: entry.mode === '100755' ? 0o755 : 0o644 });
      // Proof: material-mode-refusal; `refuses unsupported captured mode rather than silently omitting a trusted entry` failed under its recorded source fault and passed after restoration.
      else throw new Error('captured source has unsupported materialization mode: ' + entry.path);
    }
    const reserved = await reservePreparationDirectory(destination, {
      callerDirectory,
      selection,
      readCancellation,
      otherDirectories: [],
      recordOwnership: (directory) => {
        owned = directory;
      },
    });
    if (reserved.kind === 'cancelled') return { ...reserved, directory: owned };
    owned = reserved.directory;
    const root = owned;
    const directories = [...parents].sort(
      (left, right) =>
        left.split('/').length - right.split('/').length ||
        (left < right ? -1 : left > right ? 1 : 0),
    );
    // Proof: material-parent-cancel; `creates no captured parent directory after cancellation during root reservation` failed under its recorded source fault and passed after restoration.
    for (const directory of directories) {
      const cancelled = readCancellation();
      if (cancelled !== undefined) return cancelled;
      // Proof: material-fresh-parents; `refuses a newly occupied logical parent rather than merging directories` failed under its recorded source fault and passed after restoration.
      await mkdir(join(root, ...directory.split('/')), { mode: 0o700 });
    }
    // Proof: material-file-cancel; `retains first cancellation after a completed write and closes before returning` failed under its recorded source fault and passed after restoration.
    for (const file of files) {
      const cancelled = readCancellation();
      if (cancelled !== undefined) return cancelled;
      const descriptor = await open(
        join(root, ...file.path.split('/')), // Proof: material-exclusive-file; `exclusive file creation preserves a dependency-injected collision sentinel` failed under its recorded source fault and passed after restoration.
        'wx',
        0o600,
      );
      let writeFailure: { cause: unknown } | undefined;
      try {
        // Proof: material-write-cancel; `awaits descriptor close without payload writes when cancellation arrives during open` failed under its recorded source fault and passed after restoration.
        if (first === undefined) await descriptor.writeFile(readFile(file.path));
        // Proof: material-chmod-cancel; `retains first cancellation after a completed write and closes before returning` failed under its recorded source fault and passed after restoration.
        if (first === undefined)
          // Proof: material-file-mode; `materializes exact binary bytes, executable modes, Unicode BOM names and captured symlinks` failed under its recorded source fault and passed after restoration.
          await descriptor.chmod(file.mode);
      } catch (cause) {
        writeFailure = { cause };
      }
      try {
        // Proof: material-await-close; `keeps the API pending while an opened native descriptor close is gated` failed under its recorded source fault and passed after restoration.
        await descriptor.close();
      } catch (cause) {
        // Proof: material-write-close-causes; `preserves both write failure and later close failure after native descriptor settlement` failed under its recorded source fault and passed after restoration.
        if (writeFailure !== undefined)
          throw new AggregateError(
            [writeFailure.cause, cause],
            'source write/chmod and descriptor close failed',
            { cause },
          );
        throw cause;
      }
      // Proof: material-write-failure; `retains partial root and original write-failure instead of returning cancellation or success` failed under its recorded source fault and passed after restoration.
      if (writeFailure !== undefined) throw writeFailure.cause;
    }
    // Proof: material-link-cancel; `creates no captured link after cancellation during the last regular write` failed under its recorded source fault and passed after restoration.
    // Proof: material-links-after-files; `retains link failure after every regular descriptor has closed` failed under its recorded source fault and passed after restoration.
    for (const link of links) {
      const cancelled = readCancellation();
      if (cancelled !== undefined) return cancelled;
      await symlink(link.target, join(root, ...link.path.split('/')));
    }
    // Proof: material-validation-cancel; `returns cancellation after link creation before validating an incomplete retained view` failed under its recorded source fault and passed after restoration.
    for (const link of links) {
      const cancelled = readCancellation();
      if (cancelled !== undefined) return cancelled;
      const target = // Proof: material-native-link; `rejects an escaping native symlink chain after all regular writes without changing external bytes` failed under its recorded source fault and passed after restoration.
        realpathSync.native(join(root, ...link.path.split('/')));
      // Proof: material-link-containment; `rejects an escaping native symlink chain after all regular writes without changing external bytes` failed under its recorded source fault and passed after restoration.
      if (!isWithin(root, target))
        throw new Error('materialized source link resolves outside the owned root: ' + link.path);
    }
    return { kind: 'materialized', directory: root };
  }
  let settled:
    { kind: 'fulfilled'; outcome: MaterializationOutcome } | { kind: 'rejected'; cause: unknown };
  try {
    settled = { kind: 'fulfilled', outcome: await operation() };
  } catch (cause) {
    settled = { kind: 'rejected', cause };
  }
  try {
    // Proof: material-release; `preserves an interruption release failure after otherwise successful materialization` failed under its recorded source fault and passed after restoration.
    unsubscribe();
  } catch (cause) {
    settled = {
      kind: 'rejected',
      cause:
        // Proof: material-release-causes; `preserves both operation and release failures without masking either cause` failed under its recorded source fault and passed after restoration.
        settled.kind === 'rejected'
          ? new AggregateError(
              [settled.cause, cause],
              'source materialization and interruption release failed',
            )
          : cause,
    };
  }
  // Proof: material-reject-before-cancel; `does not mask release failure as prior controlled cancellation` failed under its recorded source fault and passed after restoration.
  if (settled.kind === 'rejected') throw new MaterializationFailure(owned, settled.cause);
  const cancelled = readCancellation();
  // Proof: material-terminal-cancel; `honors a recorded control delivered while releasing the subscription before terminal success` failed under its recorded source fault and passed after restoration.
  if (cancelled !== undefined) return cancelled;
  return settled.outcome;
}
