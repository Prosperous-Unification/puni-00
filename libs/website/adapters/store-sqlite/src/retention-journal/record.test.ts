import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import {
  encodeCanonical,
  encodeEvent,
  encodeGenesis,
  encodeHead,
  eventKey,
  genesisKey,
  hashEvent,
  headKey,
  type JournalEvent,
  type JournalGenesis,
  type JournalHead,
  JournalRecordError,
  journalSchema,
  parseEvent,
  parseGenesis,
  parseHead,
  sealEvent,
  type UnsealedJournalEvent,
  zeroHash,
} from './record';

const journalId = '0b6f6f0e-8f9a-4c3b-9d2e-1a2b3c4d5e6f';
const writer = {
  release: 'website-api-2026.10.11',
  privateRevision: 'a1b2c3d',
  process: 'api',
} as const;
const text = new TextDecoder();
const bytesOf = (value: string): Uint8Array => new TextEncoder().encode(value);

function unsealedEvent(overrides: Partial<UnsealedJournalEvent> = {}): UnsealedJournalEvent {
  return {
    schema: journalSchema,
    journalId,
    sequence: 1,
    previousHash: zeroHash,
    recordedAt: 1760140800000,
    subject: { kind: 'software_request', id: 'request-1' },
    event: { type: 'designate_client', evidenceReference: 'crm:deal/42', actor: 'dany' },
    writer,
    ...overrides,
  };
}

function head(overrides: Partial<JournalHead> = {}): JournalHead {
  return {
    schema: journalSchema,
    journalId,
    sequence: 0,
    hash: zeroHash,
    writtenAt: 1760140800000,
    writer,
    ...overrides,
  };
}

const genesis: JournalGenesis = {
  schema: journalSchema,
  journalId,
  environment: 'website-dev',
  createdAt: 1760140800000,
  createdBy: { release: 'website-api-2026.10.11', privateRevision: 'a1b2c3d' },
};

/** Re-encodes an edited JSON value with a hash recomputed, so only the edited rule can refuse it. */
function resealedBytes(edit: (record: Record<string, unknown>) => void): Uint8Array {
  const record = JSON.parse(text.decode(encodeEvent(sealEvent(unsealedEvent())))) as Record<
    string,
    unknown
  >;
  edit(record);
  delete record['hash'];
  const hash = createHash('sha256').update(encodeCanonical(record)).digest('hex');
  return encodeCanonical({ ...record, hash });
}

function refusal(parse: () => unknown): JournalRecordError {
  try {
    parse();
  } catch (error) {
    expect(error).toBeInstanceOf(JournalRecordError);
    return error as JournalRecordError;
  }
  throw new Error('expected a JournalRecordError');
}

test('canonical encoding is byte-stable across key order', () => {
  const forward = encodeCanonical({ b: 1, a: { d: 'x', c: [2, { f: 1, e: 0 }] } });
  const reversed = encodeCanonical({ a: { c: [2, { e: 0, f: 1 }], d: 'x' }, b: 1 });
  expect(text.decode(forward)).toBe('{"a":{"c":[2,{"e":0,"f":1}],"d":"x"},"b":1}\n');
  expect(reversed).toEqual(forward);
  const event = sealEvent(unsealedEvent());
  const shuffled = Object.fromEntries(Object.entries(event).reverse()) as unknown as JournalEvent;
  expect(encodeEvent(shuffled)).toEqual(encodeEvent(event));
  expect(event.hash).toBe(
    createHash('sha256').update(encodeCanonical(unsealedEvent())).digest('hex'),
  );
});

test('canonical encoding refuses values outside plain JSON', () => {
  for (const value of [
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    null,
    true,
    undefined,
    new Date(0),
    [Symbol('x')],
  ])
    expect(() => encodeCanonical(value)).toThrow(TypeError);
});

test('event keys are twelve-digit and bounded', () => {
  expect(eventKey(1)).toBe('events/000000000001.json');
  expect(eventKey(999999999999)).toBe('events/999999999999.json');
  for (const sequence of [0, -1, 1.5, 1e12, Number.NaN]) expect(() => eventKey(sequence)).toThrow();
});

