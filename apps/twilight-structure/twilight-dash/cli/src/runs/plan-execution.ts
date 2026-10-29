import type { Attachment, ClaimRef, Located } from './claim-records';
import type {
  Attempt2,
  Checkpoint,
  ExecutionSubmission,
  RecordedExecution,
} from './execution-records';
import { addInteger, equalRecords } from './record-codecs';
import type {
  Attempt,
  AttemptState,
  ExecutionFact,
  Manifest,
  OwnershipStatus,
  Run,
} from './records';
import type { AttemptGuard, ScopedAttemptGuard, StoreReply } from './run-store';
import { equalRuntimeScopes, readRuntimeRequest } from './runtime-codecs';
export type { RecordedExecution } from './execution-records';
export interface AttemptFacts {
  readonly run: Run;
  readonly attempt: Attempt;
}
export interface AttemptChange {
  readonly attempt: Attempt;
  readonly runRevision: number;
}
export interface ExecutionFacts extends AttemptFacts {
  readonly manifest: Manifest;
  readonly ownership: OwnershipStatus;
  readonly executions: readonly RecordedExecution[];
}
/** Validates both revisions in the adapter's authorized view of the named attempt. */
export function checkAttempt(
  facts: AttemptFacts,
  guard: AttemptGuard,
): StoreReply<never> | undefined {
  // Proof: bypassing execution revision enforcement failed 'memory outcomes > completion refuses stale revisions wrong authority outcome mismatch and unsettled effects without mutations'.
  // Proof: bypassing attempt revision enforcement failed 'memory outcomes > completion refuses stale revisions wrong authority outcome mismatch and unsettled effects without mutations'.
  if (
    facts.run.revision !== guard.expectedRevision ||
    facts.attempt.revision !== guard.expectedAttemptRevision
  )
    return { kind: 'refused', reason: 'revision_conflict' };
  return undefined;
}

