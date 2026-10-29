import type { Database } from 'bun:sqlite';

import type { WallClock } from '../../clock';
import type { ArtifactStore } from '../artifact-store';
import {
  decodeClaimAcceptCommand,
  decodeClaimStageCommand,
  decodeScopedAttemptGuard,
  decodeTurnStageCommand,
} from '../execution-codecs';
import {
  permitsMutation,
  planAdmission,
  planManifestRetention,
  planRunCreation,
} from '../plan-admission';
import { planClaimAcceptance, planClaimStage, planTurnStage } from '../plan-claims';
import { type AttemptChange, planExecution, replayExecution } from '../plan-execution';
import { planOutcome } from '../plan-outcome';
import { assertClock, planOwnership, planRenewal } from '../plan-ownership';
import { planReceipt, replayReceipt } from '../plan-receipt';
import { isActiveRecoveryAttempt, planRecoveryBegin, planRecoveryFence } from '../plan-recovery';
import {
  inspectRuntimeScope,
  planRuntimeAcceptance,
  planRuntimePin,
  planRuntimeStage,
} from '../plan-runtime';
import { planConsumption, planDecision, replayConsumption, replayDecision } from '../plan-signals';
import { addInteger, decisionId, decodeDecision, decodeReceipt } from '../record-codecs';
import {
  decodeAdmission,
  decodeAttempt,
  decodeAttemptGuard,
  decodeCompletion,
  decodeCurrentAttempt,
  decodeExecutionCommand,
  decodeOwnership,
  decodeRun,
  decodeRunGuard,
  manifestDigest,
  ownerId,
  runId,
} from '../record-codecs';
import type { Ownership, OwnershipStatus, Run } from '../records';
import { decodeRecoveryBeginCall, decodeRecoveryFenceCall } from '../recovery-codecs';
import type { RunStore, StoreReply } from '../run-store';
import {
  decodeRuntimeAcceptanceInput,
  decodeRuntimeGuard,
  decodeRuntimePin,
  decodeRuntimeScope,
} from '../runtime-codecs';
import { createSqliteArtifactStore } from './artifact-store';
import { findExecution, validateAttempt } from './read-executions';
import { readHistory } from './read-history';
import { readRuntimeCatalog } from './read-runtime';
import { findConsumption, findDecision, findReceipt } from './read-signals';
import { insertRecoveryBegin, insertRecoveryFence } from './recovery-store';
import { decodeAttemptRow, decodeManifestRow, decodeRunRow } from './row-codecs';
import { decodeCompletionRow } from './row-codecs';
import { insertRuntimeAcceptance, insertRuntimeIntent, insertRuntimePin } from './runtime-store';
import { readCapacity, readMeta } from './schema';

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
/** Independent row-level SQLite adapter. Object requests are cloned before queueing; authority and clock observations stay inside the lock. Writes plan against a locked view; reads share one snapshot. Close is idempotent and fences both ports, including queued operations. */
export function createSqliteRunStore(
  database: Database,
  options: TransactionOptions,
): { runs: RunStore; artifacts: ArtifactStore; close(): Promise<void> } {
  let queue = Promise.resolve();
  let closed = false;
  let closing: Promise<void> | undefined;

  async function transact<T>(write: boolean, operation: () => T): Promise<T> {
    const previous = queue;
    const turn = Promise.withResolvers<undefined>();
    queue = turn.promise;
    await previous;
    try {
      // Proof: bypassing this fence let acquireOwnership resolve after close with the real connection deliberately retained.
      // Proof: F67 removing this shared fence failed the retained-connection lifecycle test at pinRuntimeScope's missing closed rejection; exact restoration passed.
      if (closed) throw new Error('run store is closed');
      for (let attempt = 1; attempt <= options.maxBusyAttempts; attempt += 1) {
        try {
          // Proof: bypassing write BEGIN/COMMIT left a durable attempt after the real reservation-abort trigger; the rollback test expected no rows.
          // Proof: bypassing write BEGIN/COMMIT before the injected outbox abort failed 'outbox abort rolls back outcome revisions and capacity before reopen then commits both together'.
          // Proof: injecting atomic reservation bypass failed `reservation insert abort preserves whole prior state across reopen` at its explicit assertion.
          // Proof: injecting atomic consumption bypass failed `consumption insert abort preserves whole prior state across reopen` at its explicit assertion.
          // Proof: injecting atomic receipt bypass failed `receipt insert abort preserves whole prior state across reopen` at its explicit assertion.
          // Proof: bypassing only the read transaction exposed revision 0 with one attempt and one reservation after a real competing-process admission.
          // Proof: F45 omitted write BEGIN and COMMIT around a real abort; 'runtime transaction abort' failed and exact restoration passed.
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
    async stageRecoveryFence(input) {
      // Proof: T4S01 using caller input instead of its snapshot let the clock mutation alter the requested ordinal. Exact restoration passed.
      const snapshot = structuredClone(input);
      const ownership = decodeOwnership(snapshot.guard.ownership);
      // Proof: T4S04 bypassing only this transaction call left fence/journal writes after the late marker abort. Exact restoration passed.
      return await transact(true, () => {
        const { authority } = readAuthority(ownership);
        // Proof: T4S02 removing the current-owner gate replayed an expired-owner fence. Exact restoration passed.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        // Proof: T4S05 moving decoding ahead of this audit reported malformed-input error instead of corrupt retained physical counts; ordering proof only. Exact restoration passed.
        const { catalog } = readHistory(database);
        // Proof: T4S03 omitting trusted decoding admitted a version2 fence. Exact restoration passed.
        const reply = planRecoveryFence(catalog, decodeRecoveryFenceCall(snapshot));
        // Proof: T4S06 omitting publication returned applied again instead of the required retained duplicate. Exact restoration passed.
        if (reply.kind === 'applied') insertRecoveryFence(database, reply.value);
        return finish(reply, authority.observedAt);
      });
    },
    // Proof: T3BCS removed only this new dependency; begin detaches retained caller mutation after submission; exact restoration passed.
    async beginRecovery(input) {
      // Proof: T3BCSCLOCK replacing the snapshot with caller input retained mutation performed by the real clock dependency; exact restoration passed.
      const snapshot = structuredClone(input);
      // Proof: T3BORDERS moving target decoding ahead of this owner boundary threw ValidationError instead of owner_stale; exact restoration passed.
      const ownership = decodeOwnership(snapshot.guard.ownership);
      // Proof: T3BTXN bypassed only this new transaction call; a late marker abort left journal/index rows published; exact restoration passed.
      return await transact(true, () => {
        const { authority } = readAuthority(ownership);
        // Proof: T3B1S removed only this new dependency; the expired-owner begin test observed an applied journal; exact restoration passed.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const { catalog } = readHistory(database);
        const reply = planRecoveryBegin(catalog, decodeRecoveryBeginCall(snapshot));
        if (reply.kind === 'applied') insertRecoveryBegin(database, reply.value);
        return finish(reply, authority.observedAt);
      });
    },
    async pinRuntimeScope(requested, input) {
      const ownership = decodeOwnership(structuredClone(requested));
      const snapshot = structuredClone(input);
      return await transact(true, () => {
        const { meta, authority } = readAuthority(ownership);
        // Proof: F46 bypassed the SQLite pin owner gate; 'current owner fencing precedes corrupt retained' failed and exact restoration passed.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        readHistory(database);
        const pin = decodeRuntimePin(snapshot);
        const catalog = readRuntimeCatalog(database, meta.ownership);
        const reply = planRuntimePin(catalog, pin, meta.ownership.organizationId);
        if (reply.kind === 'applied') insertRuntimePin(database, pin, catalog.scopes.length);
        return finish(reply, authority.observedAt);
      });
    },
    async readRuntimeScope(input) {
      const scope = decodeRuntimeScope(input);
      return await transact(false, () => {
        const meta = readMeta(database);
        const snapshot = inspectRuntimeScope(
          readHistory(database).catalog.runtime,
          scope,
          meta.ownership,
        );
        return snapshot;
      });
    },
    async stageRuntimeRequest(inputGuard, canonicalRequest) {
      const snapshot = structuredClone(inputGuard);
      const ownership = decodeOwnership(snapshot.ownership);
      return await transact(true, () => {
        const { meta, authority } = readAuthority(ownership);
        // Proof: F31 bypassed the SQLite staging owner gate; 'current owner fencing precedes corrupt retained' failed and exact restoration passed.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        readHistory(database);
        const guard = decodeRuntimeGuard(snapshot);
        const catalog = readRuntimeCatalog(database, meta.ownership);
        const reply = planRuntimeStage(catalog, guard, canonicalRequest, meta.ownership);
        if (reply.kind === 'applied')
          insertRuntimeIntent(database, guard.scope, reply.value, catalog.intents.length);
        return finish(reply, authority.observedAt);
      });
    },
    async recordRuntimeAcceptance(inputGuard, input) {
      const snapshotGuard = structuredClone(inputGuard);
      const snapshotInput = structuredClone(input);
      const ownership = decodeOwnership(snapshotGuard.ownership);
      return await transact(true, () => {
        const { meta, authority } = readAuthority(ownership);
        // Proof: F47 bypassed the SQLite acceptance owner gate; 'current owner fencing precedes corrupt retained' failed and exact restoration passed.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        readHistory(database);
        const guard = decodeRuntimeGuard(snapshotGuard);
        const accepted = decodeRuntimeAcceptanceInput(snapshotInput);
        const catalog = readRuntimeCatalog(database, meta.ownership);
        const reply = planRuntimeAcceptance(catalog, guard, accepted, meta.ownership);
        if (reply.kind === 'applied')
          insertRuntimeAcceptance(database, guard.scope, reply.value, catalog.acceptances.length);
        return finish(reply, authority.observedAt);
      });
    },
    acquireOwnership(identity, expectedEpoch) {
      return transact(true, () => {
        const meta = readMeta(database);
        readHistory(database);
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
    async renewOwnership(inputOwner) {
      // Proof: removing this clone failed `submitted renewal snapshots before the first await` at its reply assertion.
      const input = structuredClone(inputOwner);
      return await transact(true, () => {
        const requested = decodeOwnership(input);
        const { meta, authority } = readAuthority(requested);
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        // Proof: F12 removed this audit; the matching 'audits lost execution history after owner fencing' negative resolved despite a missing execution. Exact restoration passed.
        readHistory(database);
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
    async retainManifest(inputOwner, inputManifest) {
      // Proof: removing this clone failed `submitted manifest owner snapshots before the first await` at its reply assertion.
      const input = structuredClone(inputOwner);
      // Proof: removing this clone failed `submitted manifest payload snapshots before the first await` at its reply assertion.
      const manifest = structuredClone(inputManifest);
      return await transact(true, () => {
        const { authority } = readAuthority(decodeOwnership(input));
        // Proof: independently removing this early fence made stale manifest/run requests decode corrupt targets instead of returning owner_stale.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        readHistory(database);
        const reply = planManifestRetention(authority, manifest, findManifest(manifest.digest));
        if (reply.kind === 'applied')
          database
            .query('INSERT INTO run_manifest(digest,record) VALUES (?,?)')
            .run(reply.value.digest, JSON.stringify(reply.value));
        return finish(reply, authority.observedAt);
      });
    },
    readManifest(digest) {
      return transact(false, () => {
        readHistory(database);
        return requireManifest(manifestDigest(digest));
      });
    },
    async createRun(inputOwner, inputRun) {
      // Proof: removing this clone failed `submitted run owner snapshots before the first await` at its reply assertion.
      const input = structuredClone(inputOwner);
      // Proof: removing this clone failed `submitted run payload snapshots before the first await` at its reply assertion.
      const candidate = structuredClone(inputRun);
      return await transact(true, () => {
        const { authority } = readAuthority(decodeOwnership(input));
        const run = decodeRun(candidate);
        // Proof: independently removing this early fence made stale manifest/run requests decode corrupt targets instead of returning owner_stale.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        readHistory(database);
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
      // Proof: F218 replaced only this transaction wrapper with a Promise callback. After the real writer committed, the snapshot case lost its valid read with corrupt run revision provenance; availability proof only, not a returned mixed snapshot.
      return transact(false, () => {
        const snapshot = readHistory(database);
        const { run } = requireRun(runId(identity));
        return {
          version: 3,
          run,
          recoveries: snapshot.catalog.runtime.recovery.histories.flatMap((history) =>
            history.intent.target.kind === 'claim' &&
            history.intent.target.runId === run.runId &&
            history.closure !== null
              ? [history.closure]
              : [],
          ),
          attempts: snapshot.catalog.attempts
            .map((entry) => decodeCurrentAttempt(entry.attempt))
            .filter((attempt) => attempt.identity.runId === run.runId)
            .sort(
              (left, right) =>
                left.identity.occurrenceId.localeCompare(right.identity.occurrenceId) ||
                left.ordinal - right.ordinal,
            ),
          pendingIntents: snapshot.pendingIntents.filter(
            (intent) => intent.claim.runId === run.runId,
          ),
          receipts: snapshot.catalog.receipts
            .filter((entry) => entry.reply.identity.runId === run.runId)
            .map((entry) => entry.receipt),
          decisions: snapshot.catalog.decisions.filter((decision) =>
            snapshot.catalog.attempts.some(
              (entry) =>
                entry.attempt.attemptId === decision.attemptId &&
                entry.attempt.identity.runId === run.runId,
            ),
          ),
          consumedDecisionIds: snapshot.catalog.consumptions
            .filter((entry) => entry.reply.identity.runId === run.runId)
            .map((entry) => entry.decisionId),
          capacity: readCapacity(database, readMeta(database).capacity),
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
        readHistory(database);
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
        readHistory(database);
        // Proof: bypassing this route failed `consumption rejects global` for missing, orphan and settled reservations before restoration.
        const capacity = readCapacity(database, meta.capacity);
        const previous = findConsumption(database, identity);
        if (previous !== undefined) requireAttempt(previous.reply.attemptId);
        const replay = replayConsumption(previous, guard);
        if (replay !== undefined) return finish(replay, authority.observedAt);
        const decision = findDecision(database, identity);
        // Proof: injecting sqlite missing decision bypass failed `sqlite signal edges > new inbox identities require current wait and legal correlation choice` at its explicit assertion.
        if (decision === undefined) throw new Error('decision does not exist');
        const { run } = requireRun(guard.runId);
        const attempt = requireAttempt(guard.attemptId);
        const reply = planConsumption({ run, attempt }, guard, decision, capacity);
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
        const { meta, authority } = readAuthority(guard.ownership);
        // Proof: injecting sqlite reconcileReceipt owner bypass failed `stale receipt owner refuses before corrupt target and duplicate reads` at its explicit assertion.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        readHistory(database);
        // Proof: bypassing this route failed `receipt rejects global` for missing, orphan and settled reservations before restoration.
        readCapacity(database, meta.capacity);
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
        const { meta, authority } = readAuthority(guard.ownership);
        // Proof: bypassing commitOutcome owner sqlite enforcement failed 'sqlite execution edges > unresolved and recovery preserve the exact running locator and held reservation'.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        readHistory(database);
        // Proof: bypassing this route failed `outcome rejects global` for missing, orphan and settled reservations before restoration.
        readCapacity(database, meta.capacity);
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
            .run(
              completion.intent.commandId,
              attempt.attemptId,
              JSON.stringify({ version: 1, completion, reply: reply.value.attempt }),
            );
          database
            .query('INSERT INTO run_outbox(command_id) VALUES (?)')
            .run(completion.intent.commandId);
        }
        return finish({ kind: reply.kind, value: reply.value.attempt }, authority.observedAt);
      });
    },
    readExecutionHistory(inputRun, inputAttempt) {
      return transact(false, () => {
        const history = readHistory(database).histories.find(
          (entry) => entry.run.runId === inputRun && entry.attempt.attemptId === inputAttempt,
        );
        if (history === undefined) throw new Error('attempt does not exist');
        return history;
      });
    },
    async recordExecution(inputGuard, inputCommand) {
      const guardSnapshot = structuredClone(inputGuard);
      const commandSnapshot = structuredClone(inputCommand);
      const ownership = decodeOwnership(guardSnapshot.ownership);
      return await transact(true, () => {
        const { meta, authority } = readAuthority(ownership);
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const snapshot = readHistory(database);
        const guard = decodeAttemptGuard(guardSnapshot);
        const command = decodeExecutionCommand(commandSnapshot);
        // Proof: T3NSEX withholding this call's recovery witnesses admitted the colliding fresh command; exact restoration passed.
        const replay = replayExecution(
          findExecution(database, command.commandId),
          guard,
          command,
          snapshot.catalog.runtime.recovery,
        );
        if (replay !== undefined) {
          if (replay.kind === 'refused') return finish(replay, authority.observedAt);
          if (replay.value.reply.kind !== 'execution')
            throw new Error('execution replay family differs');
          return finish(
            { kind: 'duplicate', value: replay.value.reply.attempt },
            authority.observedAt,
          );
        }
        const { run } = requireRun(guard.runId);
        const attempt = requireAttempt(guard.attemptId);
        // Proof: T3I3S removed this interlock; public reattachment applied and changed the active claiming checkpoint. Exact restoration passed.
        if (
          isActiveRecoveryAttempt(snapshot.catalog.runtime, attempt.attemptId) &&
          command.fact.kind !== 'recovery_required' &&
          command.fact.kind !== 'unresolved'
        )
          return finish({ kind: 'refused', reason: 'state_conflict' }, authority.observedAt);
        const reply = planExecution(
          {
            run,
            attempt,
            manifest: requireManifest(run.manifestDigest),
            ownership: meta.ownership,
            executions: snapshot.catalog.executions,
          },
          guard,
          command.fact,
        );
        if (reply.kind === 'refused') return finish(reply, authority.observedAt);
        applyChange(run, reply.value);
        database
          .query('INSERT INTO run_execution(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
          .run(
            command.commandId,
            attempt.attemptId,
            JSON.stringify({ version: 1, command, context: null }),
            JSON.stringify({ version: 1, kind: 'execution', attempt: reply.value.attempt }),
          );
        return finish({ kind: 'applied', value: reply.value.attempt }, authority.observedAt);
      });
    },
    async stageClaim(inputGuard, inputCommand) {
      // Proof: Task2 F106 bypassed this clone; 'sqlite coupled stage_claim snapshots guard before transaction await' refused the original valid request. Exact restoration passed.
      const guardSnapshot = structuredClone(inputGuard);
      // Proof: Task2 F107 bypassed this clone; 'sqlite coupled stage_claim snapshots command before transaction await' retained the caller-mutated command. Exact restoration passed.
      const commandSnapshot = structuredClone(inputCommand);
      const ownership = decodeOwnership(guardSnapshot.ownership);
      // Proof: Task2 F66 bypassed only this transaction wrapper; 'stage_claim rolls back both histories after execution abort' reached the named abort then detected partial publication. Exact restoration passed.
      return await transact(true, () => {
        const { meta, authority } = readAuthority(ownership);
        // Proof: Task2 F72 removed this owner fence; 'stage_claim fences expired owner before fresh publication' received applied instead of owner_stale. Exact restoration passed.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const snapshot = readHistory(database);
        const guard = decodeScopedAttemptGuard(guardSnapshot);
        const command = decodeClaimStageCommand(commandSnapshot);
        // Proof: T3NSCS withholding this call's recovery witnesses admitted the colliding fresh command; exact restoration passed.
        const replay = replayExecution(
          findExecution(database, command.commandId),
          guard,
          command,
          snapshot.catalog.runtime.recovery,
        );
        if (replay !== undefined) {
          if (replay.kind === 'refused') return finish(replay, authority.observedAt);
          if (replay.value.reply.kind !== 'claim_staged')
            throw new Error('coupled replay family differs');
          return finish({ kind: 'duplicate', value: replay.value.reply }, authority.observedAt);
        }
        const { run } = requireRun(guard.runId);
        const attempt = requireAttempt(guard.attemptId);
        const scope = inspectRuntimeScope(snapshot.catalog.runtime, guard.scope, meta.ownership);
        if (scope.kind !== 'pinned') throw new Error('runtime scope is not pinned');
        const reply = planClaimStage(
          {
            run,
            attempt,
            manifest: requireManifest(run.manifestDigest),
            ownership: meta.ownership,
            executions: snapshot.catalog.executions,
            runtime: snapshot.catalog.runtime,
            scope,
          },
          guard,
          command,
        );
        if (reply.kind === 'refused') return finish(reply, authority.observedAt);
        const ack = reply.value.ack;
        insertRuntimeIntent(
          database,
          guard.scope,
          ack.intent,
          snapshot.catalog.runtime.intents.length,
        );
        applyChange(run, { attempt: ack.attempt, runRevision: reply.value.runRevision });
        database
          .query('INSERT INTO run_execution(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
          .run(
            command.commandId,
            attempt.attemptId,
            JSON.stringify({
              version: 1,
              command,
              context: { version: 1, scopeRevision: scope.revision },
            }),
            JSON.stringify(ack),
          );
        return finish({ kind: 'applied', value: ack }, authority.observedAt);
      });
    },
    async recordClaimAcceptance(inputGuard, inputCommand) {
      // Proof: Task2 F108 bypassed this clone; 'sqlite coupled accept_claim snapshots guard before transaction await' refused the original valid request. Exact restoration passed.
      const guardSnapshot = structuredClone(inputGuard);
      // Proof: Task2 F109 bypassed this clone; 'sqlite coupled accept_claim snapshots command before transaction await' retained the caller-mutated command. Exact restoration passed.
      const commandSnapshot = structuredClone(inputCommand);
      const ownership = decodeOwnership(guardSnapshot.ownership);
      // Proof: Task2 F67 bypassed only this transaction wrapper; 'accept_claim rolls back both histories after execution abort' reached the named abort then detected partial publication. Exact restoration passed.
      return await transact(true, () => {
        const { meta, authority } = readAuthority(ownership);
        // Proof: Task2 F73 removed this owner fence; 'accept_claim fences expired owner before fresh publication' received applied instead of owner_stale. Exact restoration passed.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const snapshot = readHistory(database);
        const guard = decodeScopedAttemptGuard(guardSnapshot);
        const command = decodeClaimAcceptCommand(commandSnapshot);
        // Proof: T3NSCA withholding this call's recovery witnesses admitted the colliding fresh command; exact restoration passed.
        const replay = replayExecution(
          findExecution(database, command.commandId),
          guard,
          command,
          snapshot.catalog.runtime.recovery,
        );
        if (replay !== undefined) {
          if (replay.kind === 'refused') return finish(replay, authority.observedAt);
          if (replay.value.reply.kind !== 'claim_accepted')
            throw new Error('coupled replay family differs');
          return finish({ kind: 'duplicate', value: replay.value.reply }, authority.observedAt);
        }
        const { run } = requireRun(guard.runId);
        const attempt = requireAttempt(guard.attemptId);
        const scope = inspectRuntimeScope(snapshot.catalog.runtime, guard.scope, meta.ownership);
        if (scope.kind !== 'pinned') throw new Error('runtime scope is not pinned');
        const reply = planClaimAcceptance(
          {
            run,
            attempt,
            manifest: requireManifest(run.manifestDigest),
            ownership: meta.ownership,
            executions: snapshot.catalog.executions,
            runtime: snapshot.catalog.runtime,
            scope,
          },
          guard,
          command,
        );
        if (reply.kind === 'refused') return finish(reply, authority.observedAt);
        const ack = reply.value.ack;
        insertRuntimeAcceptance(
          database,
          guard.scope,
          ack.acceptance,
          snapshot.catalog.runtime.acceptances.length,
        );
        applyChange(run, { attempt: ack.attempt, runRevision: reply.value.runRevision });
        database
          .query('INSERT INTO run_execution(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
          .run(
            command.commandId,
            attempt.attemptId,
            JSON.stringify({
              version: 1,
              command,
              context: { version: 1, scopeRevision: scope.revision },
            }),
            JSON.stringify(ack),
          );
        return finish({ kind: 'applied', value: ack }, authority.observedAt);
      });
    },
    async stageTurn(inputGuard, inputCommand) {
      // Proof: Task2 F110 bypassed this clone; 'sqlite coupled stage_turn snapshots guard before transaction await' refused the original valid request. Exact restoration passed.
      const guardSnapshot = structuredClone(inputGuard);
      // Proof: Task2 F111 bypassed this clone; 'sqlite coupled stage_turn snapshots command before transaction await' retained the caller-mutated command. Exact restoration passed.
      const commandSnapshot = structuredClone(inputCommand);
      const ownership = decodeOwnership(guardSnapshot.ownership);
      // Proof: Task2 F68 bypassed only this transaction wrapper; 'stage_turn rolls back both histories after execution abort' reached the named abort then detected partial publication. Exact restoration passed.
      return await transact(true, () => {
        const { meta, authority } = readAuthority(ownership);
        // Proof: Task2 F74 removed this owner fence; 'stage_turn fences expired owner before fresh publication' received applied instead of owner_stale. Exact restoration passed.
        if (!permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        const snapshot = readHistory(database);
        const guard = decodeScopedAttemptGuard(guardSnapshot);
        const command = decodeTurnStageCommand(commandSnapshot);
        // Proof: T3NSTS withholding this call's recovery witnesses admitted the colliding fresh command; exact restoration passed.
        const replay = replayExecution(
          findExecution(database, command.commandId),
          guard,
          command,
          snapshot.catalog.runtime.recovery,
        );
        if (replay !== undefined) {
          if (replay.kind === 'refused') return finish(replay, authority.observedAt);
          if (replay.value.reply.kind !== 'turn_staged')
            throw new Error('coupled replay family differs');
          return finish({ kind: 'duplicate', value: replay.value.reply }, authority.observedAt);
        }
        const { run } = requireRun(guard.runId);
        const attempt = requireAttempt(guard.attemptId);
        const scope = inspectRuntimeScope(snapshot.catalog.runtime, guard.scope, meta.ownership);
        if (scope.kind !== 'pinned') throw new Error('runtime scope is not pinned');
        const reply = planTurnStage(
          {
            run,
            attempt,
            manifest: requireManifest(run.manifestDigest),
            ownership: meta.ownership,
            executions: snapshot.catalog.executions,
            runtime: snapshot.catalog.runtime,
            scope,
          },
          guard,
          command,
        );
        if (reply.kind === 'refused') return finish(reply, authority.observedAt);
        const ack = reply.value.ack;

        applyChange(run, { attempt: ack.attempt, runRevision: reply.value.runRevision });
        database
          .query('INSERT INTO run_execution(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
          .run(
            command.commandId,
            attempt.attemptId,
            JSON.stringify({
              version: 1,
              command,
              context: { version: 1, scopeRevision: scope.revision },
            }),
            JSON.stringify(ack),
          );
        return finish({ kind: 'applied', value: ack }, authority.observedAt);
      });
    },
    async admitAttempt(requestedGuard, requestedAdmission) {
      // Proof: removing this clone failed `submitted admission guard snapshots before the first await` at its reply assertion.
      const inputGuard = structuredClone(requestedGuard);
      // Proof: removing this clone failed `submitted admission payload snapshots before the first await` at its reply assertion.
      const inputAdmission = structuredClone(requestedAdmission);
      return await transact(true, () => {
        const guard = decodeRunGuard(inputGuard);
        const admission = decodeAdmission(inputAdmission);
        const { meta, authority } = readAuthority(guard.ownership);
        // Proof: removing the live-owner fence made shared stale-authority admission throw on an absent target run.
        if (authority.current === null || !permitsMutation(authority))
          return finish({ kind: 'refused', reason: 'owner_stale' }, authority.observedAt);
        readHistory(database);
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
            // Proof: bypassing this route failed `admission rejects global` for missing, orphan and settled reservations before restoration.
            capacity: readCapacity(database, meta.capacity),
            run,
            manifest: requireManifest(run.manifestDigest),
            attempts: history.map((entry) => decodeAttempt(entry.attempt)),
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
    /** Fences both ports immediately, rejects queued work and drains admitted work before one native disposal. Repeated calls share completion; disposal failure preserves its original cause and never retries. */
    close(): Promise<void> {
      // Proof: L3 removed cached completion reuse; the real held-writer lifecycle test failed SQLITE-LIFECYCLE-11 on repeated native disposal. Exact restoration passed.
      if (closing !== undefined) return closing;
      // Proof: L1 omitted only this flag; queued-before-close failed SQLITE-LIFECYCLE-03 and the retained all-method test failed SQLITE-LIFECYCLE-43, with the original transaction guard installed. Exact restoration passed.
      closed = true;
      const accepted = queue;
      closing = (async () => {
        // Proof: L2 omitted this await; the real held-writer lifecycle test failed SQLITE-LIFECYCLE-08 on premature completion. Exact restoration passed.
        await accepted;
        // Proof: L4 swallowed this disposal rejection; the native-failure lifecycle test failed SQLITE-LIFECYCLE-19 on missing original-cause rejection. Exact restoration passed.
        database.close();
      })();
      return closing;
    },
  };
}
