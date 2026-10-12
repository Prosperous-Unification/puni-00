import { Database } from 'bun:sqlite';
import { expect, spyOn, test } from 'bun:test';

import { hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import {
  assertUntrustedReviewSelectionSource,
  decodeUntrustedReviewSelectionRecord,
  deriveProtectedReviewId,
  inspectUntrustedStoredReviewSelection,
  type ReviewSelectionRecordV1,
} from './review-selection';

const subjectDigest = 'a'.repeat(64);
const contextDigest = 'b'.repeat(64);
const planDigest = 'c'.repeat(64);

function selectionRecordFixture(): ReviewSelectionRecordV1 {
  return {
    schemaVersion: 1,
    kind: 'activation-review-selection',
    requestIdentity: 'd'.repeat(64),
    reviewId: deriveProtectedReviewId(planDigest, 'obligation.1'),
    protocolIdentity: 'e'.repeat(64),
    selectorIdentity: 'f'.repeat(64),
    snapshotIdentity: '1'.repeat(64),
    coveragePlanIdentity: planDigest,
    sourceObligationId: 'obligation.1',
    selection: {
      subject: {
        subjectId: 'subject.file.1',
        kind: 'file',
        locator: { kind: 'path', path: 'README.md' },
        contentIdentity: subjectDigest,
      },
      informedContextIds: [contextDigest],
      coldRequiredReadIds: [subjectDigest],
      informedRequiredReadIds: [subjectDigest, contextDigest],
    },
  };
}

test('selection decoder preserves literal terminal-LF bytes and two distinct identities', () => {
  const record = selectionRecordFixture();
  const bytes = serializeCanonical(record);
  const decoded = decodeUntrustedReviewSelectionRecord(Buffer.from(bytes));
  expect(bytes.endsWith('\n')).toBe(true);
  expect(decoded.record).toEqual(record);
  expect(decoded.recordIdentity).toBe(hashCanonical(record));
  expect(decoded.selectionIdentity).toBe(hashCanonical(record.selection));
  expect(decoded.recordIdentity).not.toBe(decoded.selectionIdentity);
});

test.each([
  ['missing LF', (bytes: string) => bytes.slice(0, -1)],
  ['CRLF', (bytes: string) => `${bytes.slice(0, -1)}\r\n`],
  ['extra space', (bytes: string) => bytes.replace('"kind":', '"kind": ')],
  ['duplicate key', (bytes: string) => bytes.replace('"kind":', '"kind":"other","kind":')],
])('selection decoder refuses %s canonical bytes', (_, change) => {
  expect(() =>
    decodeUntrustedReviewSelectionRecord(change(serializeCanonical(selectionRecordFixture()))),
  ).toThrow();
});

test('selection decoder refuses malformed UTF-8 before JSON parsing', () => {
  const bytes = Buffer.from(serializeCanonical(selectionRecordFixture()));
  bytes[20] = 0xff;
  expect(() => decodeUntrustedReviewSelectionRecord(bytes)).toThrow(
    'review selection UTF-8 malformed',
  );
});

test('selection decoder refuses a record above its byte ceiling', () => {
  const bytes = Buffer.alloc(65_537, 0x20);
  expect(() => decodeUntrustedReviewSelectionRecord(bytes)).toThrow(
    'review selection record too large',
  );
});

test('selection decoder refuses a huge string before copying it into a Buffer', () => {
  const from = spyOn(Buffer, 'from');
  try {
    expect(() => decodeUntrustedReviewSelectionRecord('x'.repeat(65_537))).toThrow(
      'review selection record too large',
    );
    expect(from).not.toHaveBeenCalled();
  } finally {
    from.mockRestore();
  }
});

test('selection decoder refuses a caller substituted review label', () => {
  const record = { ...selectionRecordFixture(), reviewId: 'review.foreign' };
  expect(() => decodeUntrustedReviewSelectionRecord(serializeCanonical(record))).toThrow(
    'review selection record review ID differs from source',
  );
});

test.each([
  'schemaVersion',
  'kind',
  'requestIdentity',
  'reviewId',
  'protocolIdentity',
  'selectorIdentity',
  'snapshotIdentity',
  'coveragePlanIdentity',
  'sourceObligationId',
  'selection',
] as const)('selection decoder refuses absent outer field %s', (field) => {
  const record = selectionRecordFixture();
  Reflect.deleteProperty(record, field);
  expect(() => decodeUntrustedReviewSelectionRecord(serializeCanonical(record))).toThrow();
});

test.each([
  'subject',
  'informedContextIds',
  'coldRequiredReadIds',
  'informedRequiredReadIds',
] as const)('selection decoder refuses absent selection field %s', (field) => {
  const record = selectionRecordFixture();
  Reflect.deleteProperty(record.selection, field);
  expect(() => decodeUntrustedReviewSelectionRecord(serializeCanonical(record))).toThrow();
});

test.each([
  ['outer', { unexpected: true }],
  ['selection', { selection: { ...selectionRecordFixture().selection, unexpected: true } }],
] as const)('selection decoder refuses unknown %s key', (_, change) => {
  expect(() =>
    decodeUntrustedReviewSelectionRecord(
      serializeCanonical({
        ...selectionRecordFixture(),
        ...change,
      }),
    ),
  ).toThrow();
});

test.each([
  ['missing subject read', { coldRequiredReadIds: [] }],
  ['missing informed subject', { informedRequiredReadIds: [contextDigest] }],
  ['missing informed context', { informedRequiredReadIds: [subjectDigest] }],
  ['unsorted reads', { informedRequiredReadIds: [contextDigest, subjectDigest] }],
  ['duplicate reads', { coldRequiredReadIds: [subjectDigest, subjectDigest] }],
])('selection decoder refuses %s', (_, change) => {
  const record = selectionRecordFixture();
  expect(() =>
    decodeUntrustedReviewSelectionRecord(
      serializeCanonical({
        ...record,
        selection: { ...record.selection, ...change },
      }),
    ),
  ).toThrow();
});

test('derived review ID binds plan identity and source obligation', () => {
  expect(deriveProtectedReviewId(planDigest, 'obligation.1')).toBe(
    `review.${hashCanonical({ schemaVersion: 1, coveragePlanIdentity: planDigest, sourceObligationId: 'obligation.1' })}`,
  );
  expect(deriveProtectedReviewId(planDigest, 'obligation.1')).not.toBe(
    deriveProtectedReviewId(planDigest, 'obligation.2'),
  );
});

test('derived review ID refuses malformed coverage plan identity', () => {
  expect(() => deriveProtectedReviewId('foreign', 'obligation.1')).toThrow(
    'review selection source key malformed',
  );
});

test('derived review ID refuses an absent source obligation', () => {
  expect(() => deriveProtectedReviewId(planDigest, '')).toThrow(
    'review selection source key malformed',
  );
});

function withSeededSelection(
  inspect: (database: Database, record: ReturnType<typeof selectionRecordFixture>) => void,
): void {
  const database = new Database(':memory:');
  const record = selectionRecordFixture();
  const bytes = serializeCanonical(record);
  try {
    database.run(`CREATE TABLE activation_review_selection (
      request_identity TEXT NOT NULL, review_id TEXT NOT NULL, protocol_identity TEXT NOT NULL,
      selection_bytes TEXT NOT NULL, selection_record_identity TEXT NOT NULL,
      PRIMARY KEY (request_identity, review_id, protocol_identity)
    )`);
    database
      .query(
        `INSERT INTO activation_review_selection
      (request_identity, review_id, protocol_identity, selection_bytes, selection_record_identity)
      VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        record.requestIdentity,
        record.reviewId,
        record.protocolIdentity,
        bytes,
        hashCanonical(record),
      );
    inspect(database, record);
  } finally {
    database.close();
  }
}

test('seeded read-only selection lookup returns exact row and identity without receipt labels', () => {
  withSeededSelection((database, record) => {
    const inspected = inspectUntrustedStoredReviewSelection(database, {
      requestIdentity: record.requestIdentity,
      reviewId: record.reviewId,
      protocolIdentity: record.protocolIdentity,
    });
    expect(inspected.record).toEqual(record);
    expect(inspected.recordIdentity).toBe(hashCanonical(record));
  });
});

test('seeded read-only selection lookup refuses an absent key', () => {
  withSeededSelection((database, record) => {
    expect(() =>
      inspectUntrustedStoredReviewSelection(database, {
        requestIdentity: record.requestIdentity,
        reviewId: 'review.foreign',
        protocolIdentity: record.protocolIdentity,
      }),
    ).toThrow('review selection row absent');
  });
});

test('seeded read-only selection lookup refuses a legacy database without the selection table', () => {
  const database = new Database(':memory:');
  const record = selectionRecordFixture();
  try {
    expect(() =>
      inspectUntrustedStoredReviewSelection(database, {
        requestIdentity: record.requestIdentity,
        reviewId: record.reviewId,
        protocolIdentity: record.protocolIdentity,
      }),
    ).toThrow();
  } finally {
    database.close();
  }
});

test('seeded read-only selection lookup refuses malformed stored digest metadata', () => {
  withSeededSelection((database, record) => {
    database
      .query('UPDATE activation_review_selection SET selection_record_identity = ?')
      .run('bad');
    expect(() =>
      inspectUntrustedStoredReviewSelection(database, {
        requestIdentity: record.requestIdentity,
        reviewId: record.reviewId,
        protocolIdentity: record.protocolIdentity,
      }),
    ).toThrow();
  });
});

test('seeded read-only selection lookup refuses a changed stored record digest', () => {
  withSeededSelection((database, record) => {
    database
      .query('UPDATE activation_review_selection SET selection_record_identity = ?')
      .run('0'.repeat(64));
    expect(() =>
      inspectUntrustedStoredReviewSelection(database, {
        requestIdentity: record.requestIdentity,
        reviewId: record.reviewId,
        protocolIdentity: record.protocolIdentity,
      }),
    ).toThrow('review selection stored row differs from canonical record');
  });
});

test('seeded read-only selection lookup refuses missing terminal LF', () => {
  withSeededSelection((database, record) => {
    database
      .query('UPDATE activation_review_selection SET selection_bytes = ?')
      .run(serializeCanonical(record).slice(0, -1));
    expect(() =>
      inspectUntrustedStoredReviewSelection(database, {
        requestIdentity: record.requestIdentity,
        reviewId: record.reviewId,
        protocolIdentity: record.protocolIdentity,
      }),
    ).toThrow('review selection record is not canonical');
  });
});

test.each([
  [
    'request identity',
    (record: ReturnType<typeof selectionRecordFixture>) => ({
      ...record,
      requestIdentity: '9'.repeat(64),
    }),
  ],
  [
    'protocol identity',
    (record: ReturnType<typeof selectionRecordFixture>) => ({
      ...record,
      protocolIdentity: '9'.repeat(64),
    }),
  ],
  [
    'review identity',
    (record: ReturnType<typeof selectionRecordFixture>) => ({
      ...record,
      sourceObligationId: 'obligation.2',
      reviewId: deriveProtectedReviewId(planDigest, 'obligation.2'),
    }),
  ],
] as const)('seeded selection row refuses substituted %s inside canonical bytes', (_, corrupt) => {
  withSeededSelection((database, record) => {
    const foreign = corrupt(record);
    const bytes = serializeCanonical(foreign);
    database
      .query(
        `UPDATE activation_review_selection SET
      selection_bytes = ?, selection_record_identity = ?`,
      )
      .run(bytes, hashCanonical(foreign));
    expect(() =>
      inspectUntrustedStoredReviewSelection(database, {
        requestIdentity: record.requestIdentity,
        reviewId: record.reviewId,
        protocolIdentity: record.protocolIdentity,
      }),
    ).toThrow('review selection stored row differs from canonical record');
  });
});

test.each([
  ['request', { requestIdentity: 'foreign' }],
  ['review', { reviewId: '' }],
  ['protocol', { protocolIdentity: 'foreign' }],
] as const)('seeded selection lookup refuses malformed %s key', (_, change) => {
  withSeededSelection((database, record) => {
    expect(() =>
      inspectUntrustedStoredReviewSelection(database, {
        requestIdentity: record.requestIdentity,
        reviewId: record.reviewId,
        protocolIdentity: record.protocolIdentity,
        ...change,
      }),
    ).toThrow('review selection key malformed');
  });
});

function selectionSourceFixture() {
  const record = selectionRecordFixture();
  return {
    selectorIdentity: record.selectorIdentity,
    snapshotIdentity: record.snapshotIdentity,
    coveragePlanIdentity: record.coveragePlanIdentity,
    protocolIdentity: record.protocolIdentity,
    obligations: [{ obligationId: record.sourceObligationId, subject: record.selection.subject }],
    retainedContentIdentities: [subjectDigest, contextDigest],
  };
}

test('seeded selection joins exact independent source projection without producing authority', () => {
  expect(() => {
    assertUntrustedReviewSelectionSource(selectionRecordFixture(), selectionSourceFixture());
  }).not.toThrow();
});

test.each([
  ['selector', { selectorIdentity: '9'.repeat(64) }],
  ['snapshot', { snapshotIdentity: '9'.repeat(64) }],
  ['coverage plan', { coveragePlanIdentity: '9'.repeat(64) }],
  ['protocol', { protocolIdentity: '9'.repeat(64) }],
  ['source obligation', { obligations: [] }],
  [
    'duplicate source obligation',
    {
      obligations: [
        selectionSourceFixture().obligations[0],
        selectionSourceFixture().obligations[0],
      ],
    },
  ],
  [
    'source subject',
    {
      obligations: [
        {
          obligationId: 'obligation.1',
          subject: {
            ...selectionRecordFixture().selection.subject,
            contentIdentity: '9'.repeat(64),
          },
        },
      ],
    },
  ],
  ['retained subject', { retainedContentIdentities: [contextDigest] }],
  ['retained context', { retainedContentIdentities: [subjectDigest] }],
] as const)('seeded selection refuses foreign %s projection', (_, change) => {
  expect(() => {
    assertUntrustedReviewSelectionSource(selectionRecordFixture(), {
      ...selectionSourceFixture(),
      ...change,
    });
  }).toThrow('review selection differs from retained source');
});
