import { Database } from 'bun:sqlite';

import { bootstrapSqliteStores, type SqliteOptions } from '../sqlite/open-stores';
import { constructFixture } from './construct-fixture';
import { createStoreDirectory } from './store-directory';

/** Retains opaque bootstrap failures; only an exact owned clock throw returning through the native finally establishes closure at that controlled boundary. */
async function createOwnedRecoveryStores(directory: string, options: SqliteOptions) {
  const owner = createStoreDirectory(directory, { recursive: true });
  let clockFailure: { readonly cause: unknown } | undefined;
  const stores = await constructFixture(
    () =>
      bootstrapSqliteStores({
        ...options,
        clock: {
          read() {
            try {
              return options.clock.read();
            } catch (cause) {
              clockFailure = { cause };
              throw cause;
            }
          },
        },
      }),
    [
      async (cause) => {
        // Proof: final-bootstrap-witness admitted an opaque post-clock validation failure to removal; its directory-retention control failed. Exact restoration passed, including undefined/non-Error clock causes.
        if (clockFailure !== undefined && Object.is(cause, clockFailure.cause)) {
          await owner.close();
          return;
        }
        throw new Error(
          'fixture storage retained because bootstrap closure is unestablished: ' + directory,
          { cause },
        );
      },
    ],
  );
  const fixture = {
    ...stores,
    closeConnection: () => stores.close(),
    close: async (): Promise<void> => {
      // Proof: final-owner-await-independent omitted this await; the pending-close control observed premature completion, independently drained the raw close and observed final directory removal. Exact restoration passed.
      try {
        await owner.close();
      } catch (cause) {
        throw new Error('fixture storage retained after failed connection closure: ' + directory, {
          cause,
        });
      }
    },
  };
  // Proof: final-store-registration-independent omitted this registration; actual SQLite remained readable after receiver/inspection setup rejection. Independent raw closes remained installed; exact restoration passed.
  owner.retainStore({ close: () => fixture.closeConnection() });
  return { fixture, owner };
}

/** Owns the supplied directory and store; closeConnection drains/fences the actual bundle while retaining its directory for an explicit reopen. */
export async function createRecoveryStores(directory: string, options: SqliteOptions) {
  return (await createOwnedRecoveryStores(directory, options)).fixture;
}

/** Registers the actual inspection with the existing store-directory owner before transferring the completed fixture to its caller. */
export async function createRecoveryInspection(
  directory: string,
  options: SqliteOptions,
  inspect: (path: string, stores: Awaited<ReturnType<typeof createRecoveryStores>>) => Database = (
    path,
  ) => new Database(path),
) {
  const { fixture: stores, owner } = await createOwnedRecoveryStores(directory, options);
  const database = await constructFixture(
    () => inspect(options.path, stores),
    [() => stores.close()],
  );
  // Proof: final-probe-registration omitted this registration; the native-inspection failure control lost its required rejection while the inherited storage barrier stayed installed. Exact restoration passed.
  owner.retainProbe(database);
  return { stores, database, options, close: () => stores.close() };
}
