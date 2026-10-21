import type { Database } from 'bun:sqlite';

import type { RecordedExecution } from '../plan-execution';
import type { Attempt, Run } from '../records';
import { decodeAttemptRow, decodeExecutionRow, decodeRunRow } from './row-codecs';

/** Reconstructs only one attempt's retained execution observations. The seed takes immutable admission fields from the validated target, never its current state. Non-execution transitions must join this history when decision/receipt operations are introduced. */
export function readExecutions(
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
  const rows = database
    .query(
      "SELECT e.*,a.run_id FROM run_execution e JOIN run_attempt a ON a.attempt_id=e.attempt_id WHERE e.attempt_id=? ORDER BY json_extract(e.reply,'$.revision'),e.command_id",
    )
    .all(attempt.attemptId);
  for (const row of rows) {
    const execution = decodeExecutionRow(row, run, predecessor);
    executions.push(execution);
    predecessor = execution.reply;
  }
  return executions;
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
  const execution = readExecutions(database, run, attempt).find(
    (entry) => entry.command.commandId === commandId,
  );
  // Proof: omitting the indexed command from the history read and removing this rejection failed 'replay rejects an indexed execution whose history read omits its required command'.
  if (execution === undefined) throw new Error('corrupt missing execution command');
  return execution;
}
