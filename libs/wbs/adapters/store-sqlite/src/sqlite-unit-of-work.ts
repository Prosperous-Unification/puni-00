import type { Decision, Scope, TransactionalStores, UnitOfWork } from '@wbs/core';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import type { Gate } from './gate';
import { createReadSnapshotLifetime, type ReadSnapshotLifetime } from './read-snapshot-lifetime';
import {
  assertSqliteWriteUsable,
  clearSqliteWriteFailure,
  recordSqliteWriteFailure,
  retainSqliteWriteFailure,
} from './sqlite-write-state';
import { translateStepBlockageFailure } from './step-blockage-activation';

/** Fresh admitted scopes retain one run's lifetime; repair has only surviving base stores. */
export interface SqliteScopeFactory {
  createScope(lifetime: ReadSnapshotLifetime): Scope<TransactionalStores>;
  createRepairScope(lifetime: ReadSnapshotLifetime): Scope<TransactionalStores>;
}

/**
 * The SQLite source's {@link UnitOfWork}: one turn, one `BEGIN IMMEDIATE`, and
 * the stores' own transactions nesting inside it as savepoints.
 *
 * `IMMEDIATE` rather than `DEFERRED` takes SQLite's write lock at `BEGIN`
 * rather than at the first write, so a reader in another process cannot turn
 * the batch into `SQLITE_BUSY` halfway through — ADR 0007, measured against
 * `bun:sqlite` and drizzle rather than read off the documentation.
 *
 * Each run receives a fresh scope whose borrowed readers retain that run's
 * irreversible lifetime. Stateless repositories may be shared over OPEN because
 * the run holds the coordinator turn. Repair receives separate journal-only
 * base stores after rollback, with no expired observation capability.
 */
export function sqliteUnitOfWork(
  db: Drizzle,
  gate: Gate,
  scopes: SqliteScopeFactory,
  onRun?: () => void,
): UnitOfWork<TransactionalStores> {
  return {
    run<T>(
      act: (scope: Scope<TransactionalStores>) => Promise<Decision<T, TransactionalStores>>,
    ): Promise<T> {
      onRun?.();
      return gate.enter(async () => {
        assertSqliteWriteUsable(db);
        db.run(sql.raw('BEGIN IMMEDIATE'));
        let decision: Decision<T, TransactionalStores>;
        try {
          // Proof: reusing one token made the following source UoW refuse its fresh reader.
          const lifetime = createReadSnapshotLifetime();
          try {
            const scope = scopes.createScope(lifetime);
            decision = await act(scope);
          } finally {
            // Proof: omitted expiry let retained source readers answer isolated after success.
            lifetime.expire();
          }
          // Proof: unconditional COMMIT injected; sparse override refused-batch read lost its original fact (sqlite-rollback.txt), 2026-10-15.
          assertSqliteWriteUsable(db);
          db.run(sql.raw(decision.commit ? 'COMMIT' : 'ROLLBACK'));
        } catch (cause) {
          const primary = retainSqliteWriteFailure(db, cause);
          try {
            // Proof: rollback omitted; inactive raw owner cascade retained an earlier work package name/revision write (2026-10-14).
            db.run(sql.raw('ROLLBACK'));
          } catch (rollbackCause) {
            // Both, and not the second one alone: the rollback failing is the
            // more recent event and the less informative one, and a caller
            // reading only it would be told the database is unhappy without
            // being told what the batch was doing when it became so. `cause` is
            // the rollback's failure — the one this `catch` is holding — and
            // the batch's own is the first arm of the aggregate.
            const failure = new AggregateError(
              [primary, rollbackCause],
              'batch and rollback failed',
              {
                cause: rollbackCause,
              },
            );
            recordSqliteWriteFailure(db, failure);
            throw failure;
          }
          clearSqliteWriteFailure(db);
          // Proof: translation omitted; real inactive owner cascade rejected as DrizzleQueryError instead of StepBlockageInactive (2026-10-14).
          throw translateStepBlockageFailure(primary);
        }
        // **Outside the transaction's own catch**, deliberately (D28): the
        // repair below is a separate surviving act on a closed transaction, so
        // a failure inside it must propagate as itself rather than trigger a
        // second `ROLLBACK` on a transaction that is no longer open.
        //
        // Repair gets fresh base stores over OPEN and the surviving state.
        // Public stores would deadlock while this run still holds the turn;
        // the expired transaction scope would retain obsolete read authority.
        if (!decision.commit && decision.afterRollback !== undefined) {
          const repairLifetime = createReadSnapshotLifetime();
          try {
            await decision.afterRollback(scopes.createRepairScope(repairLifetime));
            assertSqliteWriteUsable(db);
          } catch (cause: unknown) {
            throw retainSqliteWriteFailure(db, cause);
          } finally {
            repairLifetime.expire();
          }
        }
        return decision.value;
      });
    },
  };
}
