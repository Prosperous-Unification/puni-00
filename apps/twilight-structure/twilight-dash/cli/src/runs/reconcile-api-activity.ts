import { parseOrThrow, type } from '@shared/validation';

import type { ActivityExecutor } from '../agents/activity-executor';
import type { ApiModelSettings } from '../agents/api-model-settings';
import {
  ExecutorLocatorCodec,
  PreparationCodec,
  snapshotExecutorLocator,
  snapshotPreparation,
} from '../agents/execution-codecs';
import type { ExecutorLocator, Preparation } from '../agents/execution-records';
import type { ArtifactStore } from './artifact-store';
import { readExecutionHistory } from './claim-history';
import { executionCheckpoint } from './plan-execution';
import { decodeAttemptGuard, equalRecords, executionCommandId } from './record-codecs';
import { recordExecution } from './record-execution';
import type { Attempt, ExecutionCommandId } from './records';
import type { AttemptGuard, RunStore, StoreRefusal } from './run-store';

export type ApiRecoveryReply =
  | {
      readonly kind: 'recorded';
      readonly acknowledgement: 'applied' | 'duplicate';
      readonly attempt: Attempt;
    }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal }
  | { readonly kind: 'cancelled'; readonly attempt: Attempt };

type RecoveryRuns = Pick<
  RunStore,
  | 'readExecutionHistory'
  | 'readManifest'
  | 'readRuntimeScope'
  | 'renewOwnership'
  | 'recordExecution'
>;
// Proof: S05 bypassed lookup decoding; malformed real lookup output was published and its rejection test failed. Exact restored case passed.
const lookupCodec = type({
  kind: "'unresolved'",
  preparation: PreparationCodec,
  reason: "'unsupported'",
}).onUndeclaredKey('reject');
// Proof: P14/P15/P16 relaxed reason/kind/unknown-key checks; transformed actual resume replies lost rejection. Exact restored cases passed.
const resumeCodec = type({
  kind: "'unresolved'",
  locator: ExecutorLocatorCodec,
  reason: "'unsupported'",
}).onUndeclaredKey('reject');

/** An operational recovery failure with portable correlation and an unmodified private cause. */
export class ApiRecoveryError extends Error {
  readonly target: Pick<AttemptGuard, 'runId' | 'attemptId'>;
  readonly preparation: Preparation | null;
  readonly locator: ExecutorLocator | null;
  constructor(
    target: Pick<AttemptGuard, 'runId' | 'attemptId'>,
    preparation: Preparation | null,
    locator: ExecutorLocator | null,
    cause: unknown,
  ) {
    super('API activity recovery failed', { cause });
    this.name = 'ApiRecoveryError';
    this.target = { runId: target.runId, attemptId: target.attemptId };
    this.preparation = preparation === null ? null : snapshotPreparation(preparation);
    this.locator = locator === null ? null : snapshotExecutorLocator(locator);
  }
}

/** Matches the actual API pin and complete unsupported profile; it does not inspect configured selection. */
// Proof: P04/P05/P06 bypassed version/kind/capabilities; mismatching actual-adapter inputs lost refusal. Exact restored cases passed.
function matchesProfile(executor: ActivityExecutor, version: string): boolean {
  return (
    executor.kind === 'api-model' &&
    executor.version === version &&
    equalRecords(executor.capabilities, {
      locateSession: 'unsupported',
      resumeSession: 'unsupported',
      deduplicatePreparation: 'unsupported',
      deduplicateTurn: 'unsupported',
      inspectEffect: 'unsupported',
      cancelPhysicalWork: 'unsupported',
      observeQuiescence: 'unsupported',
    })
  );
}
/** Decodes and detaches only exact correlated unsupported observations before further IO. */
function snapshotObservation(
  input: unknown,
  preparation: Preparation,
  locator: ExecutorLocator | null,
) {
  if (locator === null) {
    // Proof: Fix1-lookup removed only this clone; post-return mutation during real held retention kept artifact JSON unsupported but published transport_lost in memory and reopened SQLite. Exact restored same cases passed.
    const observation = structuredClone(parseOrThrow(lookupCodec, input));
    // Proof: P12 removed preparation correlation; a foreign reply obtained from the real lookup was retained. Exact restored case passed.
    if (!equalRecords(observation.preparation, preparation))
      throw new Error('recovery preparation differs');
    return observation;
  }
  // Proof: Fix1-resume removed only this clone; post-return mutation during real held retention kept artifact JSON unsupported but published transport_lost in memory and reopened SQLite. Exact restored same cases passed.
  const observation = structuredClone(parseOrThrow(resumeCodec, input));
  // Proof: P13 removed locator correlation; a foreign reply obtained from the real resume was retained. Exact restored case passed.
  if (!equalRecords(observation.locator, locator)) throw new Error('recovery locator differs');
  return observation;
}