test('a record with an email-shaped evidence reference is refused', () => {
  const bytes = resealedBytes((record) => {
    record['event'] = {
      type: 'place_hold',
      evidenceReference: 'client@example.com',
      actor: 'dany',
    };
  });
  const error = refusal(() => parseEvent(bytes, eventKey(1)));
  expect(error.reason).toBe('malformed');
  expect(error.message).toContain('events/000000000001.json');
  expect(error.message).toContain('event.evidenceReference');
  expect(() =>
    sealEvent(
      unsealedEvent({
        event: { type: 'place_hold', evidenceReference: 'client@example.com', actor: 'dany' },
      }),
    ),
  ).toThrow(JournalRecordError);
});

test('parse refuses unknown schema, bad hash hex, negative sequence, extra fields', () => {
  const key = eventKey(1);
  const cases: [string, (record: Record<string, unknown>) => void][] = [
    ['schema is not one of', (record) => (record['schema'] = 'puni-retention-journal/2')],
    ['previousHash does not match', (record) => (record['previousHash'] = 'G'.repeat(64))],
    ['sequence is not a non-negative integer', (record) => (record['sequence'] = -1)],
    ['sequence is outside', (record) => (record['sequence'] = 0)],
    ['description is not a known field', (record) => (record['description'] = 'free text')],
    [
      'subject.email is not a known field',
      (record) => (record['subject'] = { kind: 'software_request', id: 'request-1', email: 'x' }),
    ],
    [
      'event.brief is not a known field',
      (record) =>
        (record['event'] = {
          type: 'designate_client',
          evidenceReference: 'crm:deal/42',
          actor: 'dany',
          brief: 'x',
        }),
    ],
    [
      'writer.token is not a known field',
      (record) => (record['writer'] = { ...writer, token: 'x' }),
    ],
    [
      'event.type is not one of',
      (record) =>
        (record['event'] = {
          type: 'delete_everything',
          evidenceReference: 'crm:deal/42',
          actor: 'dany',
        }),
    ],
    ['recordedAt is missing', (record) => delete record['recordedAt']],
  ];
  for (const [detail, edit] of cases) {
    const error = refusal(() => parseEvent(resealedBytes(edit), key));
    expect(error.reason).toBe('malformed');
    expect(error.message).toContain(`${key} is malformed: ${detail}`);
  }
  const sealed = text.decode(resealedBytes(() => undefined));
  const tampered = bytesOf(sealed.replace(/"hash":"[0-9a-f]/u, '"hash":"Z'));
  expect(refusal(() => parseEvent(tampered, key)).message).toContain('hash does not match');
});

test('an event whose hash does not match its body is refused', () => {
  const event = sealEvent(unsealedEvent());
  const forged = encodeCanonical({ ...event, recordedAt: event.recordedAt + 1 });
  const error = refusal(() => parseEvent(forged, eventKey(1)));
  expect(error.reason).toBe('malformed');
  expect(error.message).toContain('hash');
  expect(() => encodeEvent({ ...event, recordedAt: event.recordedAt + 1 })).toThrow(
    JournalRecordError,
  );
});

test('a non-canonical body is refused even when its JSON is valid', () => {
  const canonical = text.decode(encodeEvent(sealEvent(unsealedEvent())));
  const spaced = bytesOf(canonical.replace('"schema":', '"schema": '));
  expect(refusal(() => parseEvent(spaced, eventKey(1))).reason).toBe('malformed');
});

test('truncated and malformed bytes are told apart', () => {
  const canonical = encodeEvent(sealEvent(unsealedEvent()));
  const cut = canonical.slice(0, canonical.length - 20);
  expect(refusal(() => parseEvent(cut, eventKey(1))).reason).toBe('truncated');
  const withoutNewline = canonical.slice(0, canonical.length - 1);
  expect(refusal(() => parseEvent(withoutNewline, eventKey(1))).reason).toBe('truncated');
  const cutWithNewline = bytesOf(`${text.decode(cut)}\n`);
  expect(refusal(() => parseEvent(cutWithNewline, eventKey(1))).reason).toBe('truncated');
  expect(refusal(() => parseEvent(new Uint8Array(), eventKey(1))).reason).toBe('truncated');
  expect(refusal(() => parseEvent(bytesOf('not json\n'), eventKey(1))).reason).toBe('malformed');
  expect(refusal(() => parseEvent(bytesOf('[1]\n'), eventKey(1))).reason).toBe('malformed');
  const invalidUtf8 = new Uint8Array([0xff, 0x0a]);
  expect(refusal(() => parseEvent(invalidUtf8, eventKey(1))).reason).toBe('malformed');
});

test('every event body type round-trips', () => {
  const bodies: UnsealedJournalEvent['event'][] = [
    { type: 'designate_client', evidenceReference: 'crm:deal/42', actor: 'dany' },
    {
      type: 'correct_classification',
      to: 'non_client',
      evidenceReference: 'crm:deal/42',
      actor: 'dany',
    },
    { type: 'place_hold', evidenceReference: 'legal#hold-1', actor: 'ops-bot' },
    { type: 'release_hold', evidenceReference: 'legal#hold-1', actor: 'ops-bot' },
    { type: 'resolve_anchor', anchorAt: 0, evidenceReference: 'ticket:7', actor: 'dany' },
    { type: 'erase', reason: 'due_non_client', deadlineAt: 1760140800000 },
  ];
  for (const [index, body] of bodies.entries()) {
    const event = sealEvent(
      unsealedEvent({
        sequence: index + 1,
        subject: { kind: 'proposal_submission', id: `submission-${String(index)}` },
        event: body,
      }),
    );
    expect(
      hashEvent(unsealedEvent({ sequence: index + 1, subject: event.subject, event: body })),
    ).toBe(event.hash);
    expect(parseEvent(encodeEvent(event), eventKey(index + 1))).toEqual(event);
  }
});

test('heads round-trip and keep the sequence-zero invariant', () => {
  const empty = head();
  expect(parseHead(encodeHead(empty), headKey)).toEqual(empty);
  const tip = head({
    sequence: 12,
    hash: 'a'.repeat(64),
    eventKey: eventKey(12),
    eventVersionId: 'version-12',
  });
  expect(parseHead(encodeHead(tip), headKey)).toEqual(tip);
  const invalid: JournalHead[] = [
    head({ hash: 'a'.repeat(64) }),
    head({ eventKey: eventKey(1), eventVersionId: 'v' }),
    head({ sequence: 12, hash: 'a'.repeat(64), eventVersionId: 'v' }),
    head({ sequence: 12, hash: 'a'.repeat(64), eventKey: eventKey(11), eventVersionId: 'v' }),
    head({ sequence: 12, hash: 'a'.repeat(64), eventKey: eventKey(12), eventVersionId: '' }),
  ];
  for (const candidate of invalid) {
    expect(() => encodeHead(candidate)).toThrow(JournalRecordError);
    const error = refusal(() => parseHead(encodeCanonical(candidate), headKey));
    expect(error.reason).toBe('malformed');
    expect(error.message).toContain(headKey);
  }
});

test('genesis round-trips and refuses foreign shapes', () => {
  expect(parseGenesis(encodeGenesis(genesis), genesisKey)).toEqual(genesis);
  const invalid = [
    { ...genesis, journalId: journalId.toUpperCase() },
    { ...genesis, environment: 'Website' },
    { ...genesis, createdAt: -1 },
    { ...genesis, createdBy: { release: 'r', privateRevision: 'p', process: 'api' } },
  ];
  for (const candidate of invalid) {
    const error = refusal(() => parseGenesis(encodeCanonical(candidate), genesisKey));
    expect(error.reason).toBe('malformed');
    expect(error.message).toContain(genesisKey);
  }
});
