import { sql } from 'drizzle-orm';

import { type Drizzle, hasSqliteTransaction } from './db';
import {
  assertSqliteWriteUsable,
  clearSqliteWriteFailure,
  recordSqliteWriteFailure,
  retainSqliteWriteFailure,
} from './sqlite-write-state';

/**
 * Synchronous subtree owner on the exact caller's writer, after its gate/loan
 * admission. Nested work uses one savepoint; standalone work owns IMMEDIATE.
 * Only confirmed rollback permits a modeled refusal to escape as a value.
 * Cleanup failure retains ordered unknown causes in the existing writer fence.
 */
export function writeSubtreeIn<Value>(db: Drizzle, write: () => Value): Value {
  assertSqliteWriteUsable(db);
  if (hasSqliteTransaction(db)) {
    db.run(sql.raw('SAVEPOINT subtree_write'));
    try {
      const written = write();
      assertSqliteWriteUsable(db);
      db.run(sql.raw('RELEASE SAVEPOINT subtree_write'));
      return written;
    } catch (cause: unknown) {
      const primary = retainSqliteWriteFailure(db, cause);
      // Proof: SQL_LOCAL replaced only this rollback with SELECT 1; borrowed-subtree-refusal-keeps-commit kept its refusal but leaked the row after COMMIT (0/1/34); exact restoration passed 1/0/40, 2026-11-18.
      // Proof: BULK_SQL_LOCAL_POINT omitted only this local rollback dependency.
      // The modeled refusal still passed after the unrelated actual outer COMMIT;
      // the next graph equality exposed the added restored row. Restoration passed.
      try {
        db.run(sql.raw('ROLLBACK TO SAVEPOINT subtree_write'));
      } catch (cleanup: unknown) {
        const failure = new AggregateError(
          [primary, cleanup],
          'subtree method and savepoint rollback failed',
          { cause: cleanup },
        );
        recordSqliteWriteFailure(db, failure);
        throw failure;
      }
      try {
        db.run(sql.raw('RELEASE SAVEPOINT subtree_write'));
      } catch (cleanup: unknown) {
        const failure = new AggregateError(
          [primary, cleanup],
          'subtree method and savepoint release failed',
          { cause: cleanup },
        );
        recordSqliteWriteFailure(db, failure);
        throw failure;
      }
      throw primary;
    }
  }
  // BEGIN is outside the acquired-owner catch: it cannot roll back someone else's transaction on acquisition failure.
  db.run(sql.raw('BEGIN IMMEDIATE'));
  try {
    const written = write();
    assertSqliteWriteUsable(db);
    db.run(sql.raw('COMMIT'));
    return written;
  } catch (cause: unknown) {
    const primary = retainSqliteWriteFailure(db, cause);
    try {
      db.run(sql.raw('ROLLBACK'));
    } catch (cleanup: unknown) {
      const failure = new AggregateError(
        [primary, cleanup],
        'subtree transaction and rollback failed',
        { cause: cleanup },
      );
      recordSqliteWriteFailure(db, failure);
      throw failure;
    }
    clearSqliteWriteFailure(db);
    throw primary;
  }
}
