import { FORMAT4_IDENTITY } from '../sqlite/format';
import type * as SqliteStoreModule from '../sqlite/open-stores';
import type { SqliteOptions } from '../sqlite/open-stores';
import { constructFixture } from './construct-fixture';
import {
  decodeFormat4Envelope,
  decodeFormat4Response,
  format4SourceEntries,
} from './format4-protocol';
import {
  type Format4SourceLease,
  requireFormat4Lifetime,
  retainFormat4Provider,
} from './format4-provider';
import { createPredecessorFixture, verifyPredecessorSource } from './predecessor-fixture';

const commit = 'b3b594dab4f0153d2ef00a2989bbeb02ea0cbbda';
/** Audits this exact predecessor source without loading current production modules. */
export function verifyFormat4Source(directory: string) {
  return verifyPredecessorSource(directory, commit, format4SourceEntries);
}
/** Loads the genuine pinned provider before exposing its already-open writer. */
export async function createFormat4Fixture(path: string, mode: 'bootstrap' | 'open' = 'bootstrap') {
  return await createPredecessorFixture(
    {
      commit,
      label: 'format4',
      identity: FORMAT4_IDENTITY,
      sourceEntries: format4SourceEntries,
      workerFiles: ['format4-worker.ts', 'format4-protocol.ts'],
      decodeEnvelope: decodeFormat4Envelope,
      decodeResponse: decodeFormat4Response,
    },
    path,
    mode,
  );
}
export { settleFixture } from './construct-fixture';
export type {
  Format4Capture,
  Format4Command,
  Format4Mutation,
  Format4Population,
  SqliteCaptureCell,
} from './format4-protocol';

/** Historical test bridge: the verified archive supplies the actual format4 module; current5 never opens predecessor state. Archive ownership lasts through native store closure. */
export async function openFormat4Stores(
  options: SqliteOptions,
  mode: 'bootstrap' | 'open' = 'open',
) {
  requireFormat4Lifetime();
  const fixture = await createFormat4Fixture(options.path, mode);
  return await openPooledFormat4Stores(fixture, options);
}

/** Uses one suite-owned immutable provider module while preserving this independently archived worker's lifecycle. */
export async function openPooledFormat4Stores(
  fixture: Awaited<ReturnType<typeof createFormat4Fixture>>,
  options: SqliteOptions,
) {
  const source = await constructFixture(
    () => retainFormat4Provider(options.path),
    [() => fixture.close()],
  );
  return await openNativeFormat4Stores(fixture, options, source);
}

/** Isolated source owner for native/import boundary proofs; ordinary historical cases use the bounded suite-owned provider. */
export async function openVerifiedFormat4Stores(
  fixture: Awaited<ReturnType<typeof createFormat4Fixture>>,
  options: SqliteOptions,
) {
  // Proof: Task3 044 archived-import failure deleted the archive; 045 retains it and observes independent worker and pipe closure.
  const release = fixture.retainSource('format4 in-process provider');
  return await openNativeFormat4Stores(fixture, options, {
    directory: fixture.sourceDirectory,
    async load() {
      // Boundary: the pinned module was hash-verified by the worker handshake; the historical public store port is unchanged.
      return (await import(
        fixture.sourceDirectory +
          '/apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/open-stores.ts'
      )) as typeof SqliteStoreModule;
    },
    release,
    retain(cause) {
      return new Error('format4 provider source retained: ' + fixture.sourceDirectory, { cause });
    },
  });
}

/** Native closure releases only its source lease; worker shutdown and pipe drains are attempted independently even when native closure is unknown. */
async function openNativeFormat4Stores(
  fixture: Awaited<ReturnType<typeof createFormat4Fixture>>,
  options: SqliteOptions,
  source: Format4SourceLease,
) {
  try {
    const predecessor = await source.load();
    const stores = await predecessor.openSqliteStores(options);
    let closing: Promise<void> | undefined;
    return {
      ...stores,
      sourceDirectory: source.directory,
      close() {
        closing ??= (async () => {
          const failures: unknown[] = [];
          try {
            await stores.close();
            source.release();
          } catch (cause) {
            failures.push(cause, source.retain(cause));
          }
          // Proof: Task3 044 actual native-close failure left the worker running; 045 observes zero exit and both pipe closures while retaining source and cause.
          try {
            await fixture.close();
          } catch (cause) {
            failures.push(cause);
          }
          if (failures.length !== 0)
            throw new AggregateError(failures, 'format4 bridge closure failed', {
              cause: failures[0],
            });
        })();
        return closing;
      },
    };
  } catch (cause) {
    const failures: unknown[] = [cause, source.retain(cause)];
    try {
      await fixture.close();
    } catch (cleanupCause) {
      failures.push(cleanupCause);
    }
    throw new AggregateError(failures, 'format4 bridge construction and archive cleanup failed', {
      cause,
    });
  }
}

export async function bootstrapFormat4Stores(options: SqliteOptions) {
  return await openFormat4Stores(options, 'bootstrap');
}

/** Supplies historical recovery tests with genuine format4 writers and owned raw inspection. */
export async function createFormat4Inspection(directory: string, options: SqliteOptions) {
  const { Database } = await import('bun:sqlite');
  const { createStoreDirectory } = await import('./store-directory');
  const owner = createStoreDirectory(directory, { recursive: true });
  const stores = await bootstrapFormat4Stores(options);
  owner.retainStore(stores);
  const database = await constructFixture(() => new Database(options.path), [() => owner.close()]);
  owner.retainProbe(database);
  return { stores, database, options, close: () => owner.close() };
}