/**
 * Retains actual unsupported lookup/resume evidence without changing the historical checkpoint or capacity.
 * The executor/selection association is trusted factory composition, not introspection of opaque adapter configuration.
 * Exact recorded retries replay their original acknowledgement without querying again; concurrent fresh readers may both query.
 * Cancellation before a query is controlled abandonment, never physical-stop evidence. Logical recovery/write states refuse.
 * @throws Missing/corrupt trusted history, invalid external replies and operational failures; query/retention/publication errors retain portable identity and original cause.
 */
export async function reconcileApiActivity(
  runs: RecoveryRuns,
  artifacts: ArtifactStore,
  adapter: {
    readonly executor: ActivityExecutor;
    readonly selection: ApiModelSettings['selection'];
  },
  guard: AttemptGuard,
  commandId: ExecutionCommandId,
  signal: AbortSignal,
): Promise<ApiRecoveryReply> {
  // Proof: P01 aliased the guard; caller edits during held recovery retargeted publication and failed the valid original-target case. Exact restoration passed.
  const snapshotGuard = decodeAttemptGuard(structuredClone(guard));
  const submittedCommandId = executionCommandId(commandId);
  const executor = adapter.executor;
  // Proof: S04 reread the descriptor after held history; caller edits changed the submitted selection and failed valid recording. Exact restoration passed.
  const { bindingDigest, requestedType, matchedType, stepCode, className } = adapter.selection;
  const selection = structuredClone(
    parseOrThrow(ExecutorLocatorCodec.get('selection'), {
      bindingDigest,
      requestedType,
      matchedType,
      stepCode,
      className,
    }),
  );
  let preparation: Preparation | null = null;
  let locator: ExecutorLocator | null = null;
  try {
    // Proof: P02 bypassed verified history; required missing/corrupt/unreadable evidence lost rejection before recovery. Exact restored case passed.
    const history = await readExecutionHistory(
      runs,
      artifacts,
      snapshotGuard.runId,
      snapshotGuard.attemptId,
    );
    const attempt = history.attempt;
    // Proof: P27 removed active-state exclusion; settled checkpoints reached the backend. P28 version-only removal survived this exclusion and was removed as redundant; no independent version-guard proof is claimed. Exact restored cases passed.
    if (
      ![
        'preparing',
        'prepared',
        'claiming',
        'ready',
        'turn_pending',
        'turn_returned',
        'reconciling',
        'unresolved',
      ].includes(attempt.state.kind)
    )
      return { kind: 'refused', reason: 'state_conflict' };
    const checkpoint = executionCheckpoint(attempt);
    // Proof: P24 removed this boundary; wrapped queued input threw a TypeError instead of typed state_conflict. Diagnostic/refusal proof only; exact restoration passed.
    if (checkpoint.kind === 'queued') return { kind: 'refused', reason: 'state_conflict' };
    const session =
      checkpoint.kind === 'preparing'
        ? null
        : 'session' in checkpoint
          ? checkpoint.session
          : checkpoint.execution.session;
    const intent =
      checkpoint.kind === 'preparing'
        ? checkpoint.preparation
        : ('session' in checkpoint ? checkpoint.session : checkpoint.execution.session).preparation;
    preparation = snapshotPreparation(intent.preparation);
    locator = session === null ? null : snapshotExecutorLocator(session.locator);
    // Proof: P03 relaxed retained selection matching; a different supplied selection was recorded. P04–P06 cover actual adapter pin/profile checks; exact restorations passed.
    if (
      intent.executor.kind !== 'api-model' ||
      !equalRecords(selection, intent.selection) ||
      !matchesProfile(executor, intent.executor.version)
    )
      return { kind: 'refused', reason: 'identity_conflict' };
    const previous = history.executions.find(
      (entry) => entry.command.commandId === submittedCommandId,
    );
    if (previous !== undefined) {
      // Proof: P25/P26 removed command-family/reason refusal; collisions lost typed refusal and foreign unresolved semantics replayed. Exact restorations passed.
      if (
        previous.command.kind !== 'execution' ||
        previous.command.fact.kind !== 'unresolved' ||
        previous.command.fact.reason !== 'unsupported'
      )
        return { kind: 'refused', reason: 'identity_conflict' };
      const bytes = await artifacts.readArtifact(previous.command.fact.evidence);
      // Proof: P20 skipped retained semantic decoding; actual retained {} evidence replayed as valid. Exact restored case passed.
      snapshotObservation(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
        preparation,
        locator,
      );
      const replay = await recordExecution(runs, artifacts, snapshotGuard, previous.command);
      // Proof: P19 removed refusal routing; stale-owner replay returned recorded instead of owner_stale. Exact restored case passed.
      if (replay.kind === 'refused') return replay;
      return { kind: 'recorded', acknowledgement: replay.kind, attempt: replay.value };
    }
    // Proof: P08 removed revision preflight; a stale cut queried the real adapter before unchanged provider fencing refused publication. Exact restored case passed.
    if (
      history.run.revision !== snapshotGuard.expectedRevision ||
      attempt.revision !== snapshotGuard.expectedAttemptRevision
    )
      return { kind: 'refused', reason: 'revision_conflict' };
    const isCancelled = () => signal.aborted;
    // Proof: P10 removed early cancellation; the abandoned operation renewed actual ownership. Exact restored case passed.
    if (isCancelled()) return { kind: 'cancelled', attempt };
    const renewed = await runs.renewOwnership(snapshotGuard.ownership);
    // Proof: P09 removed renewal-refusal routing; stale ownership still queried the real adapter. Provider fencing remained effective; exact restored case passed.
    if (renewed.kind === 'refused') return renewed;
    // Proof: P11 removed this live recheck; renewal-time cancellation queried and recorded instead of returning controlled cancellation. Exact restoration passed.
    if (isCancelled()) return { kind: 'cancelled', attempt };
    // Proof: P07 removed the final profile check; an adapter changed during renewal still queried. Exact restored case passed.
    if (!matchesProfile(executor, intent.executor.version))
      return { kind: 'refused', reason: 'identity_conflict' };
    const observation = snapshotObservation(
      locator === null
        ? await executor.lookupSession(preparation, signal)
        : await executor.resumeSession(locator, signal),
      preparation,
      locator,
    );
    // Proof: S01 removed this await; the held real retention case observed early threw settlement, not successful persistence. Exact restored case passed.
    const retained = await artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify(observation)),
      'application/json',
    );
    // Proof: P17 removed refusal handling; metadata_conflict still rejected via the later shape boundary but lost the intended cause. Diagnostic proof only; exact restoration passed.
    if (retained.kind === 'refused')
      throw new Error('recovery evidence retention refused: ' + retained.reason);
    // Proof: S02 removed this await; the held real publication case observed early returned settlement. Exact restored case passed.
    const recorded = await recordExecution(runs, artifacts, snapshotGuard, {
      version: 2,
      kind: 'execution',
      commandId: submittedCommandId,
      // Proof: S03 mapped unsupported to interrupted; actual reserved capacity fell 1->0. Replacement still refused independently; exact restoration passed.
      fact: { kind: 'unresolved', reason: observation.reason, evidence: retained.reference },
    });
    // Proof: P18 removed refusal routing; takeover during held actual IO returned recorded instead of owner_stale. Existing provider fencing still refused the write; exact restoration passed.
    if (recorded.kind === 'refused') return recorded;
    return { kind: 'recorded', acknowledgement: recorded.kind, attempt: recorded.value };
  } catch (cause) {
    // Proof: red-operational-target failed missing original-cause/portable-target handling; the same history/renewal/publication cases passed after this boundary was added.
    throw new ApiRecoveryError(snapshotGuard, preparation, locator, cause);
  }
}
