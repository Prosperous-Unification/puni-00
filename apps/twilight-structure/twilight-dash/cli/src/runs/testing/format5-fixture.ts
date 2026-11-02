import { FORMAT5_IDENTITY } from '../sqlite/format';
import type { SqliteOptions } from '../sqlite/open-stores';
import { constructFixture } from './construct-fixture';
import {
  decodeFormat5Envelope,
  decodeFormat5Response,
  format5SourceEntries,
} from './format5-protocol';
import {
  type Format5SourceLease,
  requireFormat5Lifetime,
  retainFormat5Provider,
} from './format5-provider';
import type { HistoricalSqliteModule } from './predecessor-fixture';
import { createPredecessorFixture, verifyPredecessorSource } from './predecessor-fixture';

const commit = 'c12bb0e58215de3ba0c3da98a2198773d654a29c';
/** Audits this exact predecessor source without loading current production modules. */
export function verifyFormat5Source(directory: string) {
  // Proof: genuine5-source-verifier broke “format5 source verifier rejects an actually rewritten c12 archive”; exact source hash restored.
  return verifyPredecessorSource(directory, commit, format5SourceEntries);
}
/** Loads the genuine pinned provider before exposing its already-open writer. */
export async function createFormat5Fixture(path: string, mode: 'bootstrap' | 'open' = 'bootstrap') {
  return await createPredecessorFixture(
    {
      commit,
      label: 'format5',
      identity: FORMAT5_IDENTITY,
      sourceEntries: format5SourceEntries,
      workerFiles: ['format5-worker.ts', 'format5-protocol.ts'],
      decodeEnvelope: decodeFormat5Envelope,
      decodeResponse: decodeFormat5Response,
    },
    path,
    mode,
  );
}
export { settleFixture } from './construct-fixture';
export type {
  Format5Capture,
  Format5Command,
  Format5Mutation,
  Format5Population,
  SqliteCaptureCell,
} from './format5-protocol';

/** Snapshots caller options before source acquisition and invokes the verified pinned native bootstrap/open directly. The original clock remains live. No fixed-recipe worker is allocated; the source lease lasts through positive native closure and is retained on uncertain construction/closure failure. */
export async function openFormat5Stores(
  options: SqliteOptions,
  mode: 'bootstrap' | 'open' = 'open',
) {
  // Proof: Task4 option-forwarding changed only the forwarded capacity from 3 to 1; the actual native configuration assertion failed. Exact source restoration passed custom bootstrap/reopen and original replay.
  const captured = { ...options };
  requireFormat5Lifetime();
  const source = retainFormat5Provider(captured.path);
  return await openNativeFormat5Stores(null, captured, source, mode);
}

/** Uses one suite-owned immutable provider module while preserving this independently archived worker's lifecycle. */
export async function openPooledFormat5Stores(
  fixture: Awaited<ReturnType<typeof createFormat5Fixture>>,
  options: SqliteOptions,
) {
  const source = await constructFixture(
    () => retainFormat5Provider(options.path),
    [() => fixture.close()],
  );
  return await openNativeFormat5Stores(fixture, options, source);
}

/** Isolated source owner for native/import boundary proofs; ordinary historical cases use the bounded suite-owned provider. */
export async function openVerifiedFormat5Stores(
  fixture: Awaited<ReturnType<typeof createFormat5Fixture>>,
  options: SqliteOptions,
) {
  const release = fixture.retainSource('format5 in-process provider');
  return await openNativeFormat5Stores(fixture, options, {
    directory: fixture.sourceDirectory,
    async load() {
      // Boundary: the pinned module was hash-verified by the worker handshake; the historical24-method port excludes successor write operations.
      return (await import(
        fixture.sourceDirectory +
          '/apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/open-stores.ts'
      )) as HistoricalSqliteModule;
    },
    release,
    retain(cause) {
      return new Error('format5 provider source retained: ' + fixture.sourceDirectory, { cause });
    },
  });
}

/** Native closure releases only its source lease; an explicit worker's shutdown and pipe drains are attempted independently even when native closure is unknown. Null selects the ordinary native-only bridge, which allocates no worker. Native replies and scope snapshots are returned unchanged. */
async function openNativeFormat5Stores(
  fixture: Awaited<ReturnType<typeof createFormat5Fixture>> | null,
  options: SqliteOptions,
  source: Format5SourceLease,
  mode: 'bootstrap' | 'open' = 'open',
) {
  try {
    const predecessor = await source.load();
    const stores =
      mode === 'bootstrap'
        ? await predecessor.bootstrapSqliteStores(options)
        : await predecessor.openSqliteStores(options);
    let closing: Promise<void> | undefined;
    return {
      ...stores,
      sourceDirectory: source.directory,
      close() {
        closing ??= (async () => {
          const failures: unknown[] = [];
          try {
            // Proof: genuine5-bridge-source-lease broke “format5 bridge close-before failure retains source after independent worker closure”; exact source hash restored.
            await stores.close();
            source.release();
          } catch (cause) {
            failures.push(cause, source.retain(cause));
          }
          try {
            // Proof: genuine5-bridge-worker-drain broke “format5 bridge close-before failure retains source after independent worker closure”; exact source hash restored.
            if (fixture !== null) await fixture.close();
          } catch (cause) {
            failures.push(cause);
          }
          if (failures.length !== 0)
            throw new AggregateError(failures, 'format5 bridge closure failed', {
              cause: failures[0],
            });
        })();
        return closing;
      },
    };
  } catch (cause) {
    const failures: unknown[] = [cause, source.retain(cause)];
    try {
      if (fixture !== null) await fixture.close();
    } catch (cleanupCause) {
      failures.push(cleanupCause);
    }
    throw new AggregateError(failures, 'format5 bridge construction and archive cleanup failed', {
      cause,
    });
  }
}

export async function bootstrapFormat5Stores(options: SqliteOptions) {
  return await openFormat5Stores(options, 'bootstrap');
}

/** Supplies historical recovery tests with genuine format5 writers and owned raw inspection. */
export async function createFormat5Inspection(directory: string, options: SqliteOptions) {
  const { Database } = await import('bun:sqlite');
  const { createStoreDirectory } = await import('./store-directory');
  const owner = createStoreDirectory(directory, { recursive: true });
  const stores = await bootstrapFormat5Stores(options);
  owner.retainStore(stores);
  const database = await constructFixture(() => new Database(options.path), [() => owner.close()]);
  owner.retainProbe(database);
  return { stores, database, options, close: () => owner.close() };
}
