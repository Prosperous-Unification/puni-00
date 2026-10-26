import type { ActivityExecutor, ActivitySession } from '../agents/activity-executor';
import { snapshotExecutorLocator, snapshotPreparation } from '../agents/execution-codecs';
import type { ExecutorLocator, Preparation } from '../agents/execution-records';
import type { ArtifactStore } from './artifact-store';
import { addInteger, decodeAttempt, equalRecords, executionCommandId } from './record-codecs';
import { type PreparationInput, recordPreparation } from './record-preparation';
import type { Attempt, ExecutionCommandId } from './records';
import type { AttemptGuard, RunStore, StoreRefusal } from './run-store';

export type PreparationReply =
  | { readonly kind: 'prepared'; readonly session: ActivitySession; readonly attempt: Attempt }
  | {
      readonly kind: 'pending';
      readonly attempt: Attempt;
      readonly reason:
        'preparation_already_recorded' | 'cancelled_before_dispatch' | 'executor_unresolved';
    }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal };

/** A failed external dispatch retaining detached portable correlation and its original private cause. */
export class PreparationDispatchError extends Error {
  readonly preparation: Preparation;
  readonly locator: ExecutorLocator | null;

  constructor(preparation: Preparation, locator: ExecutorLocator | null, cause: unknown) {
    // Proof: F22 dropped the cause; F23 exposed cause text in the message. The throwing-open test failed each assertion; exact restoration passed.
    super('Preparation dispatch failed', { cause });
    this.name = 'PreparationDispatchError';
    this.preparation = snapshotPreparation(preparation);
    this.locator = locator === null ? null : snapshotExecutorLocator(locator);
  }
}

/** Reads live cancellation without narrowing a mutable signal across awaited ownership renewal. */
function isCancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Opens only for a newly committed preparation, then retains its locator before publishing
 * the original live session. Replays and uncertain dispatch retain capacity without reopening.
 * Pending attempts are historical preparation acknowledgements, not refreshed current state.
 * Renewal checks local ownership immediately before dispatch; later takeover is not fenced.
 * Trusted-state failures before dispatch propagate; dispatch failures retain safe correlation.
 */
