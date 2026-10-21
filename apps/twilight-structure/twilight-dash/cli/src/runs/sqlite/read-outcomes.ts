import type { Database } from 'bun:sqlite';

import { equalRecords } from '../record-codecs';
import type { Attempt, ProgressIntent } from '../records';
import { decodeCompletionRow } from './row-codecs';

/** Reads pending commands with their complete attempt state in the caller's consistent transaction. Missing or altered trusted halves throw. */
export function readOutcomes(
  database: Database,
  attempts: readonly Attempt[],
): readonly ProgressIntent[] {
  const intents: ProgressIntent[] = [];
  for (const attempt of attempts) {
    const row = database
      .query('SELECT * FROM run_completion WHERE attempt_id=?')
      .get(attempt.attemptId);
    if (row === null && attempt.state.kind !== 'outcome_pending_progress') continue;
    const { completion } = decodeCompletionRow(row);
    const expected = {
      kind: 'outcome_pending_progress',
      claim: completion.intent.authority,
      outcome: completion.outcome,
      commandId: completion.intent.commandId,
      quiescence: completion.quiescence,
    };
    // Proof: bypassing pending state integrity enforcement failed 'open rejects state outcome mismatch after a committed outcome'.
    if (!equalRecords(attempt.state, expected)) throw new Error('corrupt completion state');
    const pending = database
      .query('SELECT command_id FROM run_outbox WHERE command_id=?')
      .get(completion.intent.commandId);
    // Proof: bypassing pending outbox integrity enforcement failed 'open rejects missing outbox after a committed outcome'.
    if (pending === null) throw new Error('corrupt missing outbox');
    intents.push(completion.intent);
  }
  return intents;
}
