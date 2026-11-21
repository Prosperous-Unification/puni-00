import { PlanRef } from '@shared/plan-reference';
import { type } from '@shared/validation';

import { digestWithout } from './canonical';
import { IsoInstant, RelativePath, SchemaVersion, Sha256 } from './records';

export { PlanRef, PlanReferenceRecord } from '@shared/plan-reference';

const ReceiptEvidence = RelativePath.or(
  type({ kind: "'external'", authority: 'string>=1' }).onUndeclaredKey('reject'),
);

const ProgressEntry = type({
  taskId: PlanRef.get('plan'),
  stepCode: 'string>=1',
  status: "'in_progress'|'done'",
  'measures?': type({
    'token_actual?': 'number.integer>=0',
    'hours_actual?': 'number>=0',
  }).onUndeclaredKey('reject'),
  observedAt: IsoInstant,
  evidence: ReceiptEvidence,
}).onUndeclaredKey('reject');

/** Dash→Navigator: observed step progress and measured usage against one plan reference. */
const LegacyProgressReceiptRecord = type({
  schemaVersion: SchemaVersion,
  kind: "'progress-receipt'",
  planRef: PlanRef,
  // Proof: dropping the minimum length made `refuses an empty entries list and an unknown
  // status` decode a receipt with no entries (2026-10-11).
  entries: ProgressEntry.array().atLeastLength(1),
  receiptDigest: Sha256,
})
  // Proof: removing this rejection made `refuses an undeclared key on either record and inside
  // planRef` decode `extra` on the progress receipt (2026-10-11).
  .onUndeclaredKey('reject')
  .narrow((record, context) =>
    // Proof: returning true here made `refuses a record whose embedded digest does not match`
    // decode the receipt whose stepCode changed after digesting (2026-10-11).
    digestWithout(record, 'receiptDigest') === record.receiptDigest
      ? true
      : context.reject({ path: ['receiptDigest'], expected: 'the digest of the record' }),
  );
/** Schema 2 binds progress to the complete producer reference, without authenticating it. */
export const BoundProgressReceiptRecord = type({
  schemaVersion: '2',
  kind: "'progress-receipt'",
  planRef: PlanRef,
  // Proof: widening to string changed the malformed-bound-receipt production refusal to
  // a producer mismatch in admit-progress.test.ts; output remained absent (2026-10-16).
  referenceDigest: Sha256,
  // Proof: dropping the minimum admitted empty bound entries through admit-progress
  // and wrote an empty batch in admit-progress.test.ts (2026-10-16).
  entries: ProgressEntry.array().atLeastLength(1),
  receiptDigest: Sha256,
})
  // Proof: ignoring undeclared keys admitted a redigested extra field through admit-progress
  // in `bound receipt unknown-key refuses before output` (2026-10-16).
  .onUndeclaredKey('reject')
  .narrow((record, context) =>
    // Proof: returning true admitted a receipt with observedAt changed without redigesting
    // through admit-progress in `bound receipt receipt-digest refuses before output` (2026-10-16).
    digestWithout(record, 'receiptDigest') === record.receiptDigest
      ? true
      : context.reject({ path: ['receiptDigest'], expected: 'the digest of the record' }),
  );
export type BoundProgressReceiptRecord = typeof BoundProgressReceiptRecord.infer;

/** Strict historical and bound receipts retain their original wire values and digests. */
export const ProgressReceiptRecord = LegacyProgressReceiptRecord.or(BoundProgressReceiptRecord);
export type ProgressReceiptRecord = typeof ProgressReceiptRecord.infer;
