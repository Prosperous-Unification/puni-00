import { rmSync } from 'node:fs';

import type * as SqliteStoreModule from '../sqlite/open-stores';
import { format4SourceEntries } from './format4-protocol';
import { extractPredecessorSource, verifyPredecessorSource } from './predecessor-fixture';

const commit = 'b3b594dab4f0153d2ef00a2989bbeb02ea0cbbda';
let isInstalled = false;
let closing: Promise<void> | undefined;
let archive: ReturnType<typeof extractPredecessorSource> | undefined;
let provider: Promise<typeof SqliteStoreModule> | undefined;
let loads = 0;
const leases = new Map<symbol, { readonly owner: string; cause?: unknown }>();

/** Installed only by the Dash preload; importing fixture helpers never starts a process lifetime implicitly. */
export function installFormat4Lifetime(): void {
  isInstalled = true;
}

/** Refuses missing or finished suite ownership before shared source or workers are allocated. */
export function requireFormat4Lifetime(): void {
  // Proof: Task3 071 admitted a native store without the preload; 072 admitted a later store after teardown when each owner condition was independently omitted.
  if (!isInstalled || closing !== undefined)
    throw new Error('format4 provider requires an active format4-lifetime-preload.ts owner');
}

/** A source lease precedes import/open and is released only after positive native closure. Failure retains its exact source and cause through suite teardown. */
export interface Format4SourceLease {
  readonly directory: string;
  load(): Promise<typeof SqliteStoreModule>;
  release(): void;
  retain(cause: unknown): Error;
}

/** Shares only immutable verified code. Each caller still opens its own native stores with its own path, options and clock. */
export function retainFormat4Provider(owner: string): Format4SourceLease {
  requireFormat4Lifetime();
  // Proof: Task3 081 re-extracted per lease; the second actual Bun test file observed a different archive and failed the reuse assertion.
  archive ??= extractPredecessorSource({
    commit,
    label: 'format4',
    sourceEntries: format4SourceEntries,
    workerFiles: [],
  });
  const source = archive;
  const token = Symbol(owner);
  // Proof: Task3 073 omitted this lease; the actual native-open fault observed zero pending owners before throwing, despite later failure retention still installed.
  leases.set(token, { owner });
  return {
    directory: source.directory,
    async load() {
      // Proof: Task3 080 re-imported per lease; the second actual Bun test file observed moduleLoadCount=2 and failed the reuse assertion.
      if (provider === undefined) {
        // Proof: Task3 074 omitted this recheck; tampering the owned archive after extraction reached native open and released its lease instead of rejecting changed source.
        verifyPredecessorSource(source.directory, commit, format4SourceEntries);
        loads += 1;
        // Boundary: the exact pinned archive was verified immediately before import; this unchanged native store port is shared by historical tests.
        provider = import(
          source.directory +
            '/apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/open-stores.ts'
        ) as Promise<typeof SqliteStoreModule>;
      }
      return await provider;
    },
    release() {
      leases.delete(token);
    },
    retain(cause) {
      leases.set(token, { owner, cause });
      return new Error(
        `format4 provider source retained: ${source.directory}; pending owner: ${owner}`,
        { cause },
      );
    },
  };
}

/** Lifecycle witnesses distinguish archive reuse, native leases and completed teardown without exposing mutable ownership state. */
export function inspectFormat4Provider() {
  return archive === undefined
    ? undefined
    : {
        directory: archive.directory,
        sourceCommit: commit,
        sourceFiles: [...archive.sourceFiles],
        moduleLoadCount: loads,
        leaseCount: leases.size,
        isClosing: closing !== undefined,
      };
}

/** Runs once at the preload's worker-wide teardown. Pending native leases retain the archive and original causes; successful teardown removes only this owned archive. */
export function closeFormat4Lifetime(): Promise<void> {
  closing ??= Promise.resolve().then(() => {
    if (archive === undefined) return;
    const directory = archive.directory;
    // Proof: Task3 075 omitted this barrier; an actual native-close failure then let preload teardown report success and delete the retained source.
    if (leases.size !== 0)
      throw new AggregateError(
        [...leases.values()].map(
          (lease) =>
            new Error(
              `format4 provider source retained: ${directory}; ${String(leases.size)} pending owners; native closure unestablished: ${lease.owner}`,
              { cause: lease.cause },
            ),
        ),
        `format4 provider source retained: ${archive.directory}; ${String(leases.size)} pending owners`,
      );
    rmSync(archive.directory, { recursive: true, force: true });
  });
  return closing;
}
