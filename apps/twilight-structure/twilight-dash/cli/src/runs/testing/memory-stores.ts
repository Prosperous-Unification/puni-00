import { randomUUID } from 'node:crypto';

import { parseOrThrow, type } from '@shared/validation';

import type { WallClock } from '../../clock';
import {
  referenceArtifact,
  snapshotArtifactContent,
  verifyArtifactContent,
} from '../artifact-integrity';
import type { ArtifactStore } from '../artifact-store';
import {
  permitsMutation,
  planAdmission,
  planManifestRetention,
  planRunCreation,
} from '../plan-admission';
import {
  type AttemptChange,
  planExecution,
  type RecordedExecution,
  replayExecution,
} from '../plan-execution';
import { planOutcome, type RecordedCompletion } from '../plan-outcome';
import { assertClock, planOwnership, planRenewal } from '../plan-ownership';
import { planReceipt, type RecordedReceipt, replayReceipt } from '../plan-receipt';
import {
  auditRuntimeCatalog,
  inspectRuntimeScope,
  planRuntimeAcceptance,
  planRuntimePin,
  planRuntimeStage,
  type RuntimeCatalog,
  type RuntimeScopeRecord,
} from '../plan-runtime';
import {
  planConsumption,
  planDecision,
  type RecordedConsumption,
  replayConsumption,
  replayDecision,
} from '../plan-signals';
import { decisionId, decodeAttempt, decodeDecision, decodeReceipt } from '../record-codecs';
import {
  addInteger,
  assertInteger,
  decodeAdmission,
  decodeArtifactRef,
  decodeAttemptGuard,
  decodeCompletion,
  decodeExecutionCommand,
  decodeManifest,
  decodeOwnership,
  decodeRun,
  decodeRunGuard,
  equalRecords,
  manifestDigest,
  organizationId,
  ownerId,
  runId,
  storeId,
} from '../record-codecs';
import type { Decision } from '../records';
import type {
  Admission,
  ArtifactRef,
  Attempt,
  Manifest,
  Ownership,
  OwnershipStatus,
  Run,
} from '../records';
import type { RunStore, StoreReply } from '../run-store';
import {
  decodeRuntimeAcceptanceInput,
  decodeRuntimeGuard,
  decodeRuntimePin,
  decodeRuntimeScope,
  runtimeScopeKey,
} from '../runtime-codecs';
import type { RuntimeAcceptance, RuntimeIntent } from '../runtime-records';

export interface MemoryOptions {
  readonly organizationId: OwnershipStatus['organizationId'];
  readonly capacity: number;
  readonly leaseMilliseconds: number;
  readonly clock: WallClock;
}

