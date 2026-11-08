import type { Database } from 'bun:sqlite';

import { equalRecords } from '../record-codecs';
import type { Attempt, Run } from '../records';
import { readHistory } from './read-history';
import { CURRENT_FORMAT } from './schema';

/** Delegates target provenance to the single complete snapshot owner. Supplied identities cannot substitute another run or reset a retained projection. */
export function validateAttempt(database: Database, run: Run, attempt: Attempt) {
  const snapshot = readHistory(database);
  const history = snapshot.histories.find(
    (candidate) =>
      candidate.attempt.attemptId === attempt.attemptId && candidate.run.runId === run.runId,
  );
  // Proof: F204 removed this sampled check; 'remaining sqlite supplied attempt projection must match audited history' accepted its valid retained positive then lost rejection for a mismatched supplied projection; direct history-owner proof. Exact restoration passed.
  if (history === undefined || !equalRecords(history.attempt, attempt))
    throw new Error('corrupt current attempt provenance');
  return {
    executions: history.executions,
    pendingIntents: snapshot.pendingIntents.filter(
      (intent) => intent.claim.attemptId === attempt.attemptId,
    ),
  };
}
/** Store-wide indexed command lookup must still exist in the complete independently reconstructed history. */
export function findExecution(database: Database, commandId: string) {
  const indexed = database
    .query(`SELECT command_id FROM ${CURRENT_FORMAT.family.execution} WHERE command_id=?`)
    .get(CURRENT_FORMAT.encode(commandId));
  const snapshot = readHistory(database);
  const execution = snapshot.catalog.executions.find(
    (entry) => entry.command.commandId === commandId,
  );
  // Proof: F205 removed this sampled check; 'required indexed command cannot disappear behind a reset admitted projection' lost the required corruption exception under its existing reset-projection/query-omission dependency fault; exception-contract-only, no application inference. Exact restoration passed.
  if (indexed !== null && execution === undefined)
    throw new Error('corrupt missing execution command');
  return execution;
}
