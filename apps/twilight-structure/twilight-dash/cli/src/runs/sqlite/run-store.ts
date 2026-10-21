import type { Database } from 'bun:sqlite';

import type { WallClock } from '../../clock';
import {
  permitsMutation,
  planAdmission,
  planManifestRetention,
  planRunCreation,
} from '../plan-admission';
import { assertClock, planOwnership, planRenewal } from '../plan-ownership';
import {
  decodeAdmission,
  decodeOwnership,
  decodeRun,
  decodeRunGuard,
  manifestDigest,
  ownerId,
  runId,
} from '../record-codecs';
import type { Ownership, OwnershipStatus } from '../records';
import type { RunStore, StoreReply } from '../run-store';
import { decodeAttemptRow, decodeManifestRow, decodeRunRow } from './row-codecs';
import { readMeta } from './schema';

export interface TransactionOptions {
  readonly clock: WallClock;
  readonly maxBusyAttempts: number;
  readonly busyDelayMilliseconds: number;
}
/** Operational contention is never an admission refusal or an initialization signal. */
export class RunStoreContentionError extends Error {
  constructor(attempts: number, cause: unknown) {
    super(`run store contention exhausted after ${String(attempts)} attempts`, { cause });
    this.name = 'RunStoreContentionError';
  }
}
/** Recognizes only local SQLite lock failures eligible for bounded retry. */
export function isBusy(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    'code' in cause &&
    (cause.code === 'SQLITE_BUSY' || cause.code === 'SQLITE_LOCKED')
  );
}
function transactionIsOpen(database: Database): boolean {
  return database.inTransaction;
}
/** Rolls back before retry/throw; a failed rollback preserves both causes and stops replay. */
function rollback(database: Database, cause: unknown): void {
  // Proof: removing this transaction-state check masked held-lock exhaustion with a rollback failure.
  if (!database.inTransaction) return;
  try {
    database.run('ROLLBACK');
    // Proof: skipping the real ROLLBACK left a live transaction; removing this check failed rollback-skip cause assertions.
    if (transactionIsOpen(database))
      throw new Error('sqlite transaction remains open after rollback');
  } catch (rollbackCause) {
    // Proof: dropping the original cause failed rollback-throw's injected-reservation assertion.
    throw new AggregateError([cause, rollbackCause], 'run store transaction and rollback failed', {
      cause: rollbackCause,
    });
  }
}
/** Independent row-level SQLite adapter. Each write supplies shared planners a locked, current view. */
export function createSqliteRunStore(
  database: Database,
  options: TransactionOptions,
): { runs: RunStore; close(): void } {
  let queue = Promise.resolve();

  async function transact<T>(write: boolean, operation: () => T): Promise<T> {
    const previous = queue;
    const turn = Promise.withResolvers<undefined>();
    queue = turn.promise;
    await previous;
    try {
      for (let attempt = 1; attempt <= options.maxBusyAttempts; attempt += 1) {
        try {
          // Proof: bypassing write BEGIN/COMMIT left a durable attempt after the real reservation-abort trigger; the rollback test expected no rows.
          database.run(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
          const value = operation();
          database.run('COMMIT');
          return value;
        } catch (cause) {
          rollback(database, cause);
          // Proof: treating the trigger abort as retryable masked its cause with contention; the real rollback test rejected that substitution.
          if (!isBusy(cause)) throw cause;
          if (attempt === options.maxBusyAttempts)
            throw new RunStoreContentionError(attempt, cause);
          // Proof: replacing this with synchronous sleep prevented the held-lock test's independent timer from running.
          await Bun.sleep(options.busyDelayMilliseconds);
        }
      }
      throw new Error('sqlite retry budget did not execute');
    } finally {
      turn.resolve(undefined);
    }
  }
  function readAuthority(requested: Ownership) {
    const meta = readMeta(database);
    // Proof: substituting renewal's pre-wait observation made the post-lock clock test renew an expired lease.
    const observedAt = options.clock.read();
    assertClock(observedAt, meta.last_observed_at);
    return {
      meta,
      authority: {
        current: meta.ownership.owner,
        requested,
        observedAt,
        lastObservedAt: meta.last_observed_at,
      },
    };
  }
  function finish<T>(reply: StoreReply<T>, observedAt: number): StoreReply<T> {
    // Proof: omitting refused observations accepted clock 1049 after owner_busy at 1050 in the shared contract.
    database.query('UPDATE run_meta SET last_observed_at=? WHERE singleton=1').run(observedAt);
    return reply;
  }
  function publishOwnership(
    reply: StoreReply<Ownership>,
    status: OwnershipStatus,
    observedAt: number,
  ) {
    if (reply.kind !== 'refused')
      database
        .query('UPDATE run_meta SET ownership=? WHERE singleton=1')
        .run(JSON.stringify({ ...status, epoch: reply.value.epoch, owner: reply.value }));
    return finish(reply, observedAt);
  }
  function findManifest(digest: string) {
    const row = database.query('SELECT * FROM run_manifest WHERE digest=?').get(digest);
    return row === null ? undefined : decodeManifestRow(row);
  }
  function requireManifest(digest: string) {
    const manifest = findManifest(digest);
    // Proof: removing the absence diagnostic made shared missing-manifest inspection resolve undefined.
    if (manifest === undefined) throw new Error('manifest does not exist');
    return manifest;
  }
  function findRun(identity: string) {
    const row = database.query('SELECT * FROM run_record WHERE run_id=?').get(identity);
    return row === null ? undefined : decodeRunRow(row);
  }
  function requireRun(identity: string) {
    const record = findRun(identity);
    // Proof: removing the absence diagnostic failed the shared missing-run assertion with an incidental TypeError.
    if (record === undefined) throw new Error('run does not exist');
    return record;
  }
  function readCapacity(limit: number) {
    const row = database
      .query<{ count: number }, []>('SELECT count(*) AS count FROM run_reservation')
      .get();
    // Proof: bypassing the persisted limit check returned two reservations under limit one in reads.
    if (row === null || !Number.isSafeInteger(row.count) || row.count < 0 || row.count > limit)
      throw new Error('corrupt sqlite capacity reservations');
    return { limit, reserved: row.count };
  }
  const runs: RunStore = {
    acquireOwnership(identity, expectedEpoch) {
      return transact(true, () => {
        const meta = readMeta(database);
        const observedAt = options.clock.read();
        assertClock(observedAt, meta.last_observed_at);
        return publishOwnership(
          planOwnership(
            meta.ownership,
            ownerId(identity),
            expectedEpoch,
            observedAt,
            meta.last_observed_at,
            meta.lease_milliseconds,
          ),
          meta.ownership,
          observedAt,
        );
      });
    },
    renewOwnership(input) {
      return transact(true, () => {
        const requested = decodeOwnership(input);
        const { meta, authority } = readAuthority(requested);
        const reply =
          authority.current === null
            ? ({ kind: 'refused', reason: 'owner_stale' } as const)
            : planRenewal(
                authority.current,
                requested,
                authority.observedAt,
                authority.lastObservedAt,
                meta.lease_milliseconds,
              );
        return publishOwnership(reply, meta.ownership, authority.observedAt);
      });
    },
    retainManifest(input, manifest) {
      return transact(true, () => {
        const { authority } = readAuthority(decodeOwnership(input));
        // Proof: independently removing this early fence made stale manifest/run requests decode corrupt targets instead of returning owner_stale.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const reply = planManifestRetention(authority, manifest, findManifest(manifest.digest));
        if (reply.kind === 'applied')
          database
            .query('INSERT INTO run_manifest(digest,record) VALUES (?,?)')
            .run(reply.value.digest, JSON.stringify(reply.value));
        return finish(reply, authority.observedAt);
      });
    },
    readManifest(digest) {
      return transact(false, () => requireManifest(manifestDigest(digest)));
    },
    createRun(input, candidate) {
      return transact(true, () => {
        const { authority } = readAuthority(decodeOwnership(input));
        const run = decodeRun(candidate);
        // Proof: independently removing this early fence made stale manifest/run requests decode corrupt targets instead of returning owner_stale.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const current = findRun(run.runId);
        const reply = planRunCreation(
          authority,
          run,
          current?.initial,
          current?.run,
          findManifest(run.manifestDigest),
        );
        if (reply.kind === 'applied')
          database
            .query(
              'INSERT INTO run_record(run_id,manifest_digest,record,initial_record) VALUES (?,?,?,?)',
            )
            .run(
              run.runId,
              run.manifestDigest,
              JSON.stringify(reply.value),
              JSON.stringify(reply.value),
            );
        return finish(reply, authority.observedAt);
      });
    },
    readRun(identity) {
      return transact(false, () => {
        const { run } = requireRun(runId(identity));
        const attempts = database
          .query('SELECT * FROM run_attempt WHERE run_id=? ORDER BY occurrence_id,ordinal')
          .all(run.runId)
          .map((row) => decodeAttemptRow(row).attempt);
        return { version: 1, run, attempts, capacity: readCapacity(readMeta(database).capacity) };
      });
    },
    admitAttempt(inputGuard, inputAdmission) {
      return transact(true, () => {
        const guard = decodeRunGuard(inputGuard);
        const admission = decodeAdmission(inputAdmission);
        const { meta, authority } = readAuthority(guard.ownership);
        // Proof: removing the live-owner fence made shared stale-authority admission throw on an absent target run.
        if (authority.current === null || !permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const { run } = requireRun(guard.runId);
        const history = database
          .query(
            'SELECT * FROM run_attempt WHERE attempt_id=? OR (run_id=? AND occurrence_id=?) ORDER BY ordinal',
          )
          .all(admission.attemptId, run.runId, admission.identity.occurrenceId)
          .map(decodeAttemptRow);
        const reply = planAdmission(
          {
            ownership: authority.current,
            observedAt: authority.observedAt,
            lastObservedAt: authority.lastObservedAt,
            capacity: readCapacity(meta.capacity),
            run,
            manifest: requireManifest(run.manifestDigest),
            attempts: history.map((entry) => entry.attempt),
            admissions: history.map((entry) => entry.admission),
          },
          guard,
          admission,
        );
        if (reply.kind === 'refused') return finish(reply, authority.observedAt);
        if (reply.kind === 'applied') {
          const attempt = reply.value.attempt;
          database
            .query(
              'INSERT INTO run_attempt(attempt_id,run_id,occurrence_id,ordinal,record,admission) VALUES (?,?,?,?,?,?)',
            )
            .run(
              attempt.attemptId,
              run.runId,
              attempt.identity.occurrenceId,
              attempt.ordinal,
              JSON.stringify(attempt),
              JSON.stringify(admission),
            );
          database
            .query('UPDATE run_record SET record=? WHERE run_id=?')
            .run(JSON.stringify({ ...run, revision: reply.value.runRevision }), run.runId);
          // Proof: suppressing the reservation intent let both capacity-one admissions apply.
          if (reply.value.reserveSlot)
            database
              .query('INSERT INTO run_reservation(attempt_id) VALUES (?)')
              .run(attempt.attemptId);
        }
        return finish({ kind: reply.kind, value: reply.value.attempt }, authority.observedAt);
      });
    },
  };
  return {
    runs,
    close() {
      database.close();
    },
  };
}
