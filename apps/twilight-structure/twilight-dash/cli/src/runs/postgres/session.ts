import type { ReservedSQL, SQL } from 'bun';

import { awaitCompletion } from './deadline';
import { createPostgresObserver, readPostgresWriter } from './observer';

/** Explicit positive safe timer budgets; a client deadline never proves cancellation. */
export interface PostgresBudgets {
  readonly openMilliseconds: number;
  readonly operationMilliseconds: number;
  readonly closeMilliseconds: number;
  readonly statementMilliseconds: number;
  readonly lockMilliseconds: number;
  readonly pollMilliseconds: number;
}

/** Creates private direct-server pools using the supplied startup cookie and the same role/database. */
export type PostgresClientFactory = (
  purpose: 'writer' | 'observer',
  applicationName: string,
) => SQL;

interface PostgresResource {
  readonly pool: SQL;
  readonly reservation: Promise<ReservedSQL>;
}

/** Attempts every local disposal even after another failure or the common deadline expires. */
async function disposeResource(
  resource: PostgresResource,
  signal: AbortSignal,
  failures: unknown[],
): Promise<void> {
  const attempts = [
    async () => {
      const connection = await resource.reservation;
      // Proof: S18 skipped reservation disposal; the real dual-failure test lost both expected causes.
      await connection.close({ timeout: 0 });
    },
    async () => {
      await resource.pool.close({ timeout: 0 });
    },
  ];
  // Proof: S20 stopped awaiting local disposal; hung native-close acknowledgements falsely completed close.
  await Promise.all(
    attempts.map(async (attempt) => {
      try {
        // Proof: S19 renewed each deadline; the bounded-close test took 202ms instead of its single 100ms budget.
        await awaitCompletion(attempt(), signal);
      } catch (cause) {
        // Proof: S16 discarded disposal failures; the dual-failure test lost its expected rejection.
        failures.push(cause);
      }
    }),
  );
}

/**
 * Owns a serialized private writer and a continuously reserved same-role observer.
 * Callbacks are trusted adapter code: no detached work, retained connection use,
 * role/cookie changes, transaction control, two-phase transactions or autonomous writes.
 * Writes lock then plan in separate READ COMMITTED commands; snapshots are read-only
 * REPEATABLE READ. Values escape only after a validated COMMIT command tag; failures never retry.
 *
 * Close synchronously fences admission, drains actual work (not its caller deadline),
 * disposes the writer, observes server disappearance, then disposes the observer.
 * One deadline bounds close and its sticky outcome; expiry cannot certify release.
 * An unanswered COMMIT stays unknown even when subsequent close succeeds.
 */
