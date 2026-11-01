import type { Database } from 'bun:sqlite';

import type { WriteAcceptPlan, WriteStagePlan } from '../plan-writes';
import type { HistoryCatalog } from '../validate-history';
import { addInteger } from '../value-codecs';
import { CURRENT_FORMAT } from './schema';
type WriteCatalog = Pick<HistoryCatalog, 'writes' | 'obligations' | 'writeReceipts'>;
/** Publishes one immutable journal event inside its caller's existing transaction. Independent run and attempt keys never come from the reply. */
function insertWrite(
  database: Database,
  record: WriteStagePlan['record'] | WriteAcceptPlan['record'],
): void {
  database
    .query('INSERT INTO run6_write(command_id,run_id,attempt_id,record) VALUES (?,?,?,?)')
    .run(
      CURRENT_FORMAT.encode(record.command.commandId),
      CURRENT_FORMAT.encode(record.runId),
      CURRENT_FORMAT.encode(record.attemptId),
      JSON.stringify(record),
    );
}
/** Retains stage and obligation together; runtime, attempt, reservation and usage publication share the caller's transaction. */
export function insertWriteStage(
  database: Database,
  change: WriteStagePlan,
  catalog: WriteCatalog,
): void {
  insertWrite(database, change.record);
  database
    .query('INSERT INTO run6_write_obligation(stage_command_id,record) VALUES (?,?)')
    .run(
      CURRENT_FORMAT.encode(change.obligation.stageCommandId),
      JSON.stringify(change.obligation),
    );
  database
    .query('UPDATE run6_write_format SET record_count=?,obligation_count=? WHERE singleton=1')
    .run(addInteger(catalog.writes.length, 1), addInteger(catalog.obligations.length, 1));
}
/** Retains terminal receipt and original acceptance event before removing the exact pending obligation in the same transaction. */
export function insertWriteAcceptance(
  database: Database,
  change: WriteAcceptPlan,
  catalog: WriteCatalog,
): void {
  insertWrite(database, change.record);
  database
    .query('INSERT INTO run6_write_receipt(stage_command_id,record) VALUES (?,?)')
    .run(CURRENT_FORMAT.encode(change.receipt.stageCommandId), JSON.stringify(change.receipt));
  const removed = database
    .query('DELETE FROM run6_write_obligation WHERE stage_command_id=?')
    .run(CURRENT_FORMAT.encode(change.obligationKey));
  // Proof: 'ignored obligation DELETE aborts actual acceptance and reopens the exact pending bundle' used BEFORE DELETE RAISE(IGNORE); removing only this guard returned applied/one obligation/one receipt/count0. Exact source hash restored; guarded rollback/reopen passed.
  if (removed.changes !== 1) throw new Error('write obligation removal differs');
  database
    .query(
      'UPDATE run6_write_format SET record_count=?,obligation_count=?,receipt_count=? WHERE singleton=1',
    )
    .run(
      addInteger(catalog.writes.length, 1),
      catalog.obligations.length - 1,
      addInteger(catalog.writeReceipts.length, 1),
    );
}
