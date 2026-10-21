import { addInteger, equalRecords } from './record-codecs';
import type {
  Attempt,
  AttemptState,
  ClaimAuthority,
  ExecutionCommand,
  ExecutionFact,
  Run,
} from './records';
import type { AttemptGuard, StoreReply } from './run-store';

export interface AttemptFacts {
  readonly run: Run;
  readonly attempt: Attempt;
}
export interface AttemptChange {
  readonly attempt: Attempt;
  readonly runRevision: number;
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
/** Checks the external claim's complete local run/attempt/project/work/occurrence binding. */
function matchesClaim(facts: AttemptFacts, claim: ClaimAuthority): boolean {
  return (
    claim.runId === facts.run.runId &&
    claim.attemptId === facts.attempt.attemptId &&
    // Proof: bypassing claim local authority enforcement failed 'memory execution > execution requires exact claim authority and matching operation'.
    claim.projectId === facts.run.projectId &&
    claim.workItemId === facts.run.workItemId &&
    claim.occurrenceId === facts.attempt.identity.occurrenceId
  );
}
/** Names the states in which external execution may still be live or uncertain. */
export function isExecuting(
  state: AttemptState,
): state is Extract<AttemptState, { kind: 'queued' | 'running' | 'reconciling' | 'unresolved' }> {
  return (
    state.kind === 'queued' ||
    state.kind === 'running' ||
    state.kind === 'reconciling' ||
    state.kind === 'unresolved'
  );
}
/** Increments both revisions exactly once for an effective attempt transition. */
export function changeAttempt(
  facts: AttemptFacts,
  state: AttemptState,
  holdsCapacity: boolean,
): StoreReply<AttemptChange> {
  return {
    kind: 'applied',
    value: {
      attempt: {
        ...facts.attempt,
        state,
        holdsCapacity,
        revision: addInteger(facts.attempt.revision, 1),
      },
      runRevision: addInteger(facts.run.revision, 1),
    },
  };
}
/** Closed transition planner for an already authorized, consistent provider view. Fresh execution commands pass current revision and transition checks. */
export function planExecution(
  facts: AttemptFacts,
  guard: AttemptGuard,
  fact: ExecutionFact,
): StoreReply<AttemptChange> {
  // Proof: bypassing execution cross run enforcement failed 'memory execution commands > execution command identities distinguish reattachment from original redelivery'.
  if (facts.attempt.identity.runId !== guard.runId)
    return { kind: 'refused', reason: 'identity_conflict' };
  const conflict = checkAttempt(facts, guard);
  if (conflict !== undefined) return conflict;
  const state = facts.attempt.state;
  // Proof: bypassing execution state enforcement failed 'memory execution edges > successful effects cannot retry and missing attempts throw without mutations'.
  if (!isExecuting(state)) return { kind: 'refused', reason: 'state_conflict' };
  // Proof: bypassing claim recorded authority enforcement failed 'memory execution > execution requires exact claim authority and matching operation'.
  if (
    'claim' in fact &&
    (!matchesClaim(facts, fact.claim) ||
      (state.claim !== null && !equalRecords(state.claim, fact.claim)))
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const locator = 'locator' in state ? state.locator : null;
  switch (fact.kind) {
    case 'claim_acquired':
      // Proof: bypassing claim state enforcement failed 'memory execution commands > execution command identities distinguish reattachment from original redelivery'.
      if (state.kind !== 'queued' || state.claim !== null)
        return { kind: 'refused', reason: 'state_conflict' };
      return changeAttempt(facts, { kind: 'queued', claim: fact.claim }, true);
    case 'launch_recorded':
      // Proof: bypassing launch state enforcement failed 'memory execution > execution requires exact claim authority and matching operation'.
      if ((state.kind !== 'queued' && state.kind !== 'reconciling') || state.claim === null)
        return { kind: 'refused', reason: 'state_conflict' };
      // Proof: bypassing launch operation enforcement failed 'memory execution > execution requires exact claim authority and matching operation'.
      // Proof: bypassing reattach locator enforcement failed 'memory execution commands > execution command identities distinguish reattachment from original redelivery'.
      if (
        fact.locator.operationKey !== facts.attempt.identity.operationKey ||
        (locator !== null && !equalRecords(locator, fact.locator))
      )
        return { kind: 'refused', reason: 'authority_conflict' };
      return changeAttempt(
        facts,
        { kind: 'running', claim: fact.claim, locator: fact.locator },
        true,
      );
    case 'recovery_required':
      return changeAttempt(
        facts,
        { kind: 'reconciling', claim: state.claim, locator, reason: fact.reason },
        facts.attempt.holdsCapacity,
      );
    case 'unresolved':
      return changeAttempt(
        facts,
        {
          kind: 'unresolved',
          claim: state.claim,
          locator,
          reason: fact.reason,
          evidence: fact.evidence,
        },
        facts.attempt.holdsCapacity,
      );
    case 'interrupted':
    case 'waiting':
      // Proof: bypassing execution quiescence operation enforcement failed 'memory execution > unknown effects and takeover retain capacity until determinate quiescence'.
      if (fact.quiescence.operationKey !== facts.attempt.identity.operationKey)
        return { kind: 'refused', reason: 'authority_conflict' };
      if (fact.kind === 'waiting') {
        // Proof: bypassing waiting quiescence enforcement failed 'memory execution > waiting requires exact claim unique choices and determinate quiescence'.
        if (state.claim === null || fact.quiescence.effect === 'unknown')
          return { kind: 'refused', reason: 'state_conflict' };
        return changeAttempt(
          facts,
          {
            kind: 'waiting_for_person',
            claim: fact.claim,
            wait: fact.wait,
            quiescence: fact.quiescence,
          },
          false,
        );
      }
      // Proof: bypassing interruption unknown enforcement failed 'memory execution > unknown effects and takeover retain capacity until determinate quiescence'.
      if (fact.quiescence.effect === 'unknown')
        return changeAttempt(
          facts,
          {
            kind: 'unresolved',
            claim: state.claim,
            locator,
            reason: 'quiescence effect unknown',
            evidence: fact.quiescence.evidence,
          },
          facts.attempt.holdsCapacity,
        );
      return changeAttempt(
        facts,
        { kind: 'interrupted', claim: state.claim, quiescence: fact.quiescence },
        false,
      );
  }
}

export interface RecordedExecution {
  readonly command: ExecutionCommand;
  readonly reply: Attempt;
}
/** Compares store-wide immutable command identity before target reads or revision checks, after the adapter's current-owner fence. */
export function replayExecution(
  previous: RecordedExecution | undefined,
  guard: AttemptGuard,
  command: ExecutionCommand,
): StoreReply<Attempt> | undefined {
  if (previous === undefined) return undefined;
  // Proof: bypassing execution replay content enforcement failed 'memory execution commands > execution command identities distinguish reattachment from original redelivery'.
  // Proof: bypassing execution replay target enforcement failed 'memory execution commands > execution command identities distinguish reattachment from original redelivery'.
  // Proof: bypassing execution replay run enforcement failed 'memory execution commands > execution command identities distinguish reattachment from original redelivery'.
  if (
    previous.reply.attemptId !== guard.attemptId ||
    previous.reply.identity.runId !== guard.runId ||
    !equalRecords(previous.command, command)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: returning revision 999 in the original reply failed 'memory execution commands > execution command identities distinguish reattachment from original redelivery'.
  return { kind: 'duplicate', value: previous.reply };
}
