import {
  type AttemptChange,
  type AttemptFacts,
  changeAttempt,
  checkAttempt,
  isExecuting,
} from './plan-execution';
import { equalRecords } from './record-codecs';
import type { AttemptId, AttemptState, Completion } from './records';
import type { AttemptGuard, StoreReply } from './run-store';

export interface RecordedCompletion {
  readonly attemptId: AttemptId;
  readonly completion: Completion;
}
/** Plans the indivisible local outcome/outbox transition for an authorized provider view; artifacts were already verified by the application operation. */
export function planOutcome(
  facts: AttemptFacts & { readonly previous: RecordedCompletion | undefined },
  guard: AttemptGuard,
  completion: Completion,
): StoreReply<AttemptChange> {
  // Proof: bypassing outcome cross run enforcement failed 'memory execution commands > execution command identities distinguish reattachment from original redelivery'.
  if (facts.attempt.identity.runId !== guard.runId)
    return { kind: 'refused', reason: 'identity_conflict' };
  if (facts.previous !== undefined) {
    // Proof: bypassing outcome duplicate content enforcement failed 'memory outcomes > completion commits one immutable pending intent with outcome and releases capacity exactly once'.
    // Proof: bypassing outcome duplicate target enforcement failed 'memory completion collisions > completion command collisions across attempts refuse without releasing the other reservation'.
    if (
      facts.previous.attemptId !== guard.attemptId ||
      !equalRecords(facts.previous.completion, completion)
    )
      return { kind: 'refused', reason: 'identity_conflict' };
    return {
      kind: 'duplicate',
      value: { attempt: facts.attempt, runRevision: facts.run.revision },
    };
  }
  const conflict = checkAttempt(facts, guard);
  if (conflict !== undefined) return conflict;
  const transition = planOutcomeTransition(facts, completion);
  // Proof: bypassing live completion refusal routing failed `memory outcomes > completion refuses stale revisions wrong authority outcome mismatch and unsettled effects without mutations` at its explicit assertion.
  if (transition.kind === 'refused') return transition;
  return changeAttempt(facts, transition.value, false);
}
/** Validates completion consequences without live owner or revision observations, for trusted provenance reconstruction. */
export function planOutcomeTransition(
  facts: AttemptFacts,
  completion: Completion,
): StoreReply<AttemptState> {
  const state = facts.attempt.state;
  // Proof: bypassing outcome state enforcement failed 'memory outcomes > completion commits one immutable pending intent with outcome and releases capacity exactly once'.
  if (!isExecuting(state) || state.claim === null)
    return { kind: 'refused', reason: 'state_conflict' };
  // Proof: bypassing outcome authority enforcement failed 'memory outcomes > completion refuses stale revisions wrong authority outcome mismatch and unsettled effects without mutations'.
  // Proof: bypassing outcome operation enforcement failed 'memory outcomes > completion refuses stale revisions wrong authority outcome mismatch and unsettled effects without mutations'.
  if (
    !equalRecords(completion.intent.authority, state.claim) ||
    completion.quiescence.operationKey !== facts.attempt.identity.operationKey
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: bypassing outcome equality enforcement failed 'memory outcomes > completion refuses stale revisions wrong authority outcome mismatch and unsettled effects without mutations'.
  if (!equalRecords(completion.outcome, completion.intent.outcome))
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: bypassing outcome unknown enforcement failed 'memory execution edges > failed completion refuses unknown effect and permits settled failure'.
  // Proof: bypassing outcome success effect enforcement failed 'memory outcomes > completion refuses stale revisions wrong authority outcome mismatch and unsettled effects without mutations'.
  if (
    completion.quiescence.effect === 'unknown' ||
    (completion.outcome.kind === 'succeeded' && completion.quiescence.effect !== 'succeeded')
  )
    return { kind: 'refused', reason: 'state_conflict' };
  return {
    kind: 'applied',
    value: {
      kind: 'outcome_pending_progress',
      claim: state.claim,
      outcome: completion.outcome,
      commandId: completion.intent.commandId,
      quiescence: completion.quiescence,
    },
  };
}
