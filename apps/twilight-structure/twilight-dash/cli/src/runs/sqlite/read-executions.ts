import { parseOrThrow, type } from '@shared/validation';
import type { Database } from 'bun:sqlite';

import type { RecordedExecution } from '../plan-execution';
import { advanceAttempt } from '../plan-execution';
import { planOutcomeTransition } from '../plan-outcome';
import { planReceiptTransition } from '../plan-receipt';
import { planDecision } from '../plan-signals';
import { decodeAttempt, equalRecords } from '../record-codecs';
import type { HumanWait } from '../records';
import type { Attempt, Run } from '../records';
import { readOutcomes } from './read-outcomes';
import { decodeConsumptionRow, decodeDecisionRow, findDecision, findReceipt } from './read-signals';
import { decodeCompletionRow } from './row-codecs';
import { decodeAttemptRow, decodeExecutionRow, decodeRunRow } from './row-codecs';

/** Reconstructs one named attempt from admission through execution, consumed waits, completion and receipt. Each historical reply is checked at its own predecessor; only the final reconstruction is compared to current state. Future attempt transitions must extend this provenance. */
function readExecutions(
  database: Database,
  run: Run,
  attempt: Attempt,
): readonly RecordedExecution[] {
  let predecessor: Attempt = {
    ...attempt,
    revision: 0,
    state: { kind: 'queued', claim: null },
    holdsCapacity: true,
  };
  const executions: RecordedExecution[] = [];
  const waits = new Map<string, HumanWait>();
  const rows = database
    .query(
      "SELECT e.*,a.run_id FROM run_execution e JOIN run_attempt a ON a.attempt_id=e.attempt_id WHERE e.attempt_id=? ORDER BY json_extract(e.reply,'$.revision'),e.command_id",
    )
    .all(attempt.attemptId);
  const transitions = [
    ...rows.map((row) => ({
      kind: 'execution' as const,
      row,
      reply: decodeAttempt(JSON.parse(parseOrThrow(type({ reply: 'string' }), row).reply)),
    })),
    ...database
      .query('SELECT * FROM run_consumption WHERE attempt_id=?')
      .all(attempt.attemptId)
      .map((row) => {
        const consumption = decodeConsumptionRow(row);
        return { kind: 'consumption' as const, consumption, reply: consumption.reply };
      }),
  ].sort((left, right) => left.reply.revision - right.reply.revision);
  for (const transition of transitions) {
    if (transition.kind === 'execution') {
      const execution = decodeExecutionRow(transition.row, run, predecessor);
      const fact = execution.command.fact;
      if (fact.kind === 'waiting') {
        // Proof: injecting historical wait uniqueness bypass failed `reopen rejects coherently reused historical wait key` at its explicit assertion.
        if (waits.has(fact.wait.correlationKey)) throw new Error('corrupt reused wait identity');
        waits.set(fact.wait.correlationKey, fact.wait);
      }
      executions.push(execution);
      predecessor = execution.reply;
    } else {
      const consumption = transition.consumption;
      const decision = findDecision(database, consumption.decisionId);
      // Proof: injecting historical missing decision bypass failed `public read rejects missing consumed decision and reopen rejects corruption` at its explicit assertion.
      if (decision === undefined) throw new Error('corrupt missing consumed decision');
      const state = predecessor.state;
      // Proof: injecting historical consumed wait bypass failed `public read rejects consumption full wait and reopen rejects corruption` at its explicit assertion.
      if (
        state.kind !== 'waiting_for_person' ||
        !equalRecords(state.wait, consumption.wait) ||
        planDecision(predecessor, decision).kind === 'refused'
      )
        throw new Error('corrupt consumed wait provenance');
      const expected = advanceAttempt(predecessor, { kind: 'queued', claim: state.claim }, true);
      // Proof: injecting historical consumption reply bypass failed `public read rejects consumption original reply and reopen rejects corruption` at its explicit assertion.
      if (!equalRecords(expected, consumption.reply)) throw new Error('corrupt consumption reply');
      predecessor = consumption.reply;
    }
  }
  for (const row of database
    .query('SELECT * FROM run_decision WHERE attempt_id=?')
    .all(attempt.attemptId)) {
    const decision = decodeDecisionRow(row);
    const wait = waits.get(decision.correlationKey);
    // Proof: injecting historical decision provenance bypass failed `public read rejects decision wait key and reopen rejects corruption` at its explicit assertion.
    if (!wait?.choices.includes(decision.choice))
      throw new Error('corrupt decision wait provenance');
  }
  const completionRow = database
    .query('SELECT * FROM run_completion WHERE attempt_id=?')
    .get(attempt.attemptId);
  if (completionRow !== null) {
    const { completion } = decodeCompletionRow(completionRow);
    const transition = planOutcomeTransition({ run, attempt: predecessor }, completion);
    // Proof: injecting historical completion transition bypass failed `public read rejects completion predecessor authority and reopen rejects corruption` at its explicit assertion.
    if (transition.kind === 'refused') throw new Error('corrupt completion transition');
    predecessor = advanceAttempt(predecessor, transition.value, false);
    const receipt = findReceipt(database, completion.intent.commandId);
    if (receipt !== undefined) {
      const terminal = planReceiptTransition(
        { run, attempt: predecessor },
        receipt.receipt,
        completion.intent,
      );
      // Proof: injecting historical receipt transition bypass failed `public read rejects receipt command digest and reopen rejects corruption` at its explicit assertion.
      if (terminal.kind === 'refused') throw new Error('corrupt receipt transition');
      const expected = advanceAttempt(predecessor, terminal.value, false);
      // Proof: injecting historical receipt reply bypass failed `public read rejects receipt original reply and reopen rejects corruption` at its explicit assertion.
      if (!equalRecords(expected, receipt.reply)) throw new Error('corrupt receipt reply');
      predecessor = receipt.reply;
    }
  }
  // Proof: injecting historical current attempt bypass failed `probe current claim corruption against intact historical execution` at its explicit assertion.
  if (!equalRecords(predecessor, attempt)) throw new Error('corrupt current attempt provenance');
  return executions;
}
/** Validates one named attempt's complete history and delivery state in the caller's transaction. Reconstruction checks current state once; independent completion/outbox/receipt checks must also pass before any state-dependent mutation or replay. The supplied run is the attempt's immutable target, never a caller's conflicting guard target. */
export function validateAttempt(database: Database, run: Run, attempt: Attempt) {
  const executions = readExecutions(database, run, attempt);
  // Proof: bypassing complete delivery validation failed `admission rejects terminal outbox before state dependent rows change` at its missing-rejection assertion.
  const pendingIntents = readOutcomes(database, [attempt]);
  return { executions, pendingIntents };
}
/** Looks up a store-wide command only inside the caller's consistent transaction. Live mutations must fence ownership before this historical target lookup. */
export function findExecution(
  database: Database,
  commandId: string,
): RecordedExecution | undefined {
  const target = database
    .query(
      'SELECT a.* FROM run_execution e JOIN run_attempt a ON a.attempt_id=e.attempt_id WHERE command_id=?',
    )
    .get(commandId);
  if (target === null) return undefined;
  const { attempt } = decodeAttemptRow(target);
  const { run } = decodeRunRow(
    database.query('SELECT * FROM run_record WHERE run_id=?').get(attempt.identity.runId),
  );
  // Proof: bypassing execution replay delivery route failed `execution replay rejects terminal outbox before state dependent rows change` at its missing-rejection assertion.
  const execution = validateAttempt(database, run, attempt).executions.find(
    (entry) => entry.command.commandId === commandId,
  );
  // Proof: injecting required command reset projection bypass failed `required indexed command cannot disappear behind a reset admitted projection` at its explicit assertion.
  if (execution === undefined) throw new Error('corrupt missing execution command');
  return execution;
}
