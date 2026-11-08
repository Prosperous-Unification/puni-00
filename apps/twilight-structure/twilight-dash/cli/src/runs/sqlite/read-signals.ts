import { parseOrThrow, type } from '@shared/validation';
import type { Database } from 'bun:sqlite';

import {
  decisionId,
  decodeAttempt,
  decodeDecision,
  decodeReceipt,
  HumanWaitCodec,
} from '../record-codecs';
import { CURRENT_FORMAT, type FormatDescriptor } from './schema';

const DecisionRow = type({ decision_id: 'string', attempt_id: 'string', record: 'string' });
const ConsumptionRow = type({
  decision_id: 'string',
  attempt_id: 'string',
  correlation_key: 'string',
  wait: 'string',
  reply: 'string',
});
const ReceiptRow = type({
  command_id: 'string',
  attempt_id: 'string',
  record: 'string',
  reply: 'string',
});
/** Requires physical inbox keys to agree with the entire portable decision. */
export function decodeDecisionRow(input: unknown, format: FormatDescriptor = CURRENT_FORMAT) {
  const row = parseOrThrow(DecisionRow, input);
  const decision = decodeDecision(JSON.parse(row.record));
  // Proof: injecting decision physical key bypass failed `public read rejects decision physical key and reopen rejects corruption` at its explicit assertion.
  if (
    decision.decisionId !== format.decode(row.decision_id) ||
    decision.attemptId !== format.decode(row.attempt_id)
  )
    throw new Error('corrupt decision identity');
  return decision;
}
/** Decodes retained continuation provenance, including the complete consumed wait and original ready reply. */
export function decodeConsumptionRow(input: unknown, format: FormatDescriptor = CURRENT_FORMAT) {
  const row = parseOrThrow(ConsumptionRow, input);
  const reply = decodeAttempt(JSON.parse(row.reply));
  const wait = parseOrThrow(HumanWaitCodec, JSON.parse(row.wait));
  // Proof: injecting consumption physical key bypass failed `public read rejects consumption physical attempt and reopen rejects corruption` at its explicit assertion.
  if (
    reply.attemptId !== format.decode(row.attempt_id) ||
    wait.correlationKey !== format.decode(row.correlation_key)
  )
    throw new Error('corrupt consumption identity');
  return { decisionId: decisionId(format.decode(row.decision_id)), wait, reply };
}
/** Retains original terminal replies separately from pending delivery state. */
export function decodeReceiptRow(input: unknown, format: FormatDescriptor = CURRENT_FORMAT) {
  const row = parseOrThrow(ReceiptRow, input);
  const receipt = decodeReceipt(JSON.parse(row.record));
  const reply = decodeAttempt(JSON.parse(row.reply));
  // Proof: injecting receipt physical key bypass failed `public read rejects receipt physical command and reopen rejects corruption` at its explicit assertion.
  if (
    receipt.commandId !== format.decode(row.command_id) ||
    receipt.claim.attemptId !== format.decode(row.attempt_id) ||
    reply.attemptId !== format.decode(row.attempt_id)
  )
    throw new Error('corrupt receipt identity');
  return { receipt, reply };
}
export function findDecision(
  database: Database,
  identity: string,
  format: FormatDescriptor = CURRENT_FORMAT,
) {
  const row = database
    .query(`SELECT * FROM ${format.family.decision} WHERE decision_id=?`)
    .get(format.encode(identity));
  return row === null ? undefined : decodeDecisionRow(row, format);
}
export function findConsumption(
  database: Database,
  identity: string,
  format: FormatDescriptor = CURRENT_FORMAT,
) {
  const row = database
    .query(`SELECT * FROM ${format.family.consumption} WHERE decision_id=?`)
    .get(format.encode(identity));
  return row === null ? undefined : decodeConsumptionRow(row, format);
}
export function findReceipt(
  database: Database,
  identity: string,
  format: FormatDescriptor = CURRENT_FORMAT,
) {
  const row = database
    .query(`SELECT * FROM ${format.family.receipt} WHERE command_id=?`)
    .get(format.encode(identity));
  return row === null ? undefined : decodeReceiptRow(row, format);
}
