import type { Drizzle } from './db';

const failures = new WeakMap<Drizzle, AggregateError>();

/** Fences catalogue/UoW entry on this exact writer after failed recovery; unrelated repository paths are not covered and no new owner is acquired. */
export function assertSqliteWriteUsable(db: Drizzle): void {
  const failure = failures.get(db);
  if (failure !== undefined) throw failure;
}

/** Retains all ordered causes until the existing owner confirms a complete rollback. */
export function recordSqliteWriteFailure(db: Drizzle, failure: AggregateError): void {
  failures.set(db, failure);
}

/** Keeps an earlier registered recovery failure before a later callback throw, including thrown undefined. */
export function retainSqliteWriteFailure(db: Drizzle, cause: unknown): unknown {
  const pending = failures.get(db);
  if (pending === undefined || pending === cause) return cause;
  const failure = new AggregateError(
    [pending, cause],
    'writer recovery and later batch operation failed',
    { cause },
  );
  failures.set(db, failure);
  return failure;
}

/** Only the transaction owner calls this after its full ROLLBACK returned successfully. */
export function clearSqliteWriteFailure(db: Drizzle): void {
  // This private WeakMap only stores in-process failure markers; deleting its key executes no SQL.
  // eslint-disable-next-line drizzle/enforce-delete-with-where
  failures.delete(db);
}
