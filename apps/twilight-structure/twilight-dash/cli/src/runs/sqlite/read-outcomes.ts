import type { Database } from 'bun:sqlite';

import type { Attempt, ProgressIntent } from '../records';
import { findReceipt } from './read-signals';
import { decodeCompletionRow } from './row-codecs';

/** Reads pending delivery after attempt provenance reconstruction in the caller's consistent transaction. Missing completions or contradictory outbox/receipt presence throw; state equality belongs to reconstruction. */
export function readOutcomes(
  database: Database,
  attempts: readonly Attempt[],
): readonly ProgressIntent[] {
  const intents: ProgressIntent[] = [];
  for (const attempt of attempts) {
    const row = database
      .query('SELECT * FROM run_completion WHERE attempt_id=?')
      .get(attempt.attemptId);
    // Proof: omitting terminal completion presence accepted a null second read; `terminal inspection refuses completion unreadable after reconstruction` failed its expected-rejection assertion.
    if (
      row === null &&
      attempt.state.kind !== 'outcome_pending_progress' &&
      attempt.state.kind !== 'terminal'
    )
      continue;
    const { completion } = decodeCompletionRow(row);
    const receipt = findReceipt(database, completion.intent.commandId);
    const pending = database
      .query('SELECT command_id FROM run_outbox WHERE command_id=?')
      .get(completion.intent.commandId);
    if (receipt !== undefined) {
      // Proof: injecting terminal outbox absence bypass failed `public read rejects terminal outbox present and reopen rejects corruption` at its explicit assertion.
      if (pending !== null) throw new Error('corrupt terminal outbox');
    } else {
      // Proof: bypassing pending outbox integrity enforcement failed 'open rejects missing outbox after a committed outcome'.
      if (pending === null) throw new Error('corrupt missing outbox');
      intents.push(completion.intent);
    }
  }
  return intents;
}
