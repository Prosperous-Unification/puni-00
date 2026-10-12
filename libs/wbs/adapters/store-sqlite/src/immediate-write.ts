import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Gate } from './gate';

/** The transaction handle a synchronous `bun:sqlite` write runs on. */
export type ImmediateTransaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/**
 * Runs one synchronous write in this process's write turn as a `BEGIN
 * IMMEDIATE` transaction, so every read inside it is the state the write
 * commits against. A throw rolls everything back, the audit row included.
 */
export function writeImmediately<T>(
  db: SQLiteBunDatabase,
  gate: Gate,
  work: (tx: ImmediateTransaction) => T,
): Promise<T> {
  return gate.enter(async () => {
    await Promise.resolve();
    // drizzle types a sync-driver callback through a conditional on its
    // result that a generic `T` cannot resolve; every caller passes a
    // synchronous function, which is the boundary that makes this safe.
    const synchronous = work as (tx: ImmediateTransaction) => never;
    return db.transaction<T>(synchronous, { behavior: 'immediate' });
  });
}
