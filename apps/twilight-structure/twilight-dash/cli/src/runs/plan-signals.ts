import type { RecordedConsumption } from './execution-records';
export type { RecordedConsumption } from './execution-records';
import {
  advanceAttempt,
  type AttemptChange,
  type AttemptFacts,
  checkAttempt,
} from './plan-execution';
import { addInteger, equalRecords } from './record-codecs';
import type { Attempt, Decision, HumanWait } from './records';
import type { AttemptGuard, StoreReply } from './run-store';

export interface ConsumptionChange extends AttemptChange {
  readonly wait: HumanWait;
}

/** Global inbox identity is compared before requiring a still-current wait. Authorization evidence is retained bytes, not an authentication verdict. */
export function replayDecision(
  previous: Decision | undefined,
  decision: Decision,
): StoreReply<Decision> | undefined {
  if (previous === undefined) return undefined;
  // Proof: removing inbox content comparison returned duplicate instead of identity_conflict; `memory decisions > decisions retain complete identity and consume only the exact wait once` failed its explicit assertion.
  if (!equalRecords(previous, decision)) return { kind: 'refused', reason: 'identity_conflict' };
  return { kind: 'duplicate', value: previous };
}
/** Accepts a new authorized choice only for its exact persisted wait. */
export function planDecision(attempt: Attempt, decision: Decision): StoreReply<Decision> {
  const state = attempt.state;
  // Proof: injecting new decision wait bypass failed `memory signal edges > new inbox identities require current wait and legal correlation choice` at its explicit assertion.
  if (
    attempt.attemptId !== decision.attemptId ||
    state.kind !== 'waiting_for_person' ||
    state.wait.correlationKey !== decision.correlationKey ||
    !state.wait.choices.includes(decision.choice)
  )
    return { kind: 'refused', reason: 'decision_conflict' };
  return { kind: 'applied', value: decision };
}
/** Replays the original continuation by global decision identity after the provider fences ownership. Supplied revisions do not identify a retry. */
export function replayConsumption(
  previous: RecordedConsumption | undefined,
  guard: AttemptGuard,
): StoreReply<Attempt> | undefined {
  if (previous === undefined) return undefined;
  // Proof: injecting consumption replay target bypass failed `memory decisions > old consumption preserves its original reply through later waits and owner takeover` at its explicit assertion.
  if (previous.reply.attemptId !== guard.attemptId || previous.reply.identity.runId !== guard.runId)
    return { kind: 'refused', reason: 'decision_conflict' };
  return { kind: 'duplicate', value: previous.reply };
}
/** Resumes this wait without changing attempt identity or claim; providers publish consumption and its reservation atomically. */
export function planConsumption(
  facts: AttemptFacts,
  guard: AttemptGuard,
  decision: Decision,
  capacity: { readonly limit: number; readonly reserved: number },
): StoreReply<ConsumptionChange> {
  // Proof: injecting consumption target bypass failed `memory signal edges > cross run and cross attempt consumption refuse before any reservation` at its explicit assertion.
  if (facts.attempt.identity.runId !== guard.runId || decision.attemptId !== guard.attemptId)
    return { kind: 'refused', reason: 'decision_conflict' };
  const conflict = checkAttempt(facts, guard);
  // Proof: injecting consumption revisions bypass failed `memory signal edges > new inbox identities require current wait and legal correlation choice` at its explicit assertion.
  if (conflict !== undefined) return conflict;
  const state = facts.attempt.state;
  // Proof: injecting consumption current wait bypass failed `memory decisions > decisions retain complete identity and consume only the exact wait once` at its explicit assertion.
  if (
    state.kind !== 'waiting_for_person' ||
    state.wait.correlationKey !== decision.correlationKey ||
    !state.wait.choices.includes(decision.choice)
  )
    return { kind: 'refused', reason: 'decision_conflict' };
  // Proof: injecting consumption capacity bypass failed `memory decisions > capacity refusal leaves decision unconsumed until another run settles` at its explicit assertion.
  if (capacity.reserved >= capacity.limit) return { kind: 'refused', reason: 'capacity_full' };
  return {
    kind: 'applied',
    value: {
      attempt: advanceAttempt(
        facts.attempt,
        {
          kind: 'ready',
          execution: state.checkpoint.execution,
          cause: { kind: 'decision', decisionId: decision.decisionId },
        },
        true,
      ),
      runRevision: addInteger(facts.run.revision, 1),
      wait: state.wait,
    },
  };
}
