import { parseOrThrow, type } from '@shared/validation';
import type { Database } from 'bun:sqlite';

import { attemptId } from '../record-codecs';
import { type HistoryCatalog, validateHistory } from '../validate-history';
import { readOutcomes } from './read-outcomes';
import { readRuntimeCatalog } from './read-runtime';
import { decodeConsumptionRow, decodeDecisionRow, decodeReceiptRow } from './read-signals';
import {
  decodeAttemptRow,
  decodeCompletionRow,
  decodeExecutionRow,
  decodeManifestRow,
  decodeMeta,
  decodeRunRow,
} from './row-codecs';

/** Owns one complete provider snapshot: physical rows first, scope/attempt/link fold second, and independent outbox presence last. Low-level decoders never call this owner. */
export function readHistory(database: Database) {
  const meta = decodeMeta(database.query('SELECT * FROM run_meta WHERE singleton=1').get());
  const runtime = readRuntimeCatalog(database, meta.ownership);
  const catalog: HistoryCatalog = {
    ownership: meta.ownership,
    runtime,
    capacity: meta.capacity,
    manifests: database.query('SELECT * FROM run_manifest').all().map(decodeManifestRow),
    runs: database.query('SELECT * FROM run_record').all().map(decodeRunRow),
    attempts: database.query('SELECT * FROM run_attempt').all().map(decodeAttemptRow),
    executions: database
      .query(
        "SELECT e.*,a.run_id FROM run_execution e LEFT JOIN run_attempt a ON a.attempt_id=e.attempt_id ORDER BY json_extract(e.reply,'$.attempt.revision'),e.command_id",
      )
      .all()
      .map(decodeExecutionRow),
    consumptions: database.query('SELECT * FROM run_consumption').all().map(decodeConsumptionRow),
    completions: database.query('SELECT * FROM run_completion').all().map(decodeCompletionRow),
    receipts: database.query('SELECT * FROM run_receipt').all().map(decodeReceiptRow),
    decisions: database.query('SELECT * FROM run_decision').all().map(decodeDecisionRow),
    reservations: database
      .query('SELECT attempt_id FROM run_reservation')
      .all()
      .map((row) => attemptId(parseOrThrow(type({ attempt_id: 'string' }), row).attempt_id)),
  };
  const histories = validateHistory(catalog);
  const outbox = database
    .query('SELECT command_id FROM run_outbox')
    .all()
    .map((row) => parseOrThrow(type({ command_id: 'string' }), row).command_id);
  // Proof: F203 removed this sampled check; 'remaining sqlite outbox orphan rejects before public read publication' resolved the public read instead of rejecting an orphan pending intent. Exact restoration passed.
  for (const commandId of outbox)
    if (
      !catalog.completions.some(
        (completion) => completion.completion.intent.commandId === commandId,
      )
    )
      throw new Error('orphan pending intent');
  // Proof: F212 supplied an empty attempt set to this reader; execution replay with a missing pending outbox lost its required corruption rejection. Existing reader and database queries stayed unchanged. Exact restoration passed the eight-case group.
  const pendingIntents = readOutcomes(
    database,
    catalog.attempts.map((entry) => entry.attempt),
  );
  return { catalog, histories, pendingIntents };
}
