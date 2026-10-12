import { parseOrThrow, type } from '@shared/validation';
import {
  hashBytes,
  hashCanonical,
  ReviewSubject,
  serializeCanonical,
} from '@twilight-burokrat/judge';
import type { Database } from 'bun:sqlite';

const Digest = /^[0-9a-f]{64}$/;
// Proof: six absent top-level fields and unknown top-level/selection keys
// individually passed when only their schema guard was relaxed. Eight other
// absent-field mutations remained refused by later joins and are disqualified
// as isolated schema proofs (see verify.md).
const ReviewSelectionRecordV1 = type({
  schemaVersion: '1',
  kind: "'activation-review-selection'",
  requestIdentity: Digest,
  reviewId: 'string>=1',
  protocolIdentity: Digest,
  selectorIdentity: Digest,
  snapshotIdentity: Digest,
  coveragePlanIdentity: Digest,
  sourceObligationId: 'string>=1',
  selection: type({
    subject: ReviewSubject,
    informedContextIds: type(Digest).array(),
    coldRequiredReadIds: type(Digest).array(),
    informedRequiredReadIds: type(Digest).array(),
  }).onUndeclaredKey('reject'),
}).onUndeclaredKey('reject');
export type ReviewSelectionRecordV1 = typeof ReviewSelectionRecordV1.infer;

const StoredSelectionRow = type({
  request_identity: Digest,
  review_id: 'string>=1',
  protocol_identity: Digest,
  selection_bytes: 'string>=1',
  selection_record_identity: Digest,
}).onUndeclaredKey('reject');

/** Derives the stable review key from a frozen coverage plan and its selected source obligation. */
export function deriveProtectedReviewId(
  coveragePlanIdentity: string,
  sourceObligationId: string,
): string {
  // Proof: malformed plan digest and absent obligation separately acquired a
  // derived review label when their input predicates were omitted.
  if (!Digest.test(coveragePlanIdentity) || sourceObligationId.length === 0)
    throw new Error('review selection source key malformed');
  return `review.${hashCanonical({ schemaVersion: 1, coveragePlanIdentity, sourceObligationId })}`;
}

function isSortedUnique(digests: readonly string[]): boolean {
  return digests.every((digest, index) => index === 0 || digests[index - 1] < digest);
}

