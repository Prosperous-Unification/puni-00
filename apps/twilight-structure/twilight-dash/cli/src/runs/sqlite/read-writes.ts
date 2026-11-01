import { parseOrThrow, type } from '@shared/validation';
import type { Database } from 'bun:sqlite';

import { decodeRecordedWrite, decodeWriteObligation, decodeWriteReceipt } from '../write-codecs';
import { CURRENT_FORMAT, type FormatDescriptor } from './schema';
const rowCodec = type({
  command_id: 'string',
  run_id: 'string',
  attempt_id: 'string',
  record: 'string',
}).onUndeclaredKey('reject');
const settlementCodec = type({ stage_command_id: 'string', record: 'string' }).onUndeclaredKey(
  'reject',
);
const integer = type('number.integer >= 0').atMost(Number.MAX_SAFE_INTEGER);
const markerCodec = type({
  singleton: '1',
  record_count: integer,
  obligation_count: integer,
  receipt_count: integer,
}).onUndeclaredKey('reject');
/** Reads all independent physical write witnesses before the complete logical history fold. Earlier named formats have no write family. */
export function readWrites(database: Database, format: FormatDescriptor = CURRENT_FORMAT) {
  switch (format.identity.version) {
    case 3:
    case 4:
    case 5:
      return { writes: [], obligations: [], writeReceipts: [] };
    case 6:
      break;
    default:
      throw new Error('unsupported sqlite write format');
  }
  const markers = database.query('SELECT * FROM run6_write_format').all();
  // Proof: T2 physical-marker-uniqueness omitted this check; the public-entry duplicate-marker negative resolved. Exact restoration passed.
  if (markers.length !== 1) throw new Error('corrupt write format marker');
  const marker = parseOrThrow(markerCodec, markers[0]);
  const writes = database
    .query(
      "SELECT * FROM run6_write ORDER BY json_extract(record,'$.reply.attempt.revision'),command_id",
    )
    .all()
    .map((input) => {
      const row = parseOrThrow(rowCodec, input);
      const entry = decodeRecordedWrite(JSON.parse(row.record));
      // Proof: T2 physical-write-command/run/attempt independently omitted each key comparison; its public-entry corruption negative resolved. Exact restorations passed.
      if (
        format.decode(row.command_id) !== entry.command.commandId ||
        format.decode(row.run_id) !== entry.runId ||
        // Proof: physical-write-attempt_id broke “every public entry audits write physical attempt identity behind plausible current write state”; exact source hash restored.
        format.decode(row.attempt_id) !== entry.attemptId
      )
        throw new Error('corrupt write physical identity');
      return entry;
    });
  const obligations = database
    .query('SELECT * FROM run6_write_obligation')
    .all()
    .map((input) => {
      const row = parseOrThrow(settlementCodec, input);
      const obligation = decodeWriteObligation(JSON.parse(row.record));
      // Proof: T2 physical-obligation-key omitted this comparison; the public-entry corruption negative resolved. Exact restoration passed.
      if (format.decode(row.stage_command_id) !== obligation.stageCommandId)
        throw new Error('corrupt write obligation physical identity');
      return obligation;
    });
  const writeReceipts = database
    .query('SELECT * FROM run6_write_receipt')
    .all()
    .map((input) => {
      const row = parseOrThrow(settlementCodec, input);
      const receipt = decodeWriteReceipt(JSON.parse(row.record));
      // Proof: T2 physical-receipt-key omitted this comparison; the public-entry corruption negative resolved. Exact restoration passed.
      if (format.decode(row.stage_command_id) !== receipt.stageCommandId)
        throw new Error('corrupt local write receipt physical identity');
      return receipt;
    });
  // Proof: T2 physical-record/obligation/receipt-count independently omitted each count; its public-entry corruption negative resolved. Exact restorations passed.
  if (
    marker.record_count !== writes.length ||
    marker.obligation_count !== obligations.length ||
    // Proof: physical-receipt-count broke “every public entry audits write receipt count behind plausible current write state”; exact source hash restored.
    marker.receipt_count !== writeReceipts.length
  )
    throw new Error('corrupt write retained counts');
  return { writes, obligations, writeReceipts };
}