export async function openPostgresSession(
  factory: PostgresClientFactory,
  budgets: PostgresBudgets,
): Promise<{
  write<T>(key: bigint, operation: (connection: ReservedSQL) => Promise<T>): Promise<T>;
  snapshot<T>(operation: (connection: ReservedSQL) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}> {
  const {
    openMilliseconds,
    operationMilliseconds,
    closeMilliseconds,
    statementMilliseconds,
    lockMilliseconds,
    pollMilliseconds,
  } = budgets;
  for (const milliseconds of [
    openMilliseconds,
    operationMilliseconds,
    closeMilliseconds,
    statementMilliseconds,
    lockMilliseconds,
    pollMilliseconds,
  ]) {
    // Proof: S01 bypassed validation; malformed-budget tests reached the resource factory.
    if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 2147483647) {
      throw new Error('invalid PostgreSQL budget');
    }
  }
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const writerName = `writer_${suffix}`;
  const observerName = `observer_${suffix}`;
  const opening = AbortSignal.timeout(openMilliseconds);
  const resources: PostgresResource[] = [];
  function acquireResource(purpose: 'writer' | 'observer', name: string): PostgresResource {
    const pool = factory(purpose, name);
    // The async boundary records a synchronous reserve failure alongside its owning pool.
    const reservation = (async () => await pool.reserve())();
    const resource = { pool, reservation };
    resources.push(resource);
    return resource;
  }
  let writer: PostgresResource;
  let observer: PostgresResource;
  let connection: ReservedSQL;
  let observation: Awaited<ReturnType<typeof createPostgresObserver>>;
  try {
    writer = acquireResource('writer', writerName);
    observer = acquireResource('observer', observerName);
    const reservations = await awaitCompletion(
      Promise.all([writer.reservation, observer.reservation]),
      opening,
    );
    connection = reservations[0];
    const inspection = reservations[1];
    // Proof: S23 omitted server budgets; the real pg_sleep statement no longer timed out.
    await awaitCompletion(
      connection`SELECT pg_catalog.set_config('statement_timeout', ${String(statementMilliseconds)}, false),
        pg_catalog.set_config('lock_timeout', ${String(lockMilliseconds)}, false)`,
      opening,
    );
    observation = await createPostgresObserver(
      inspection,
      { observerName, writerName, pollMilliseconds },
      opening,
    );
    const identity = await readPostgresWriter(connection, writerName, opening);
    // Proof: S02 skipped registration; the real observer inspection refusal no longer rejected open.
    await observation.register(identity, opening);
  } catch (cause) {
    const failures: unknown[] = [cause];
    const cleanup = AbortSignal.timeout(closeMilliseconds);
    // Proof: S22 skipped the observer cleanup after failed open; its independently injected cause was lost.
    await Promise.all(
      resources.map(async (resource) => {
        await disposeResource(resource, cleanup, failures);
      }),
    );
    if (failures.length > 1)
      throw new AggregateError(failures, 'PostgreSQL open and disposal failed', { cause });
    throw cause;
  }

  let isFenced = false;
  const queued = new Set<() => void>();
  let drained = Promise.resolve();
  let closing: Promise<void> | undefined;

  function fenceAdmission(): void {
    // Proof: S10b removed the fence while the native writer remained usable; new calls timed out instead of rejecting fenced.
    isFenced = true;
    // Proof: S11b skipped queued rejection; the held-admission test observed timeout instead of immediate fencing.
    for (const reject of queued) reject();
    queued.clear();
  }

  async function transact<T>(
    key: bigint | undefined,
    operation: (connection: ReservedSQL) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    let hasBegun = false;
    let isCommitting = false;
    try {
      signal.throwIfAborted();
      if (key === undefined) {
        // Proof: S03 changed the snapshot mode; the real isolation/read-only assertion failed.
        await connection`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
      } else {
        // Proof: S04 substituted REPEATABLE READ; the real write-isolation assertion failed.
        await connection`BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE`;
      }
      hasBegun = true;
      // Proof: S05 omitted the separate lock command; the callback ran while a real competing writer held its lock.
      if (key !== undefined) await connection`SELECT pg_catalog.pg_advisory_xact_lock(${key})`;
      // Proof: S14 skipped this check; a timed-out callback ran after its real advisory lock arrived.
      signal.throwIfAborted();
      const value = await operation(connection);
      // Proof: S13 skipped this check; the late callback committed 15 instead of preserving the original row.
      signal.throwIfAborted();
      isCommitting = true;
      // Proof: S07 detached COMMIT acknowledgement; the real commit gate observed a premature caller reply.
      const acknowledgement = await connection<unknown>`COMMIT`;
      // Proof: S27 removed only this guard; a real ROLLBACK tag and missing COMMIT metadata falsely returned success.
      if (
        typeof acknowledgement !== 'object' ||
        acknowledgement === null ||
        !('command' in acknowledgement) ||
        acknowledgement.command !== 'COMMIT'
      ) {
        throw new Error('PostgreSQL COMMIT acknowledgement missing or refused');
      }
      return value;
    } catch (cause) {
      if (isCommitting) {
        // Proof: S08 removed ambiguous-COMMIT fencing; a further operation reached COMMIT again.
        fenceAdmission();
        throw new Error('PostgreSQL COMMIT outcome unknown', { cause });
      }
      if (!hasBegun) {
        // Proof: S24 removed BEGIN-failure fencing; the still-valid native writer admitted a later snapshot.
        fenceAdmission();
        throw cause;
      }
      try {
        // Proof: S06b omitted rollback; a later acknowledged COMMIT exposed the failed callback mutation (12).
        await connection`ROLLBACK`;
      } catch (rollback) {
        fenceAdmission();
        // Proof: S09 discarded rollback failure; the retained-both-causes assertion failed.
        throw new AggregateError([cause, rollback], 'PostgreSQL operation and rollback failed', {
          cause: rollback,
        });
      }
      throw cause;
    }
  }

  function enqueue<T>(
    key: bigint | undefined,
    operation: (connection: ReservedSQL) => Promise<T>,
  ): Promise<T> {
    if (isFenced) return Promise.reject(new Error('PostgreSQL session fenced'));
    const completion = Promise.withResolvers<T>();
    const signal = AbortSignal.timeout(operationMilliseconds);
    const expire = () => {
      completion.reject(signal.reason);
      // Proof: S25 removed deadline fencing; a subsequent call timed out instead of being refused.
      fenceAdmission();
    };
    signal.addEventListener('abort', expire, { once: true });
    const rejectQueued = () => {
      completion.reject(new Error('PostgreSQL session fenced'));
    };
    queued.add(rejectQueued);
    drained = drained.then(async () => {
      queued.delete(rejectQueued);
      // Proof: S26 removed this check; the already-rejected queued callback still ran before close completed.
      if (isFenced) {
        rejectQueued();
        return;
      }
      const actual = transact(key, operation, signal);
      void actual.then(completion.resolve, completion.reject);
      // An operation's error belongs to its caller; this observes actual settlement for disposal.
      // Proof: S12 drained only the deadline race; close finished while the actual callback remained held.
      await Promise.allSettled([actual]);
    });
    return completion.promise.finally(() => {
      signal.removeEventListener('abort', expire);
    });
  }

  async function disposeSession(): Promise<void> {
    const signal = AbortSignal.timeout(closeMilliseconds);
    const failures: unknown[] = [];
    try {
      await awaitCompletion(drained, signal);
    } catch (cause) {
      failures.push(cause);
    }
    await disposeResource(writer, signal, failures);
    try {
      // Proof: S15 skipped the fresh scan; close succeeded while a retained real native writer answered SELECT.
      await observation.waitForWriters(signal);
    } catch (cause) {
      failures.push(cause);
    }
    // Proof: S17 skipped final observer disposal; its independently injected failure disappeared.
    await disposeResource(observer, signal, failures);
    if (failures.length > 0)
      throw new AggregateError(failures, 'PostgreSQL close failed; disposal uncertain');
  }

  return {
    write: (key, operation) => enqueue(key, operation),
    snapshot: (operation) => enqueue(undefined, operation),
    close() {
      // Proof: S21b removed outcome caching; repeat close returned a different promise.
      if (closing !== undefined) return closing;
      fenceAdmission();
      closing = disposeSession();
      return closing;
    },
  };
}