/** Decodes exact retained canonical bytes; structural validity alone does not make a selection protected or authoritative. */
export function decodeUntrustedReviewSelectionRecord(bytes: Uint8Array | string): {
  readonly record: ReviewSelectionRecordV1;
  readonly recordIdentity: string;
  readonly selectionIdentity: string;
} {
  // Proof: a 65,537-byte record lost its bounded refusal without this cap;
  // a separate huge-string test observed that Buffer.from was not called.
  const length = typeof bytes === 'string' ? Buffer.byteLength(bytes, 'utf8') : bytes.byteLength;
  if (length > 65_536) throw new Error('review selection record too large');
  const raw = Buffer.from(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch (cause) {
    // Proof: disabling fatal decoding changed malformed UTF-8 from its
    // modeled boundary refusal into a later canonical-byte error.
    throw new Error('review selection UTF-8 malformed', { cause });
  }
  const parsed: unknown = JSON.parse(text);
  const record = parseOrThrow(ReviewSelectionRecordV1, parsed);
  // Proof: missing-LF, CRLF, whitespace and duplicate-key fixtures were
  // accepted when the exact canonical-byte comparison was omitted.
  if (serializeCanonical(record) !== text)
    throw new Error('review selection record is not canonical');
  // Proof: a substituted review ID passed the remaining shape/hash checks
  // when this frozen source-key comparison was omitted.
  if (
    record.reviewId !==
    deriveProtectedReviewId(record.coveragePlanIdentity, record.sourceObligationId)
  )
    throw new Error('review selection record review ID differs from source');
  const { subject, informedContextIds, coldRequiredReadIds, informedRequiredReadIds } =
    record.selection;
  // Proof: missing selected content, missing informed context and duplicated
  // or unsorted reads each passed when only the corresponding set guard was omitted.
  if (
    !isSortedUnique(coldRequiredReadIds) ||
    !isSortedUnique(informedRequiredReadIds) ||
    !coldRequiredReadIds.includes(subject.contentIdentity) ||
    !informedRequiredReadIds.includes(subject.contentIdentity) ||
    !informedContextIds.every((digest) => informedRequiredReadIds.includes(digest))
  )
    throw new Error('review selection required reads malformed');
  return {
    record,
    recordIdentity: hashBytes(raw),
    selectionIdentity: hashCanonical(record.selection),
  };
}

/** Inspects one seeded SQLite selection row through a supplied database capability; this does not validate frozen plan, dispatch, selector or source authority. */
export function inspectUntrustedStoredReviewSelection(
  database: Database,
  key: {
    readonly requestIdentity: string;
    readonly reviewId: string;
    readonly protocolIdentity: string;
  },
): ReturnType<typeof decodeUntrustedReviewSelectionRecord> {
  // Proof: malformed request/review/protocol keys each lost its modeled
  // boundary refusal when that key predicate was omitted.
  if (
    !Digest.test(key.requestIdentity) ||
    !Digest.test(key.protocolIdentity) ||
    key.reviewId.length === 0
  )
    throw new Error('review selection key malformed');
  const source: unknown = database
    .query(
      `SELECT request_identity, review_id, protocol_identity,
    selection_bytes, selection_record_identity FROM activation_review_selection
    WHERE request_identity = ? AND review_id = ? AND protocol_identity = ?`,
    )
    .get(key.requestIdentity, key.reviewId, key.protocolIdentity);
  // Proof: a foreign review key returned absence; removing this modeled
  // refusal changed the named test into a malformed-row parse error.
  if (source === null) throw new Error('review selection row absent');
  const row = parseOrThrow(StoredSelectionRow, source);
  const inspected = decodeUntrustedReviewSelectionRecord(row.selection_bytes);
  // Proof: changing only the retained whole-record digest, or separately
  // substituting canonical request/review/protocol bytes while preserving
  // their digest, passed when the corresponding row/record join was omitted.
  if (
    row.selection_record_identity !== inspected.recordIdentity ||
    inspected.record.requestIdentity !== key.requestIdentity ||
    inspected.record.reviewId !== key.reviewId ||
    inspected.record.protocolIdentity !== key.protocolIdentity
  )
    throw new Error('review selection stored row differs from canonical record');
  return inspected;
}

/** Compares a decoded record with an independently validated frozen-source projection; the projection still needs protected provenance and selector parity. */
export function assertUntrustedReviewSelectionSource(
  record: ReviewSelectionRecordV1,
  source: {
    readonly selectorIdentity: string;
    readonly snapshotIdentity: string;
    readonly coveragePlanIdentity: string;
    readonly protocolIdentity: string;
    readonly obligations: readonly {
      readonly obligationId: string;
      readonly subject: typeof ReviewSubject.infer;
    }[];
    readonly retainedContentIdentities: readonly string[];
  },
): void {
  // Proof: foreign selector, snapshot, coverage plan and protocol projections
  // each passed the pure join when only their comparison was omitted.
  if (
    record.selectorIdentity !== source.selectorIdentity ||
    record.snapshotIdentity !== source.snapshotIdentity ||
    record.coveragePlanIdentity !== source.coveragePlanIdentity ||
    record.protocolIdentity !== source.protocolIdentity
  )
    throw new Error('review selection differs from retained source');
  const selected = source.obligations.filter(
    (obligation) => obligation.obligationId === record.sourceObligationId,
  );
  // Proof: absent and duplicate source obligations separately passed when
  // the exact-one cardinality guard was omitted.
  if (selected.length !== 1) throw new Error('review selection differs from retained source');
  // Proof: a foreign full subject object passed when this source comparison
  // was omitted; a signed subject label supplies no source authority.
  if (serializeCanonical(selected[0].subject) !== serializeCanonical(record.selection.subject))
    throw new Error('review selection differs from retained source');
  const required = new Set([
    record.selection.subject.contentIdentity,
    ...record.selection.informedContextIds,
    ...record.selection.coldRequiredReadIds,
    ...record.selection.informedRequiredReadIds,
  ]);
  // Proof: absent retained subject and context digests separately passed when
  // this retained-content membership fence was omitted.
  if (![...required].every((identity) => source.retainedContentIdentities.includes(identity)))
    throw new Error('review selection differs from retained source');
}
