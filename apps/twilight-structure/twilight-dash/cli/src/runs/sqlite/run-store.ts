import type { Database } from 'bun:sqlite';

import type { WallClock } from '../../clock';
import type { ArtifactStore } from '../artifact-store';
import {
  permitsMutation,
  planAdmission,
  planManifestRetention,
  planRunCreation,
} from '../plan-admission';
import { type AttemptChange, planExecution, replayExecution } from '../plan-execution';
import { planOutcome } from '../plan-outcome';
import { assertClock, planOwnership, planRenewal } from '../plan-ownership';
import { planReceipt, replayReceipt } from '../plan-receipt';
import { planConsumption, planDecision, replayConsumption, replayDecision } from '../plan-signals';
import { addInteger, decisionId, decodeDecision, decodeReceipt } from '../record-codecs';
import {
  decodeAdmission,
  decodeAttemptGuard,
  decodeCompletion,
  decodeExecutionCommand,
  decodeOwnership,
  decodeRun,
  decodeRunGuard,
  manifestDigest,
  ownerId,
  runId,
} from '../record-codecs';
import type { Ownership, OwnershipStatus, Run } from '../records';
import type { RunStore, StoreReply } from '../run-store';
import { createSqliteArtifactStore } from './artifact-store';
import { findExecution, validateAttempt } from './read-executions';
import {
  decodeConsumptionRow,
  decodeDecisionRow,
  decodeReceiptRow,
  findConsumption,
  findDecision,
  findReceipt,
} from './read-signals';
import { decodeAttemptRow, decodeManifestRow, decodeRunRow } from './row-codecs';
import { decodeCompletionRow } from './row-codecs';
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
/** Independent row-level SQLite adapter. Writes plan against a locked view; reads share one snapshot. Close is idempotent and fences both ports, including queued operations. */
export function createSqliteRunStore(
  database: Database,
  options: TransactionOptions,
): { runs: RunStore; artifacts: ArtifactStore; close(): void } {
  let queue = Promise.resolve();
  let closed = false;

  async function transact<T>(write: boolean, operation: () => T): Promise<T> {
    const previous = queue;
    const turn = Promise.withResolvers<undefined>();
    queue = turn.promise;
    await previous;
    try {
      // Proof: bypassing this fence let acquireOwnership resolve after close with the real connection deliberately retained.
      if (closed) throw new Error('run store is closed');
      for (let attempt = 1; attempt <= options.maxBusyAttempts; attempt += 1) {
        try {
          // Proof: bypassing write BEGIN/COMMIT left a durable attempt after the real reservation-abort trigger; the rollback test expected no rows.
          // Proof: bypassing write BEGIN/COMMIT before the injected outbox abort failed 'outbox abort rolls back outcome revisions and capacity before reopen then commits both together'.
          // Proof: injecting atomic reservation bypass failed `reservation insert abort preserves whole prior state across reopen` at its explicit assertion.
          // Proof: injecting atomic consumption bypass failed `consumption insert abort preserves whole prior state across reopen` at its explicit assertion.
          // Proof: injecting atomic receipt bypass failed `receipt insert abort preserves whole prior state across reopen` at its explicit assertion.
          // Proof: bypassing only the read transaction exposed revision 0 with one attempt and one reservation after a real competing-process admission.
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
  function requireAttempt(identity: string) {
    const row = database.query('SELECT * FROM run_attempt WHERE attempt_id=?').get(identity);
    // Proof: injecting sqlite missing attempt bypass failed `sqlite signal edges > missing named attempts throw before inbox or receipt mutation` at its explicit assertion.
    if (row === null) throw new Error('attempt does not exist');
    const { attempt } = decodeAttemptRow(row);
    const { run } = requireRun(attempt.identity.runId);
    // Proof: injecting replay provenance bypass failed `duplicate consumption validates current target provenance before replay` at its explicit assertion.
    // Proof: bypassing required attempt delivery route failed `receipt rejects terminal outbox before state dependent rows change` at its missing-rejection assertion.
    validateAttempt(database, run, attempt);
    return attempt;
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
  function applyChange(run: Run, change: AttemptChange): void {
    database
      .query('UPDATE run_attempt SET record=? WHERE attempt_id=?')
      .run(JSON.stringify(change.attempt), change.attempt.attemptId);
    database
      .query('UPDATE run_record SET record=? WHERE run_id=?')
      .run(JSON.stringify({ ...run, revision: change.runRevision }), run.runId);
    // Proof: bypassing release only settled sqlite enforcement failed 'sqlite execution > unknown effects and takeover retain capacity until determinate quiescence'.
    // Proof: bypassing release settled sqlite enforcement failed 'sqlite execution > unknown effects and takeover retain capacity until determinate quiescence'.
    if (!change.attempt.holdsCapacity)
      database
        .query('DELETE FROM run_reservation WHERE attempt_id=?')
        .run(change.attempt.attemptId);
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
        // Proof: injecting read provenance bypass failed `probe current claim corruption against intact historical execution` at its explicit assertion.
        const pendingIntents = attempts.flatMap(
          // Proof: bypassing inspection delivery route failed `public read rejects terminal outbox present and reopen rejects corruption` at its missing-rejection assertion.
          (attempt) => validateAttempt(database, run, attempt).pendingIntents,
        );
        return {
          version: 1,
          run,
          attempts,
          pendingIntents,
          receipts: database
            .query(
              'SELECT r.* FROM run_receipt r JOIN run_attempt a ON a.attempt_id=r.attempt_id WHERE a.run_id=? ORDER BY r.command_id',
            )
            .all(run.runId)
            .map((row) => decodeReceiptRow(row).receipt),
          decisions: database
            .query(
              'SELECT d.* FROM run_decision d JOIN run_attempt a ON a.attempt_id=d.attempt_id WHERE a.run_id=? ORDER BY d.decision_id',
            )
            .all(run.runId)
            .map(decodeDecisionRow),
          consumedDecisionIds: database
            .query(
              'SELECT c.* FROM run_consumption c JOIN run_attempt a ON a.attempt_id=c.attempt_id WHERE a.run_id=? ORDER BY c.decision_id',
            )
            .all(run.runId)
            .map((row) => decodeConsumptionRow(row).decisionId),
          capacity: readCapacity(readMeta(database).capacity),
        };
      });
    },
    async receiveDecision(inputOwner, inputDecision) {
      // Proof: injecting sqlite decision owner snapshot bypass failed `trusted sqlite decision snapshots request before its transaction wait` at its explicit assertion.
      const ownership = decodeOwnership(structuredClone(inputOwner));
      // Proof: injecting sqlite decision payload snapshot bypass failed `trusted sqlite decision snapshots request before its transaction wait` at its explicit assertion.
      const decision = decodeDecision(structuredClone(inputDecision));
      return await transact(true, () => {
        const { authority } = readAuthority(ownership);
        // Proof: injecting sqlite receiveDecision owner bypass failed `stale receive owner refuses before corrupt target and duplicate reads` at its explicit assertion.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const previous = findDecision(database, decision.decisionId);
        if (previous !== undefined) requireAttempt(previous.attemptId);
        const replay = replayDecision(previous, decision);
        if (replay !== undefined) return finish(replay, authority.observedAt);
        const attempt = requireAttempt(decision.attemptId);
        const { run } = requireRun(attempt.identity.runId);
        const reply = planDecision(attempt, decision);
        if (reply.kind === 'applied') {
          const revision = addInteger(run.revision, 1);
          database
            .query('INSERT INTO run_decision(decision_id,attempt_id,record) VALUES (?,?,?)')
            .run(decision.decisionId, decision.attemptId, JSON.stringify(decision));
          database
            .query('UPDATE run_record SET record=? WHERE run_id=?')
            .run(JSON.stringify({ ...run, revision }), run.runId);
        }
        return finish(reply, authority.observedAt);
      });
    },
    async consumeDecision(inputGuard, inputId) {
      const guard = decodeAttemptGuard(structuredClone(inputGuard));
      const identity = decisionId(inputId);
      return await transact(true, () => {
        const { meta, authority } = readAuthority(guard.ownership);
        // Proof: injecting sqlite consumeDecision owner bypass failed `stale consume owner refuses before corrupt target and duplicate reads` at its explicit assertion.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const previous = findConsumption(database, identity);
        if (previous !== undefined) requireAttempt(previous.reply.attemptId);
        const replay = replayConsumption(previous, guard);
        if (replay !== undefined) return finish(replay, authority.observedAt);
        const decision = findDecision(database, identity);
        // Proof: injecting sqlite missing decision bypass failed `sqlite signal edges > new inbox identities require current wait and legal correlation choice` at its explicit assertion.
        if (decision === undefined) throw new Error('decision does not exist');
        const { run } = requireRun(guard.runId);
        const attempt = requireAttempt(guard.attemptId);
        const reply = planConsumption(
          { run, attempt },
          guard,
          decision,
          readCapacity(meta.capacity),
        );
        if (reply.kind === 'refused') return finish(reply, authority.observedAt);
        applyChange(run, reply.value);
        database
          .query(
            'INSERT INTO run_consumption(decision_id,attempt_id,correlation_key,wait,reply) VALUES (?,?,?,?,?)',
          )
          .run(
            identity,
            attempt.attemptId,
            reply.value.wait.correlationKey,
            JSON.stringify(reply.value.wait),
            JSON.stringify(reply.value.attempt),
          );
        database.query('INSERT INTO run_reservation(attempt_id) VALUES (?)').run(attempt.attemptId);
        return finish({ kind: reply.kind, value: reply.value.attempt }, authority.observedAt);
      });
    },
    async reconcileReceipt(inputGuard, inputReceipt) {
      // Proof: injecting sqlite receipt guard snapshot bypass failed `trusted sqlite receipt snapshots request before its transaction wait` at its explicit assertion.
      const guard = decodeAttemptGuard(structuredClone(inputGuard));
      // Proof: injecting sqlite receipt payload snapshot bypass failed `trusted sqlite receipt snapshots request before its transaction wait` at its explicit assertion.
      const receipt = decodeReceipt(structuredClone(inputReceipt));
      return await transact(true, () => {
        const { authority } = readAuthority(guard.ownership);
        // Proof: injecting sqlite reconcileReceipt owner bypass failed `stale receipt owner refuses before corrupt target and duplicate reads` at its explicit assertion.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const previous = findReceipt(database, receipt.commandId);
        if (previous !== undefined) requireAttempt(previous.reply.attemptId);
        const replay = replayReceipt(previous, guard, receipt);
        if (replay !== undefined) return finish(replay, authority.observedAt);
        const { run } = requireRun(guard.runId);
        const attempt = requireAttempt(guard.attemptId);
        const completionRow = database
          .query('SELECT * FROM run_completion WHERE command_id=?')
          .get(
            attempt.state.kind === 'outcome_pending_progress'
              ? attempt.state.commandId
              : receipt.commandId,
          );
        const intent =
          completionRow === null ? undefined : decodeCompletionRow(completionRow).completion.intent;
        const reply = planReceipt({ run, attempt }, guard, receipt, intent);
        if (reply.kind === 'refused') return finish(reply, authority.observedAt);
        applyChange(run, reply.value);
        database
          .query('INSERT INTO run_receipt(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
          .run(
            receipt.commandId,
            attempt.attemptId,
            JSON.stringify(receipt),
            JSON.stringify(reply.value.attempt),
          );
        database.query('DELETE FROM run_outbox WHERE command_id=?').run(receipt.commandId);
        return finish({ kind: reply.kind, value: reply.value.attempt }, authority.observedAt);
      });
    },
    async commitOutcome(inputGuard, inputCompletion) {
      const guard = decodeAttemptGuard(structuredClone(inputGuard));
      const completion = decodeCompletion(structuredClone(inputCompletion));
      return await transact(true, () => {
        const { authority } = readAuthority(guard.ownership);
        // Proof: bypassing commitOutcome owner sqlite enforcement failed 'sqlite execution edges > unresolved and recovery preserve the exact running locator and held reservation'.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const { run } = requireRun(guard.runId);
        const row = database
          .query('SELECT * FROM run_attempt WHERE attempt_id=?')
          .get(guard.attemptId);
        // Proof: bypassing commitOutcome missing attempt sqlite enforcement failed 'sqlite execution edges > successful effects cannot retry and missing attempts throw without mutations'.
        if (row === null) throw new Error('attempt does not exist');
        const { attempt } = decodeAttemptRow(row);
        // Proof: injecting completion provenance bypass failed `completion rejects current claim corruption against intact historical execution` at its explicit assertion.
        // Proof: reconstructing with the caller's run made `sqlite execution commands > execution command identities distinguish reattachment from original redelivery` fail its doesNotReject assertion for a cross-run guard.
        // Proof: bypassing completion delivery route failed `completion replay rejects terminal outbox before state dependent rows change` at its missing-rejection assertion.
        validateAttempt(database, requireRun(attempt.identity.runId).run, attempt);
        const previous = database
          .query(
            'SELECT * FROM run_completion WHERE command_id=? OR attempt_id=? ORDER BY command_id',
          )
          .all(completion.intent.commandId, attempt.attemptId)
          .map(decodeCompletionRow);
        const reply = planOutcome({ run, attempt, previous: previous[0] }, guard, completion);
        if (reply.kind === 'refused') return finish(reply, authority.observedAt);
        if (reply.kind === 'applied') {
          applyChange(run, reply.value);
          database
            .query('INSERT INTO run_completion(command_id,attempt_id,record) VALUES (?,?,?)')
            .run(completion.intent.commandId, attempt.attemptId, JSON.stringify(completion));
          database
            .query('INSERT INTO run_outbox(command_id) VALUES (?)')
            .run(completion.intent.commandId);
        }
        return finish({ kind: reply.kind, value: reply.value.attempt }, authority.observedAt);
      });
    },
    async recordExecution(inputGuard, inputCommand) {
      const guard = decodeAttemptGuard(structuredClone(inputGuard));
      const command = decodeExecutionCommand(structuredClone(inputCommand));
      return await transact(true, () => {
        const { authority } = readAuthority(guard.ownership);
        // Proof: bypassing recordExecution owner sqlite enforcement failed 'sqlite execution commands > execution command identities distinguish reattachment from original redelivery'.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const previous = findExecution(database, command.commandId);
        const replay = replayExecution(previous, guard, command);
        if (replay !== undefined) return finish(replay, authority.observedAt);
        const { run } = requireRun(guard.runId);
        const row = database
          .query('SELECT * FROM run_attempt WHERE attempt_id=?')
          .get(guard.attemptId);
        // Proof: bypassing recordExecution missing attempt sqlite enforcement failed 'sqlite execution edges > successful effects cannot retry and missing attempts throw without mutations'.
        if (row === null) throw new Error('attempt does not exist');
        const { attempt } = decodeAttemptRow(row);
        // Proof: reconstructing with the caller's run made `sqlite execution commands > execution command identities distinguish reattachment from original redelivery` fail its doesNotReject assertion for a cross-run guard.
        // Proof: bypassing execution delivery route failed `execution rejects terminal outbox before state dependent rows change` at its missing-rejection assertion.
        const { executions: history } = validateAttempt(
          database,
          requireRun(attempt.identity.runId).run,
          attempt,
        );
        // Proof: injecting sqlite fresh wait key bypass failed `sqlite decisions > old consumption preserves its original reply through later waits and owner takeover` at its explicit assertion.
        if (
          command.fact.kind === 'waiting' &&
          history.some(
            (entry) =>
              entry.command.fact.kind === 'waiting' &&
              command.fact.kind === 'waiting' &&
              entry.command.fact.wait.correlationKey === command.fact.wait.correlationKey,
          )
        )
          return finish({ kind: 'refused', reason: 'decision_conflict' }, authority.observedAt);
        const reply = planExecution({ run, attempt }, guard, command.fact);
        if (reply.kind === 'refused') return finish(reply, authority.observedAt);
        if (reply.kind === 'applied') {
          applyChange(run, reply.value);
          database
            .query('INSERT INTO run_execution(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
            .run(
              command.commandId,
              attempt.attemptId,
              JSON.stringify(command),
              JSON.stringify(reply.value.attempt),
            );
        }
        return finish({ kind: reply.kind, value: reply.value.attempt }, authority.observedAt);
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
        for (const { attempt } of history) {
          const { run: targetRun } = requireRun(attempt.identity.runId);
          // Proof: injecting admission provenance bypass failed `admission rejects terminal predecessor missing its confirmed receipt provenance` at its explicit assertion.
          // Proof: bypassing admission delivery route failed `admission rejects terminal outbox before state dependent rows change` at its missing-rejection assertion.
          validateAttempt(database, targetRun, attempt);
        }
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
    artifacts: createSqliteArtifactStore(database, transact),
    close() {
      // Proof: bypassing idempotence called the retained connection's close twice in the public close test.
      if (closed) return;
      database.close();
      closed = true;
    },
  };
}
