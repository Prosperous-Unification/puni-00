import type { RecordedReceipt } from './execution-records';
export type { RecordedReceipt } from './execution-records';
import {
  type AttemptChange,
  type AttemptFacts,
  changeAttempt,
  checkAttempt,
  claimReference,
} from './plan-execution';
import { equalRecords } from './record-codecs';
import type { Attempt, AttemptState, CommandReceipt, ProgressIntent } from './records';
import type { AttemptGuard, StoreReply } from './run-store';

/** Exact historical command and target identify receipt retries, independently of later occurrence attempts. */
export function replayReceipt(
  previous: RecordedReceipt | undefined,
  guard: AttemptGuard,
  receipt: CommandReceipt,
): StoreReply<Attempt> | undefined {
  if (previous === undefined) return undefined;
  // Proof: injecting receipt replay identity bypass failed `memory receipts > only exact command authority can remove outbox and become terminal` at its explicit assertion.
  if (
    previous.reply.identity.runId !== guard.runId ||
    previous.reply.attemptId !== guard.attemptId ||
    !equalRecords(previous.receipt, receipt)
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  return { kind: 'duplicate', value: previous.reply };
}
/** Confirms only an exact pending command. Receipt bytes do not establish authenticated remote acceptance. */
export function planReceipt(
  facts: AttemptFacts,
  guard: AttemptGuard,
  receipt: CommandReceipt,
  intent: ProgressIntent | undefined,
): StoreReply<AttemptChange> {
  // Proof: injecting receipt target bypass failed `memory signal edges > receipt cross run guard cannot retarget a pending command` at its explicit assertion.
  if (
    facts.attempt.identity.runId !== guard.runId ||
    receipt.claim.runId !== guard.runId ||
    receipt.claim.attemptId !== guard.attemptId
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const conflict = checkAttempt(facts, guard);
  // Proof: injecting receipt revisions bypass failed `memory receipts > only exact command authority can remove outbox and become terminal` at its explicit assertion.
  if (conflict !== undefined) return conflict;
  const transition = planReceiptTransition(facts, receipt, intent);
  // Proof: injecting receipt live refusal routing bypass failed `memory receipts > only exact command authority can remove outbox and become terminal` at its explicit assertion.
  if (transition.kind === 'refused') return transition;
  return changeAttempt(facts, transition.value, false);
}
/** Matches a retained command against its pending predecessor during historical validation. */
export function planReceiptTransition(
  facts: AttemptFacts,
  receipt: CommandReceipt,
  intent: ProgressIntent | undefined,
): StoreReply<AttemptState> {
  const state = facts.attempt.state;
  // Proof: injecting receipt pending state bypass failed `memory signal edges > receipt state target revisions and expired owner cannot mutate a wait` at its explicit assertion.
  if (state.kind !== 'outcome_pending_progress')
    return { kind: 'refused', reason: 'state_conflict' };
  // Proof: injecting receipt missing intent bypass failed `receipt reconciliation requires its trusted pending intent from the query dependency` at its explicit assertion.
  if (intent === undefined) throw new Error('pending intent does not exist');
  // Proof: injecting receipt authority bypass failed `memory receipts > only exact command authority can remove outbox and become terminal` at its explicit assertion.
  if (
    receipt.commandId !== state.commandId ||
    receipt.commandId !== intent.commandId ||
    receipt.commandDigest !== intent.commandDigest ||
    !equalRecords(receipt.claim, intent.claim) ||
    !equalRecords(claimReference(state.checkpoint), receipt.claim)
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  return {
    kind: 'applied',
    value: {
      kind: 'terminal',
      checkpoint: state.checkpoint,
      outcome: state.outcome,
      receipt,
      quiescence: state.quiescence,
    },
  };
}
