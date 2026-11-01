import { rmSync } from 'node:fs';

import { format5SourceEntries } from './format5-protocol';
import type { HistoricalSqliteModule } from './predecessor-fixture';
import { extractPredecessorSource, verifyPredecessorSource } from './predecessor-fixture';

const commit = 'c12bb0e58215de3ba0c3da98a2198773d654a29c';
let isInstalled = false;
let closing: Promise<void> | undefined;
let archive: ReturnType<typeof extractPredecessorSource> | undefined;
let provider: Promise<HistoricalSqliteModule> | undefined;
let loads = 0;
const leases = new Map<symbol, { readonly owner: string; cause?: unknown }>();

/** Installed only by the Dash preload; importing fixture helpers never starts a process lifetime implicitly. */
export function installFormat5Lifetime(): void {
  isInstalled = true;
}

/** Refuses missing or finished suite ownership before shared source or workers are allocated. */
export function requireFormat5Lifetime(): void {
  // Proof: remaining-pool-owner-fence broke “format5 provider process owns missing owner”; exact source hash restored.
  if (!isInstalled || closing !== undefined)
    throw new Error('format5 provider requires an active format5-lifetime-preload.ts owner');
}

/** A source lease precedes import/open and is released only after positive native closure. Failure retains its exact source and cause through suite teardown. */
export interface Format5SourceLease {
  readonly directory: string;
  load(): Promise<HistoricalSqliteModule>;
  release(): void;
  retain(cause: unknown): Error;
}

/** Shares only immutable verified code. Each caller still opens its own native stores with its own path, options and clock. */
export function retainFormat5Provider(owner: string): Format5SourceLease {
  requireFormat5Lifetime();
  archive ??= extractPredecessorSource({
    commit,
    label: 'format5',
    sourceEntries: format5SourceEntries,
    workerFiles: [],
  });
  const source = archive;
  const token = Symbol(owner);
  leases.set(token, { owner });
  return {
    directory: source.directory,
    async load() {
      // Proof: remaining-pool-module-reuse broke “format5 provider process owns shared source”; exact source hash restored.
      if (provider === undefined) {
        verifyPredecessorSource(source.directory, commit, format5SourceEntries);
        loads += 1;
        // Boundary: the exact pinned archive was verified immediately before import; this explicit historical24-method port excludes successor write operations.
        provider = import(
          source.directory +
            '/apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/open-stores.ts'
        ) as Promise<HistoricalSqliteModule>;
      }
      return await provider;
    },
    release() {
      leases.delete(token);
    },
    retain(cause) {
      leases.set(token, { owner, cause });
      return new Error(
        `format5 provider source retained: ${source.directory}; pending owner: ${owner}`,
        { cause },
      );
    },
  };
}

/** Lifecycle witnesses distinguish archive reuse, native leases and completed teardown without exposing mutable ownership state. */
export function inspectFormat5Provider() {
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
export function closeFormat5Lifetime(): Promise<void> {
  closing ??= Promise.resolve().then(() => {
    if (archive === undefined) return;
    const directory = archive.directory;
    // Proof: remaining-pool-pending-lease broke “format5 provider process owns pending source”; exact source hash restored.
    if (leases.size !== 0)
      throw new AggregateError(
        [...leases.values()].map(
          (lease) =>
            new Error(
              `format5 provider source retained: ${directory}; ${String(leases.size)} pending owners; native closure unestablished: ${lease.owner}`,
              { cause: lease.cause },
            ),
        ),
        `format5 provider source retained: ${archive.directory}; ${String(leases.size)} pending owners`,
      );
    rmSync(archive.directory, { recursive: true, force: true });
  });
  return closing;
}