export async function prepareActivity(
  runs: Pick<RunStore, 'readRun' | 'readManifest' | 'recordExecution' | 'renewOwnership'>,
  artifacts: ArtifactStore,
  executor: ActivityExecutor,
  guard: AttemptGuard,
  input: { readonly preparation: PreparationInput; readonly openedCommandId: ExecutionCommandId },
  signal: AbortSignal,
): Promise<PreparationReply> {
  // Proof: F18/F19 aliased guard/preparation; the corresponding submitted-snapshot tests failed valid dispatch after caller edits. Exact restoration passed.
  const snapshotGuard = structuredClone(guard);
  const snapshot = structuredClone(input.preparation);
  // Proof: F01 bypassed this codec; malformed-command dispatch opened once and failed the zero-open assertion. Exact restoration passed.
  const openedCommandId = executionCommandId(input.openedCommandId);
  // Proof: F02 removed this check; reused-command dispatch failed the expected preflight rejection after opening. Exact restoration passed.
  if (openedCommandId === snapshot.commandId)
    throw new Error('preparation command identity reused');
  // Proof: F03/F04 removed kind/version comparison separately; each actual-adapter-pin test failed with missing rejection. Exact restoration passed.
  if (executor.kind !== snapshot.executor.kind || executor.version !== snapshot.executor.version)
    throw new Error('preparation adapter pin differs');
  const retained = await recordPreparation(runs, artifacts, snapshotGuard, snapshot);
  // Proof: F05 removed refusal handling; preparation-store-refusal failed with an exception instead of its typed refusal. Exact restoration passed.
  if (retained.kind === 'refused') return retained;
  // Proof: F07 bypassed this decoder; corrupt-applied-capacity failed with missing rejection. Exact restoration passed.
  const attempt = decodeAttempt(structuredClone(retained.value));
  // Proof: F06 removed duplicate election handling; concurrent same-command replies incorrectly included a second prepared reply. Exact restoration passed.
  if (retained.kind === 'duplicate')
    return { kind: 'pending', attempt, reason: 'preparation_already_recorded' };
  // Proof: F08 removed this check; corrupt-applied-checkpoint failed its expected boundary error with a TypeError. Exact restoration passed; no provider-publication claim.
  if (attempt.state.kind !== 'preparing') throw new Error('preparation checkpoint differs');
  const intent = attempt.state.preparation;
  const preparation = snapshotPreparation(intent.preparation);
  // Proof: F09 removed correspondence; corrupt-applied-preparation failed with missing rejection. Exact restoration passed.
  if (!equalRecords(preparation, snapshot.preparation))
    throw new Error('retained preparation differs');
  // Proof: F10 removed early cancellation; cancellation-before-renewal failed because the abandoned dispatch extended its lease. Exact restoration passed.
  if (isCancelled(signal)) return { kind: 'pending', attempt, reason: 'cancelled_before_dispatch' };
  const renewed = await runs.renewOwnership(snapshotGuard.ownership);
  // Proof: F11 bypassed refusal; held-renewal takeover opened and threw a correlated save failure instead of refusing before open. Exact restoration passed.
  if (renewed.kind === 'refused') return renewed;
  // Proof: F12 removed this live recheck; held-renewal cancellation returned prepared instead of pending. Exact restoration passed.
  if (isCancelled(signal)) return { kind: 'pending', attempt, reason: 'cancelled_before_dispatch' };
  let locator: ExecutorLocator | null = null;
  try {
    const opened = await executor.open(preparation, signal);
    // Proof: F24 removed not-started handling; its pending-checkpoint test threw instead of returning pending. Exact restoration passed.
    if (opened.kind === 'not_started')
      return { kind: 'pending', attempt, reason: 'cancelled_before_dispatch' };
    // Proof: F25 removed unresolved handling; its pending-checkpoint test threw instead of returning pending. Exact restoration passed.
    if (opened.kind === 'unresolved') {
      // Proof: F13 removed correspondence; mismatching-unresolved-preparation failed with missing rejection. Exact restoration passed.
      if (!equalRecords(snapshotPreparation(opened.preparation), preparation))
        throw new Error('unresolved preparation differs');
      return { kind: 'pending', attempt, reason: 'executor_unresolved' };
    }
    // Proof: F14 bypassed validation and malformed-locator failed its correlated-error boundary assertion (no publication claim). F20 aliased the locator and caller-mutation failed the persisted session-ID assertion. Exact restorations passed.
    locator = snapshotExecutorLocator(opened.session.locator);
    // Proof: F21 removed await; the held-save test observed published=true before commit. Exact restoration and the same selector passed.
    const committed = await runs.recordExecution(
      {
        ...snapshotGuard,
        // Proof: F17 refreshed both revisions after an intervening recovery fact; held-open-intervening failed with missing rejection. Exact restoration passed.
        expectedRevision: addInteger(snapshotGuard.expectedRevision, 1),
        expectedAttemptRevision: attempt.revision,
      },
      {
        version: 2,
        kind: 'execution',
        // Proof: F26 reread mutable caller command identity; caller-mutation failed the retained command-ID assertion. Exact restoration passed.
        commandId: openedCommandId,
        fact: { kind: 'session_prepared', locator, owner: intent.owner },
      },
    );
    // Proof: F15 removed refusal handling; locator-persistence-refused failed with missing rejection and exposed a prepared reply. Exact restoration passed.
    if (committed.kind === 'refused')
      throw new Error('session preparation refused: ' + committed.reason);
    // Proof: F27 synthesized a session from its locator; the deferred-publication test failed original opaque object identity. Exact restoration passed.
    return { kind: 'prepared', session: opened.session, attempt: committed.value };
  } catch (cause) {
    // Proof: F16 rethrew the provider cause; throwing-open failed its PreparationDispatchError correlation assertion. Exact restoration passed.
    throw new PreparationDispatchError(preparation, locator, cause);
  }
}
