import type { Database } from 'bun:sqlite';

import type { WriteAcceptPlan, WriteStagePlan } from '../plan-writes';
import type { HistoryCatalog } from '../validate-history';
import { addInteger } from '../value-codecs';
import { CURRENT_FORMAT } from './schema';
type WriteCatalog = Pick<HistoryCatalog, 'writes' | 'obligations' | 'writeReceipts'>;
/** Publishes exactly one immutable journal event inside its caller's transaction; throws before commit if publication is ignored. Independent run and attempt keys never come from the reply. */
function insertWrite(
  database: Database,
  record: WriteStagePlan['record'] | WriteAcceptPlan['record'],
): void {
  const inserted = database
    .query('INSERT INTO run6_write(command_id,run_id,attempt_id,record) VALUES (?,?,?,?)')
    .run(
      CURRENT_FORMAT.encode(record.command.commandId),
      CURRENT_FORMAT.encode(record.runId),
      CURRENT_FORMAT.encode(record.attemptId),
      JSON.stringify(record),
    );
  // Proof: Task4 journal removed only this guard; ignored accept journal publication returned applied with no acceptance journal and failed its predecessor test. Stage journal omission was independently FK-protected.
  if (inserted.changes !== 1) throw new Error('write journal publication differs');
}
/** Retains exactly one stage, obligation and counter update together; throws on an ignored publication. Runtime, attempt, reservation and usage publication share the caller's transaction. */
export function insertWriteStage(
  database: Database,
  change: WriteStagePlan,
  catalog: WriteCatalog,
): void {
  insertWrite(database, change.record);
  const retained = database
    .query('INSERT INTO run6_write_obligation(stage_command_id,record) VALUES (?,?)')
    .run(
      CURRENT_FORMAT.encode(change.obligation.stageCommandId),
      JSON.stringify(change.obligation),
    );
  // Proof: Task4 obligation removed only this guard; ignored stage obligation publication returned applied with no obligation and failed its predecessor test. Guarded rollback/reopen/retry passed.
  if (retained.changes !== 1) throw new Error('write obligation publication differs');
  const updated = database
    .query('UPDATE run6_write_format SET record_count=?,obligation_count=? WHERE singleton=1')
    .run(addInteger(catalog.writes.length, 1), addInteger(catalog.obligations.length, 1));
  // Proof: Task4 stage-counts removed only this guard; ignored stage counts publication returned applied with unchanged counters and failed its predecessor test. Guarded rollback/reopen/retry passed.
  if (updated.changes !== 1) throw new Error('write stage counts publication differs');
}
/** Retains exactly one terminal receipt, acceptance event and counter update before commit, removing the exact pending obligation in the same transaction. Throws on an ignored publication or removal. */
export function insertWriteAcceptance(
  database: Database,
  change: WriteAcceptPlan,
  catalog: WriteCatalog,
): void {
  insertWrite(database, change.record);
  const retained = database
    .query('INSERT INTO run6_write_receipt(stage_command_id,record) VALUES (?,?)')
    .run(CURRENT_FORMAT.encode(change.receipt.stageCommandId), JSON.stringify(change.receipt));
  // Proof: Task4 receipt removed only this guard; ignored accept receipt publication returned applied with no receipt and failed its predecessor test. Guarded rollback/reopen/retry passed.
  if (retained.changes !== 1) throw new Error('write receipt publication differs');
  const removed = database
    .query('DELETE FROM run6_write_obligation WHERE stage_command_id=?')
    .run(CURRENT_FORMAT.encode(change.obligationKey));
  // Proof: 'ignored obligation DELETE aborts actual acceptance and reopens the exact pending bundle' used BEFORE DELETE RAISE(IGNORE); removing only this guard returned applied/one obligation/one receipt/count0. Exact source hash restored; guarded rollback/reopen passed.
  if (removed.changes !== 1) throw new Error('write obligation removal differs');
  const updated = database
    .query(
      'UPDATE run6_write_format SET record_count=?,obligation_count=?,receipt_count=? WHERE singleton=1',
    )
    .run(
      addInteger(catalog.writes.length, 1),
      catalog.obligations.length - 1,
      addInteger(catalog.writeReceipts.length, 1),
    );
  // Proof: Task4 accept-counts removed only this guard; ignored accept counts publication returned applied with unchanged counters and failed its predecessor test. Guarded rollback/reopen/retry passed.
  if (updated.changes !== 1) throw new Error('write acceptance counts publication differs');
}
