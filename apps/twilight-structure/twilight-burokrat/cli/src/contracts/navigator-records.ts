import { type } from '@shared/validation';

import { digestWithout } from './canonical';
import { GitObjectId, IsoInstant, RelativePath, SchemaVersion, Sha256 } from './records';

/** A WBS identifier: WBS ids may begin with a digit, which Burokrat's `OpaqueId` refuses. */
const WbsId = type(/^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/);
/**
 * Caller-supplied, not derived: the client repository manifest's `repositoryId`, or the
 * normalized Git remote URL when there is no manifest (`twin plan-reference --repository`).
 * Only its shape is checked here, nonblank with no whitespace; `PlanRef` equality is what binds
 * a receipt to its reference, so the spelling must stay the same across both.
 */
const RepositoryId = type(/^\S{1,512}$/);
/** An OpenSpec change name. */
const ChangeName = type(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * The glossary's `PlanRef` (docs/twilight-structure/CONTEXT.md, "Plan reference"): one accepted
 * plan for one source basis.
 */
export const PlanRef = type({
  repository: RepositoryId,
  plan: WbsId,
  change: ChangeName,
  planningCommit: GitObjectId,
  sourceBaseCommit: GitObjectId,
  requirementsDigest: Sha256,
}).onUndeclaredKey('reject');
export type PlanRef = typeof PlanRef.infer;

/**
 * Navigator→Dash: one WBS plan export pinned to its source basis. `exportDigest` is SHA-256 of
 * the export file bytes, `tasksDigest` of the task export's canonical JSON, and `createdAt` is
 * the export's own `exportedAt`, so the record holds no reading of a clock.
 */
export const PlanReferenceRecord = type({
  schemaVersion: SchemaVersion,
  kind: "'plan-reference'",
  planRef: PlanRef,
  // Original wire version; historical records retain their digest and continue decoding.
  // Proof: omitting 9 failed its decode test (RED); admitting 10 failed the future-version
  // refusal in navigator-records.test.ts (2026-10-15). Omitting 10 failed its decode test;
  // admitting 11 failed the future-version refusal (2026-10-20). Omitting 11 failed its
  // decode test and Navigator's v11 plan-reference test; admitting 12 failed the
  // future-version refusal (2026-10-24).
  planDocumentVersion: '6 | 7 | 8 | 9 | 10 | 11',
  exportDigest: Sha256,
  // Proof: widening tasksDigest to string failed Navigator `refuses a malformed task digest`
  // before-writing diagnostic in receipt-to-commands.test.ts (2026-10-14).
  tasksDigest: Sha256,
  taskCount: 'number.integer>=0',
  createdAt: IsoInstant,
  referenceDigest: Sha256,
})
  // Proof: removing this rejection made `refuses an undeclared key on either record and inside
  // planRef` decode `extra` on the plan reference (2026-10-11).
  .onUndeclaredKey('reject')
  .narrow((record, context) =>
    // Proof: returning true here made `refuses a record whose embedded digest does not match`
    // decode the plan reference whose taskCount changed after digesting (2026-10-11).
    digestWithout(record, 'referenceDigest') === record.referenceDigest
      ? true
      : context.reject({ path: ['referenceDigest'], expected: 'the digest of the record' }),
  );
export type PlanReferenceRecord = typeof PlanReferenceRecord.infer;

const ReceiptEvidence = RelativePath.or(
  type({ kind: "'external'", authority: 'string>=1' }).onUndeclaredKey('reject'),
);

const ProgressEntry = type({
  taskId: WbsId,
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