/** Explicit test bootstrap. Synchronous planning and publication contain no await, so concurrent public calls observe an atomic view. */
export function createMemoryStores(options: MemoryOptions): {
  runs: RunStore;
  artifacts: ArtifactStore;
  ownership: OwnershipStatus;
  close(): void;
} {
  const organization = organizationId(options.organizationId);
  const capacity = options.capacity;
  const leaseMilliseconds = options.leaseMilliseconds;
  assertInteger(capacity, 1);
  assertInteger(leaseMilliseconds, 1);
  // Proof: removing clock-shape validation failed the bootstrap prerequisite test on omitted and malformed clocks.
  parseOrThrow(type({ read: 'Function' }), options.clock);
  const clock = options.clock;
  let lastObservedAt = clock.read();
  assertInteger(lastObservedAt);
  let status: OwnershipStatus = {
    storeId: storeId(randomUUID()),
    organizationId: organization,
    epoch: 0,
    owner: null,
  };
  let isClosed = false;
  let reserved = 0;
  const runtimeScopes = new Map<string, RuntimeScopeRecord>();
  const runtimeIntents = new Map<string, RuntimeIntent>();
  const runtimeAcceptances = new Map<string, RuntimeAcceptance>();
  const runtimeCounts = { scopes: 0, intents: 0, acceptances: 0 };
  function readRuntimeCatalog(): RuntimeCatalog {
    if (
      // Proof: F50 ignored a dropped memory pin with a retained count; 'memory count audit' failed and exact restoration passed.
      runtimeScopes.size !== runtimeCounts.scopes ||
      runtimeIntents.size !== runtimeCounts.intents ||
      runtimeAcceptances.size !== runtimeCounts.acceptances
    )
      throw new Error('corrupt memory runtime counts');
    const catalog = structuredClone({
      scopes: [...runtimeScopes.values()],
      intents: [...runtimeIntents.values()],
      acceptances: [...runtimeAcceptances.values()],
    });
    auditRuntimeCatalog(catalog, status);
    return catalog;
  }
  function advanceRuntime(scope: Parameters<typeof runtimeScopeKey>[0], revision: number): void {
    const key = runtimeScopeKey(scope);
    const retained = runtimeScopes.get(key);
    if (retained === undefined) throw new Error('runtime scope is not pinned');
    runtimeScopes.set(key, { ...retained, revision });
  }
  const decisions = new Map<string, Decision>();
  const consumptions = new Map<string, RecordedConsumption>();
  const receipts = new Map<string, RecordedReceipt>();
  const completions = new Map<string, RecordedCompletion>();
  const executions = new Map<string, RecordedExecution>();
  const blobs = new Map<string, { reference: ArtifactRef; content: Uint8Array }>();
  const manifests = new Map<Manifest['digest'], Manifest>();
  const runs = new Map<Run['runId'], Run>();
  const initialRuns = new Map<Run['runId'], Run>();
  const attempts = new Map<Attempt['attemptId'], Attempt>();
  const admissions = new Map<Admission['attemptId'], Admission>();

  function assertOpen(): void {
    // Proof: bypassing this lifecycle fence failed the bootstrap/closed-store test on all seven public operations.
    if (isClosed) throw new Error('run store is closed');
  }
  function observeClock(): number {
    assertOpen();
    const observedAt = clock.read();
    assertClock(observedAt, lastObservedAt);
    return observedAt;
  }
  function readManifest(digest: Manifest['digest']): Manifest {
    const manifest = manifests.get(digest);
    // Proof: removing this absence diagnostic failed the trusted missing-records test instead of reporting missing retained content.
    if (manifest === undefined) throw new Error('manifest does not exist');
    return decodeManifest(structuredClone(manifest));
  }
  function readRun(identity: Run['runId']): Run {
    const run = runs.get(identity);
    // Proof: removing this absence diagnostic failed the trusted missing-records test instead of reporting a missing run.
    if (run === undefined) throw new Error('run does not exist');
    return decodeRun(structuredClone(run));
  }
  function readAuthority(requested: Ownership, observedAt: number) {
    return { current: structuredClone(status.owner), requested, observedAt, lastObservedAt };
  }
  function finishReply<T>(reply: StoreReply<T>, observedAt: number): StoreReply<T> {
    // Proof: persisting only applied observations let renewal at 1049 follow owner_busy at
    // 1050; `refused ownership acquisition persists the greatest clock observation` resolved.
    lastObservedAt = observedAt;
    // Proof: replacing provider cloning with identity operations failed `caller mutation cannot change retained manifests, runs, attempts or returned snapshots`.
    return structuredClone(reply);
  }
  function publishOwnership(
    reply: StoreReply<Ownership>,
    observedAt: number,
  ): StoreReply<Ownership> {
    if (reply.kind !== 'refused') {
      status = { ...status, epoch: reply.value.epoch, owner: structuredClone(reply.value) };
    }
    return finishReply(reply, observedAt);
  }
  function applyChange(run: Run, previous: Attempt, change: AttemptChange): void {
    // Proof: bypassing release only settled memory enforcement failed 'memory execution > unknown effects and takeover retain capacity until determinate quiescence'.
    // Proof: bypassing release settled memory enforcement failed 'memory execution > unknown effects and takeover retain capacity until determinate quiescence'.
    if (previous.holdsCapacity && !change.attempt.holdsCapacity) reserved -= 1;
    // Proof: injecting memory capacity reacquisition bypass failed `memory decisions > decisions retain complete identity and consume only the exact wait once` at its explicit assertion.
    if (!previous.holdsCapacity && change.attempt.holdsCapacity) reserved += 1;
    attempts.set(change.attempt.attemptId, structuredClone(change.attempt));
    runs.set(run.runId, { ...run, revision: change.runRevision });
  }
  function requireAttempt(identity: Attempt['attemptId']): Attempt {
    const attempt = attempts.get(identity);
    // Proof: injecting testing missing attempt bypass failed `memory signal edges > missing named attempts throw before inbox or receipt mutation` at its explicit assertion.
    if (attempt === undefined) throw new Error('attempt does not exist');
    return decodeAttempt(structuredClone(attempt));
  }
  const port: RunStore = {
    async pinRuntimeScope(requested, input) {
      const ownership = decodeOwnership(structuredClone(requested));
      const snapshot = structuredClone(input);
      const observedAt = observeClock();
      // Proof: F48 bypassed the memory pin owner gate; 'owner fencing precedes corrupt or absent' failed and exact restoration passed.
      if (!permitsMutation(readAuthority(ownership, observedAt)))
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      const pin = decodeRuntimePin(snapshot);
      const reply = planRuntimePin(readRuntimeCatalog(), pin, organization);
      if (reply.kind === 'applied') {
        runtimeScopes.set(runtimeScopeKey(pin.scope), structuredClone({ pin, revision: 0 }));
        runtimeCounts.scopes = addInteger(runtimeCounts.scopes, 1);
      }
      return await Promise.resolve(finishReply(reply, observedAt));
    },
    async readRuntimeScope(input) {
      assertOpen();
      return await Promise.resolve(
        structuredClone(
          inspectRuntimeScope(readRuntimeCatalog(), decodeRuntimeScope(input), status),
        ),
      );
    },
    async stageRuntimeRequest(inputGuard, canonicalRequest) {
      const snapshot = structuredClone(inputGuard);
      const observedAt = observeClock();
      const ownership = decodeOwnership(snapshot.ownership);
      // Proof: F32 bypassed the memory staging owner gate; 'owner fencing precedes corrupt or absent' failed and exact restoration passed.
      if (!permitsMutation(readAuthority(ownership, observedAt)))
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      const guard = decodeRuntimeGuard(snapshot);
      const reply = planRuntimeStage(readRuntimeCatalog(), guard, canonicalRequest, status);
      if (reply.kind === 'applied') {
        runtimeIntents.set(reply.value.commandId, structuredClone(reply.value));
        runtimeCounts.intents = addInteger(runtimeCounts.intents, 1);
        advanceRuntime(guard.scope, reply.value.stagedRevision);
      }
      return await Promise.resolve(finishReply(reply, observedAt));
    },
    async recordRuntimeAcceptance(inputGuard, input) {
      const snapshotGuard = structuredClone(inputGuard);
      const snapshotInput = structuredClone(input);
      const observedAt = observeClock();
      const ownership = decodeOwnership(snapshotGuard.ownership);
      // Proof: F49 bypassed the memory acceptance owner gate; 'owner fencing precedes corrupt or absent' failed and exact restoration passed.
      if (!permitsMutation(readAuthority(ownership, observedAt)))
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      const guard = decodeRuntimeGuard(snapshotGuard);
      const accepted = decodeRuntimeAcceptanceInput(snapshotInput);
      const reply = planRuntimeAcceptance(readRuntimeCatalog(), guard, accepted, status);
      if (reply.kind === 'applied') {
        runtimeAcceptances.set(reply.value.commandId, structuredClone(reply.value));
        runtimeCounts.acceptances = addInteger(runtimeCounts.acceptances, 1);
        advanceRuntime(guard.scope, reply.value.acceptedRevision);
      }
      return await Promise.resolve(finishReply(reply, observedAt));
    },
    async acquireOwnership(identity, expectedEpoch) {
      const observedAt = observeClock();
      return await Promise.resolve(
        publishOwnership(
          planOwnership(
            structuredClone(status),
            ownerId(identity),
            expectedEpoch,
            observedAt,
            lastObservedAt,
            leaseMilliseconds,
          ),
          observedAt,
        ),
      );
    },
    async renewOwnership(requested) {
      const observedAt = observeClock();
      const ownership = decodeOwnership(structuredClone(requested));
      // Proof: removing the null-owner renewal refusal made the unowned-bootstrap test throw.
      if (status.owner === null)
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      return await Promise.resolve(
        publishOwnership(
          planRenewal(
            structuredClone(status.owner),
            ownership,
            observedAt,
            lastObservedAt,
            leaseMilliseconds,
          ),
          observedAt,
        ),
      );
    },
    async retainManifest(requested, input) {
      const observedAt = observeClock();
      const ownership = decodeOwnership(structuredClone(requested));
      const manifest = structuredClone(input);
      const reply = planManifestRetention(
        readAuthority(ownership, observedAt),
        manifest,
        structuredClone(manifests.get(manifest.digest)),
      );
      if (reply.kind === 'applied') {
        manifests.set(reply.value.digest, structuredClone(reply.value));
      }
      return await Promise.resolve(finishReply(reply, observedAt));
    },
    async readManifest(digest) {
      assertOpen();
      return await Promise.resolve(readManifest(manifestDigest(digest)));
    },
    async createRun(requested, input) {
      const observedAt = observeClock();
      const ownership = decodeOwnership(structuredClone(requested));
      const run = decodeRun(structuredClone(input));
      const reply = planRunCreation(
        readAuthority(ownership, observedAt),
        run,
        structuredClone(initialRuns.get(run.runId)),
        structuredClone(runs.get(run.runId)),
        structuredClone(manifests.get(run.manifestDigest)),
      );
      if (reply.kind === 'applied') {
        runs.set(run.runId, structuredClone(reply.value));
        initialRuns.set(run.runId, structuredClone(reply.value));
      }
      return await Promise.resolve(finishReply(reply, observedAt));
    },
    async readRun(identity) {
      assertOpen();
      const run = readRun(runId(identity));
      return await Promise.resolve(
        structuredClone({
          version: 1,
          run,
          attempts: [...attempts.values()].filter(
            (attempt) => attempt.identity.runId === run.runId,
          ),
          pendingIntents: [...completions.values()]
            .filter(
              (entry) =>
                entry.completion.intent.authority.runId === run.runId &&
                !receipts.has(entry.completion.intent.commandId),
            )
            .map((entry) => entry.completion.intent),
          receipts: [...receipts.values()]
            .filter((entry) => entry.reply.identity.runId === run.runId)
            .map((entry) => entry.receipt),
          decisions: [...decisions.values()].filter(
            (decision) => requireAttempt(decision.attemptId).identity.runId === run.runId,
          ),
          consumedDecisionIds: [...consumptions.values()]
            .filter((entry) => entry.reply.identity.runId === run.runId)
            .map((entry) => entry.decisionId),
          capacity: { limit: capacity, reserved },
        }),
      );
    },
    async receiveDecision(inputOwner, inputDecision) {
      const ownership = decodeOwnership(structuredClone(inputOwner));
      const decision = decodeDecision(structuredClone(inputDecision));
      const observedAt = observeClock();
      // Proof: injecting testing receiveDecision owner bypass failed `memory signal edges > new inbox identities require current wait and legal correlation choice` at its explicit assertion.
      if (!permitsMutation(readAuthority(ownership, observedAt)))
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      const replay = replayDecision(decisions.get(decision.decisionId), decision);
      if (replay !== undefined) return finishReply(replay, observedAt);
      const attempt = requireAttempt(decision.attemptId);
      const run = readRun(attempt.identity.runId);
      const reply = planDecision(attempt, decision);
      if (reply.kind === 'applied') {
        const revision = addInteger(run.revision, 1);
        decisions.set(decision.decisionId, structuredClone(decision));
        runs.set(run.runId, { ...run, revision });
      }
      return await Promise.resolve(finishReply(reply, observedAt));
    },
    async consumeDecision(inputGuard, inputId) {
      const guard = decodeAttemptGuard(structuredClone(inputGuard));
      const identity = decisionId(inputId);
      const observedAt = observeClock();
      // Proof: injecting testing consumeDecision owner bypass failed `memory decisions > old consumption preserves its original reply through later waits and owner takeover` at its explicit assertion.
      if (!permitsMutation(readAuthority(guard.ownership, observedAt)))
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      const replay = replayConsumption(consumptions.get(identity), guard);
      if (replay !== undefined) return finishReply(replay, observedAt);
      const decision = decisions.get(identity);
      // Proof: injecting testing missing decision bypass failed `memory signal edges > new inbox identities require current wait and legal correlation choice` at its explicit assertion.
      if (decision === undefined) throw new Error('decision does not exist');
      const run = readRun(guard.runId);
      const attempt = requireAttempt(guard.attemptId);
      const reply = planConsumption({ run, attempt }, guard, decision, {
        limit: capacity,
        reserved,
      });
      if (reply.kind === 'refused') return finishReply(reply, observedAt);
      applyChange(run, attempt, reply.value);
      consumptions.set(
        identity,
        structuredClone({
          decisionId: identity,
          wait: reply.value.wait,
          reply: reply.value.attempt,
        }),
      );
      return await Promise.resolve(
        finishReply({ kind: reply.kind, value: reply.value.attempt }, observedAt),
      );
    },
    async reconcileReceipt(inputGuard, inputReceipt) {
      const guard = decodeAttemptGuard(structuredClone(inputGuard));
      const receipt = decodeReceipt(structuredClone(inputReceipt));
      const observedAt = observeClock();
      // Proof: injecting testing reconcileReceipt owner bypass failed `memory signal edges > historical receipt retries refuse changed evidence or authority and expired owner` at its explicit assertion.
      if (!permitsMutation(readAuthority(guard.ownership, observedAt)))
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      const replay = replayReceipt(receipts.get(receipt.commandId), guard, receipt);
      if (replay !== undefined) return finishReply(replay, observedAt);
      const run = readRun(guard.runId);
      const attempt = requireAttempt(guard.attemptId);
      const reply = planReceipt(
        { run, attempt },
        guard,
        receipt,
        completions.get(
          attempt.state.kind === 'outcome_pending_progress'
            ? attempt.state.commandId
            : receipt.commandId,
        )?.completion.intent,
      );
      if (reply.kind === 'refused') return finishReply(reply, observedAt);
      applyChange(run, attempt, reply.value);
      receipts.set(receipt.commandId, structuredClone({ receipt, reply: reply.value.attempt }));
      return await Promise.resolve(
        finishReply({ kind: reply.kind, value: reply.value.attempt }, observedAt),
      );
    },
    async commitOutcome(inputGuard, inputCompletion) {
      const observedAt = observeClock();
      const guard = decodeAttemptGuard(structuredClone(inputGuard));
      const completion = decodeCompletion(structuredClone(inputCompletion));
      const authority = readAuthority(guard.ownership, observedAt);
      // Proof: bypassing commitOutcome owner memory enforcement failed 'memory execution edges > unresolved and recovery preserve the exact running locator and held reservation'.
      if (!permitsMutation(authority))
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      const run = readRun(guard.runId);
      const attempt = attempts.get(guard.attemptId);
      // Proof: bypassing commitOutcome missing attempt memory enforcement failed 'memory execution edges > successful effects cannot retry and missing attempts throw without mutations'.
      if (attempt === undefined) throw new Error('attempt does not exist');
      const previous =
        completions.get(completion.intent.commandId) ??
        [...completions.values()].find((entry) => entry.attemptId === attempt.attemptId);
      const reply = planOutcome(
        { run, attempt: structuredClone(attempt), previous: structuredClone(previous) },
        guard,
        completion,
      );
      if (reply.kind === 'refused') return finishReply(reply, observedAt);
      if (reply.kind === 'applied') {
        applyChange(run, attempt, reply.value);
        completions.set(
          completion.intent.commandId,
          structuredClone({ attemptId: attempt.attemptId, completion }),
        );
      }
      return await Promise.resolve(
        finishReply({ kind: reply.kind, value: reply.value.attempt }, observedAt),
      );
    },
    async recordExecution(inputGuard, inputCommand) {
      const observedAt = observeClock();
      const guard = decodeAttemptGuard(structuredClone(inputGuard));
      const command = decodeExecutionCommand(structuredClone(inputCommand));
      const authority = readAuthority(guard.ownership, observedAt);
      // Proof: bypassing recordExecution owner memory enforcement failed 'memory execution commands > execution command identities distinguish reattachment from original redelivery'.
      if (!permitsMutation(authority))
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      const replay = replayExecution(
        structuredClone(executions.get(command.commandId)),
        guard,
        command,
      );
      if (replay !== undefined) return finishReply(replay, observedAt);
      const run = readRun(guard.runId);
      const attempt = attempts.get(guard.attemptId);
      // Proof: bypassing recordExecution missing attempt memory enforcement failed 'memory execution edges > successful effects cannot retry and missing attempts throw without mutations'.
      if (attempt === undefined) throw new Error('attempt does not exist');
      // Proof: injecting testing fresh wait key bypass failed `memory decisions > old consumption preserves its original reply through later waits and owner takeover` at its explicit assertion.
      if (
        command.fact.kind === 'waiting' &&
        [...executions.values()].some(
          (entry) =>
            entry.reply.attemptId === attempt.attemptId &&
            entry.command.fact.kind === 'waiting' &&
            command.fact.kind === 'waiting' &&
            entry.command.fact.wait.correlationKey === command.fact.wait.correlationKey,
        )
      )
        return finishReply({ kind: 'refused', reason: 'decision_conflict' }, observedAt);
      const reply = planExecution({ run, attempt: structuredClone(attempt) }, guard, command.fact);
      if (reply.kind === 'refused') return finishReply(reply, observedAt);
      if (reply.kind === 'applied') {
        applyChange(run, attempt, reply.value);
        executions.set(command.commandId, structuredClone({ command, reply: reply.value.attempt }));
      }
      return await Promise.resolve(
        finishReply({ kind: reply.kind, value: reply.value.attempt }, observedAt),
      );
    },
    async admitAttempt(inputGuard, inputAdmission) {
      const observedAt = observeClock();
      const guard = decodeRunGuard(structuredClone(inputGuard));
      const admission = decodeAdmission(structuredClone(inputAdmission));
      // Proof: reading before this fence made `stale authority refuses before reading an
      // absent target run` throw `run does not exist` instead of refusing owner_stale.
      if (status.owner === null || !permitsMutation(readAuthority(guard.ownership, observedAt)))
        return finishReply({ kind: 'refused', reason: 'owner_stale' }, observedAt);
      const run = readRun(guard.runId);
      const reply = planAdmission(
        structuredClone({
          ownership: status.owner,
          observedAt,
          lastObservedAt,
          capacity: { limit: capacity, reserved },
          run,
          manifest: readManifest(run.manifestDigest),
          attempts: [...attempts.values()].filter(
            (attempt) =>
              attempt.attemptId === admission.attemptId ||
              (attempt.identity.runId === run.runId &&
                attempt.identity.occurrenceId === admission.identity.occurrenceId),
          ),
          admissions: [...admissions.values()].filter(
            (record) =>
              record.attemptId === admission.attemptId ||
              (record.identity.runId === run.runId &&
                record.identity.occurrenceId === admission.identity.occurrenceId),
          ),
        }),
        guard,
        admission,
      );
      if (reply.kind === 'refused') return finishReply(reply, observedAt);
      if (reply.kind === 'applied') {
        attempts.set(reply.value.attempt.attemptId, structuredClone(reply.value.attempt));
        admissions.set(admission.attemptId, structuredClone(admission));
        runs.set(run.runId, { ...run, revision: reply.value.runRevision });
        if (reply.value.reserveSlot) reserved += 1;
      }
      return await Promise.resolve(
        finishReply({ kind: reply.kind, value: reply.value.attempt }, observedAt),
      );
    },
  };
  const artifacts: ArtifactStore = {
    async retainArtifact(input, mediaType) {
      assertOpen();
      const content = snapshotArtifactContent(input);
      const reference = referenceArtifact(content, mediaType);
      const existing = blobs.get(reference.digest);
      if (existing !== undefined) {
        verifyArtifactContent(existing.content, existing.reference);
        // Proof: bypassing artifact retain metadata memory enforcement failed 'memory artifacts > retains immutable bytes and refuses metadata collisions'.
        if (!equalRecords(reference, existing.reference))
          return await Promise.resolve({ kind: 'refused', reason: 'metadata_conflict' });
        return await Promise.resolve({
          kind: 'retained',
          reference: structuredClone(existing.reference),
        });
      }
      blobs.set(reference.digest, { reference: structuredClone(reference), content });
      const retained = blobs.get(reference.digest);
      // Proof: bypassing artifact readback memory enforcement failed 'memory retention requires readback after a failed map write'.
      if (retained === undefined) throw new Error('artifact does not exist after retention');
      verifyArtifactContent(retained.content, retained.reference);
      return await Promise.resolve({
        kind: 'retained',
        reference: structuredClone(retained.reference),
      });
    },
    async readArtifact(input) {
      assertOpen();
      const reference = decodeArtifactRef(structuredClone(input));
      const retained = blobs.get(reference.digest);
      // Proof: bypassing artifact missing memory enforcement failed 'memory artifacts > retains immutable bytes and refuses metadata collisions'.
      if (retained === undefined) throw new Error('artifact does not exist');
      verifyArtifactContent(retained.content, retained.reference);
      // Proof: bypassing artifact read metadata memory enforcement failed 'memory artifacts > retains immutable bytes and refuses metadata collisions'.
      if (!equalRecords(reference, retained.reference))
        throw new Error('artifact metadata differs');
      return await Promise.resolve(new Uint8Array(retained.content));
    },
  };
  return {
    runs: port,
    artifacts,
    ownership: structuredClone(status),
    close: () => {
      isClosed = true;
    },
  };
}