/** Extracts one nonrecursive checkpoint without discarding its retained wrapper. */
export function executionCheckpoint(
  candidate: AttemptState | Attempt['state'] | Attempt,
): Checkpoint {
  const state = 'state' in candidate ? candidate.state : candidate;
  return 'checkpoint' in state ? state.checkpoint : state;
}
/** Active and uncertain execution retains its capacity reservation. */
export function isExecuting(state: Attempt['state']): boolean {
  return (
    state.kind !== 'interrupted' &&
    state.kind !== 'waiting_for_person' &&
    state.kind !== 'outcome_pending_progress' &&
    state.kind !== 'terminal'
  );
}
export function advanceAttempt(
  attempt: Attempt,
  state: AttemptState,
  holdsCapacity: boolean,
): Attempt2 {
  // Proof: R2F47 removed only this check; 'recovery hold cannot advance through an ordinary Attempt2 acknowledgement' lost its required rejection. Exact restoration passed.
  if (attempt.version !== 2)
    throw new Error('recovery hold cannot advance through ordinary execution');
  return { ...attempt, state, holdsCapacity, revision: addInteger(attempt.revision, 1) };
}
export function changeAttempt(
  facts: AttemptFacts,
  state: AttemptState,
  holdsCapacity: boolean,
): StoreReply<AttemptChange & { readonly attempt: Attempt2 }> {
  return {
    kind: 'applied',
    value: {
      attempt: advanceAttempt(facts.attempt, state, holdsCapacity),
      runRevision: addInteger(facts.run.revision, 1),
    },
  };
}
/** Resolves the complete immutable claim binding to its local delivery reference. */
export function claimReference(
  checkpoint: Extract<Checkpoint, { kind: 'ready' | 'turn_pending' | 'turn_returned' }>,
): ClaimRef {
  const intent = checkpoint.execution.binding.intent;
  const request = readRuntimeRequest(intent.canonicalRequest);
  if ('kind' in request.operation || request.operation.action.kind !== 'claim')
    throw new Error('claim binding operation differs');
  const preparation = checkpoint.execution.session.preparation.preparation;
  return {
    version: 1,
    commandId: intent.commandId,
    requestDigest: intent.requestDigest,
    runId: preparation.identity.runId,
    attemptId: preparation.attemptId,
  };
}
function replaceAttachment(checkpoint: Checkpoint, attachment: Attachment): Checkpoint {
  if ('session' in checkpoint)
    return { ...checkpoint, session: { ...checkpoint.session, attachment } };
  if ('execution' in checkpoint)
    return {
      ...checkpoint,
      execution: {
        ...checkpoint.execution,
        session: { ...checkpoint.execution.session, attachment },
      },
    };
  throw new Error('attachment checkpoint has no session');
}
function located(checkpoint: Checkpoint): Located | undefined {
  return 'session' in checkpoint
    ? checkpoint.session
    : 'execution' in checkpoint
      ? checkpoint.execution.session
      : undefined;
}
/** Pure consequences shared by fresh mutations and reconstruction at each actual predecessor. */
export function planExecutionTransition(
  facts: ExecutionFacts,
  fact: ExecutionFact,
): StoreReply<AttemptState> {
  const state = facts.attempt.state;
  // Proof: R2F08 removed only hold refusal; 'applied barrier removes latest authority' admitted generic recovery execution. Exact restoration passed.
  if (state.kind === 'recovery_hold' || !isExecuting(state))
    return { kind: 'refused', reason: 'state_conflict' };
  const checkpoint = executionCheckpoint(state);
  switch (fact.kind) {
    case 'preparation_intended': {
      // Proof: Task2 F59 broke only P12 queued ordering; 'fresh preparation refuses' received applied instead of the intended refusal. Exact restored subset passed.
      if (state.kind !== 'queued') return { kind: 'refused', reason: 'state_conflict' };
      const intent = fact.intent;
      const observation = intent.target.observation;
      // Proof: Task2 F60 broke only P13 retained preparation correspondence9samples; 'raw preparation refuses coherent (manifest|executor kind|executor version|attempt|run|work|project|organization|step) mismatch' received applied instead of the intended refusal in all9 distinct preparation cases. Exact restored subset passed.
      if (
        intent.manifestDigest !== facts.run.manifestDigest ||
        facts.manifest.digest !== facts.run.manifestDigest ||
        !Object.hasOwn(facts.manifest.executorVersions, intent.executor.kind) ||
        facts.manifest.executorVersions[intent.executor.kind] !== intent.executor.version ||
        intent.preparation.attemptId !== facts.attempt.attemptId ||
        !equalRecords(intent.preparation.identity, facts.attempt.identity) ||
        observation.workItemId !== facts.run.workItemId ||
        observation.scope.projectId !== facts.run.projectId ||
        observation.scope.organizationId !== facts.ownership.organizationId ||
        observation.stepCode !== intent.selection.stepCode
      )
        return { kind: 'refused', reason: 'authority_conflict' };
      // Proof: Task2 F62 broke only P14 global creation key; 'preparation creation key cannot' received applied instead of the intended refusal. Exact restored subset passed.
      if (
        facts.executions.some(
          (entry) =>
            entry.command.kind === 'execution' &&
            entry.command.fact.kind === 'preparation_intended' &&
            entry.command.fact.intent.preparation.attemptId !== facts.attempt.attemptId &&
            entry.command.fact.intent.preparation.creationKey === intent.preparation.creationKey &&
            equalRecords(entry.command.fact.intent.executor, intent.executor),
        )
      )
        return { kind: 'refused', reason: 'identity_conflict' };
      return { kind: 'applied', value: { kind: 'preparing', preparation: intent } };
    }
    case 'session_prepared': {
      if (checkpoint.kind !== 'preparing') return { kind: 'refused', reason: 'state_conflict' };
      const preparation = checkpoint.preparation;
      // Proof: Task2 F15 disabled this correspondence check; the valid coherent wrong-operation locator was applied instead of refused. Exact restored subset passed.
      // Proof: Task2 F48 broke only P15 preparation correspondence; 'valid complete locator must match retained preparation' received applied instead of the intended refusal. Exact restored subset passed.
      // Proof: Task2 F49 broke only P15 selection correspondence; 'valid complete locator must match retained preparation' received applied instead of the intended refusal. Exact restored subset passed.
      // Proof: Task2 F50 broke only P15 executor version; 'valid complete locator must match retained preparation' received applied instead of the intended refusal. Exact restored subset passed.
      // Proof: Task2 F51 broke only P15 executor kind; 'valid complete locator must match retained preparation' received applied instead of the intended refusal. Exact restored subset passed.
      // Proof: Task2 F52 broke only P15 opened owner; 'valid complete locator must match retained preparation' received applied instead of the intended refusal. Exact restored subset passed.
      if (
        !equalRecords(fact.locator.preparation, preparation.preparation) ||
        !equalRecords(fact.locator.selection, preparation.selection) ||
        fact.locator.executor !== preparation.executor.kind ||
        fact.locator.executorVersion !== preparation.executor.version ||
        fact.locator.session.operationKey !== facts.attempt.identity.operationKey ||
        !equalRecords(fact.owner, preparation.owner)
      )
        return { kind: 'refused', reason: 'authority_conflict' };
      return {
        kind: 'applied',
        value: {
          kind: 'prepared',
          session: {
            version: 1,
            preparation,
            locator: fact.locator,
            attachment: { version: 1, kind: 'opened', owner: fact.owner },
          },
        },
      };
    }
    case 'session_reattached': {
      const session = located(checkpoint);
      if (session === undefined) return { kind: 'refused', reason: 'state_conflict' };
      // Proof: F04 removed same-epoch attachment label equality; 'history rejects same epoch reattachment' accepted the historical relabel. Exact restoration passed.
      if (
        !equalRecords(session.locator, fact.locator) ||
        fact.owner.epoch < session.attachment.owner.epoch ||
        (fact.owner.epoch === session.attachment.owner.epoch &&
          fact.owner.ownerId !== session.attachment.owner.ownerId) ||
        fact.owner.epoch > facts.ownership.epoch ||
        (fact.owner.epoch === facts.ownership.epoch &&
          fact.owner.ownerId !== facts.ownership.owner?.ownerId)
      )
        return { kind: 'refused', reason: 'authority_conflict' };
      const attached = replaceAttachment(checkpoint, {
        version: 1,
        kind: 'reattached',
        owner: fact.owner,
        evidence: fact.evidence,
      });
      return {
        kind: 'applied',
        value: state.kind === 'unresolved' ? { ...state, checkpoint: attached } : attached,
      };
    }
    case 'turn_observed': {
      if (checkpoint.kind !== 'turn_pending') return { kind: 'refused', reason: 'state_conflict' };
      const turn = checkpoint.turn;
      // Proof: Task2 F16 disabled pending-turn identity comparison; the wrong turnKey observation was applied instead of refused. Exact restored subset passed.
      // Proof: Task2 F53 broke only P17 complete turn owner; 'exact completed turn reply resolves only its pending identity from direct$' received applied instead of the intended refusal. Exact restored subset passed.
      // Proof: Task2 F54 broke only P17 complete turn locator; 'exact completed turn reply resolves only its pending identity from direct$' received applied instead of the intended refusal. Exact restored subset passed.
      if (
        !equalRecords(fact.reply.identity, {
          locator: turn.locator,
          turnKey: turn.request.turnKey,
          owner: turn.request.owner,
        })
      )
        return { kind: 'refused', reason: 'identity_conflict' };
      if (fact.reply.kind === 'completed')
        return {
          kind: 'applied',
          value: {
            kind: 'turn_returned',
            execution: checkpoint.execution,
            turn,
            reply: fact.reply,
          },
        };
      if (fact.reply.kind === 'not_started')
        return {
          kind: 'applied',
          value: { kind: 'ready', execution: checkpoint.execution, cause: turn.request.cause },
        };
      return {
        kind: 'applied',
        value: { kind: 'unresolved', checkpoint, observation: { kind: 'turn', reply: fact.reply } },
      };
    }
    case 'recovery_required':
      return { kind: 'applied', value: { kind: 'reconciling', checkpoint, reason: fact.reason } };
    case 'unresolved':
      return {
        kind: 'applied',
        value: {
          kind: 'unresolved',
          checkpoint,
          observation: { kind: 'artifact', reason: fact.reason, evidence: fact.evidence },
        },
      };
    case 'interrupted':
    case 'waiting':
      if (fact.quiescence.operationKey !== facts.attempt.identity.operationKey)
        return { kind: 'refused', reason: 'authority_conflict' };
      if (fact.kind === 'waiting') {
        // Proof: Task2 F58 broke only P18 determinate waiting quiescence; 'waiting requires exact claim unique choices and determinate quiescence' received applied instead of the intended refusal. Exact restored subset passed.
        if (
          (checkpoint.kind !== 'turn_pending' && checkpoint.kind !== 'turn_returned') ||
          fact.quiescence.effect === 'unknown'
        )
          return { kind: 'refused', reason: 'state_conflict' };
        return {
          kind: 'applied',
          value: {
            kind: 'waiting_for_person',
            checkpoint,
            wait: fact.wait,
            quiescence: fact.quiescence,
          },
        };
      }
      if (fact.quiescence.effect === 'unknown')
        return {
          kind: 'applied',
          value: {
            kind: 'unresolved',
            checkpoint,
            observation: {
              kind: 'artifact',
              reason: 'quiescence effect unknown',
              evidence: fact.quiescence.evidence,
            },
          },
        };
      return {
        kind: 'applied',
        value: { kind: 'interrupted', checkpoint, quiescence: fact.quiescence },
      };
  }
}
/** Checks current revisions and current provenance only for a fresh command, after the provider's owner fence and replay lookup. */
export function planExecution(
  facts: ExecutionFacts,
  guard: AttemptGuard,
  fact: ExecutionFact,
): StoreReply<AttemptChange & { readonly attempt: Attempt2 }> {
  if (facts.attempt.identity.runId !== guard.runId)
    return { kind: 'refused', reason: 'identity_conflict' };
  const conflict = checkAttempt(facts, guard);
  if (conflict !== undefined) return conflict;
  const owner = { ownerId: guard.ownership.ownerId, epoch: guard.ownership.epoch };
  // Proof: Task2 F61 broke only P19 current preparation owner; 'raw preparation refuses coherent owner' received applied instead of the intended refusal. Exact restored subset passed.
  if (
    (fact.kind === 'preparation_intended' && !equalRecords(fact.intent.owner, owner)) ||
    (fact.kind === 'session_reattached' && !equalRecords(fact.owner, owner))
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  if (
    fact.kind === 'waiting' &&
    facts.executions.some(
      (entry) =>
        entry.reply.attempt.attemptId === facts.attempt.attemptId &&
        entry.command.kind === 'execution' &&
        entry.command.fact.kind === 'waiting' &&
        entry.command.fact.wait.correlationKey === fact.wait.correlationKey,
    )
  )
    return { kind: 'refused', reason: 'decision_conflict' };
  const transition = planExecutionTransition(facts, fact);
  if (transition.kind === 'refused') return transition;
  return changeAttempt(facts, transition.value, isExecuting(transition.value));
}
/** The current owner authorizes historical replay; guard revisions and provider context never replace original identity. */
export function replayExecution(
  previous: RecordedExecution | undefined,
  guard: AttemptGuard | ScopedAttemptGuard,
  command: ExecutionSubmission,
): StoreReply<RecordedExecution> | undefined {
  if (previous === undefined) return undefined;
  // Proof: Task2 F24 removed command payload comparison; changing canonical wire bytes under the same local ID returned duplicate. Exact restored subset passed.
  if (
    previous.reply.attempt.attemptId !== guard.attemptId ||
    previous.reply.attempt.identity.runId !== guard.runId ||
    !equalRecords(previous.command, command)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  if ('scope' in guard) {
    const checkpoint = executionCheckpoint(previous.reply.attempt.state);
    const session = located(checkpoint);
    // Proof: Task2 F25 removed replay scope equality; acceptance replay under another scope returned duplicate. Exact restored subset passed.
    if (
      session === undefined ||
      !equalRuntimeScopes(session.preparation.target.observation.scope, guard.scope)
    )
      return { kind: 'refused', reason: 'identity_conflict' };
  }
  return { kind: 'duplicate', value: previous };
}
