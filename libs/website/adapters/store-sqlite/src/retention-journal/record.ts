import { createHash } from 'node:crypto';

/** Schema string every journal record carries; a reader refuses any other value. */
export const journalSchema = 'puni-retention-journal/1';

/** The `previousHash` of event 1 and the `hash` of a head at sequence 0. */
export const zeroHash = '0'.repeat(64);

/** Written once by `journal-init`; binds the journal id to its environment. */
export const genesisKey = 'genesis.json';

/** Rewritten after every append; the versioned bucket keeps each prior version. */
export const headKey = 'head.json';

const maximumSequence = 999_999_999_999;

/**
 * Relative key of the immutable object holding event `sequence`.
 *
 * @throws RangeError unless `sequence` is an integer from 1 to 999 999 999 999 (twelve digits).
 */
export function eventKey(sequence: number): string {
  // Proof: dropping the upper bound let 1e12 through in `event keys are twelve-digit and bounded`.
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > maximumSequence)
    throw new RangeError(`retention journal sequence ${String(sequence)} has no event key`);
  return `events/${String(sequence).padStart(12, '0')}.json`;
}

/** The two typed identities that own a retention deadline. */
export type JournalSubjectKind = 'software_request' | 'proposal_submission';

/** One policy decision; it names evidence and an actor but never carries request content. */
export type JournalEventBody =
  | { type: 'designate_client'; evidenceReference: string; actor: string }
  | { type: 'correct_classification'; to: 'non_client'; evidenceReference: string; actor: string }
  | { type: 'place_hold'; evidenceReference: string; actor: string }
  | { type: 'release_hold'; evidenceReference: string; actor: string }
  | { type: 'resolve_anchor'; anchorAt: number; evidenceReference: string; actor: string }
  | { type: 'erase'; reason: 'due_non_client'; deadlineAt: number };

export interface JournalWriter {
  release: string;
  privateRevision: string;
  process: 'api' | 'cli';
}

/** An immutable chain link; `hash` is {@link hashEvent} of every other field. */
export interface JournalEvent {
  schema: typeof journalSchema;
  journalId: string;
  sequence: number;
  previousHash: string;
  recordedAt: number;
  subject: { kind: JournalSubjectKind; id: string };
  event: JournalEventBody;
  writer: JournalWriter;
  hash: string;
}

export type UnsealedJournalEvent = Omit<JournalEvent, 'hash'>;

/**
 * The witness of the latest event. Sequence 0 has `hash` {@link zeroHash} and neither
 * `eventKey` nor `eventVersionId`; any later sequence has both, with `eventKey` equal to
 * `eventKey(sequence)`.
 */
export interface JournalHead {
  schema: typeof journalSchema;
  journalId: string;
  sequence: number;
  hash: string;
  eventKey?: string;
  eventVersionId?: string;
  writtenAt: number;
  writer: JournalWriter;
}

export interface JournalGenesis {
  schema: typeof journalSchema;
  journalId: string;
  environment: string;
  createdAt: number;
  createdBy: { release: string; privateRevision: string };
}

/** `truncated`: the bytes end early. `malformed`: anything else a reader refuses. */
export type JournalRecordFault = 'truncated' | 'malformed';

/** A record that no reader accepts; the message names the object key and the offending field, never its value. */
export class JournalRecordError extends Error {
  override readonly name = 'JournalRecordError';

  constructor(
    readonly reason: JournalRecordFault,
    readonly key: string,
    detail: string,
    options?: ErrorOptions,
  ) {
    super(`retention journal record ${key} is ${reason}: ${detail}`, options);
  }
}

/** A field-level refusal from the shared validator; wrappers turn it into {@link JournalRecordError}. */
class FieldError extends Error {
  constructor(path: string, problem: string) {
    super(`${path} ${problem}`);
  }
}

const hashPattern = /^[0-9a-f]{64}$/u;
const evidencePattern = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,199}$/u;
const actorPattern = /^[a-z][a-z0-9_-]{0,63}$/u;
const journalIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const subjectIdPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/u;
const revisionPattern = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/u;
const environmentPattern = /^[a-z][a-z0-9-]{0,62}$/u;
const maximumVersionIdLength = 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Requires a plain object whose keys are exactly `required` plus any of `optional`.
 *
 * @throws FieldError naming the first missing or unknown field.
 */
function fields(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!isPlainObject(value)) throw new FieldError(path, 'is not an object');
  for (const name of required)
    if (!Object.hasOwn(value, name)) throw new FieldError(join(path, name), 'is missing');
  // Proof: removing this unknown-field loop let `extra` through in `parse refuses unknown schema, bad hash hex, negative sequence, extra fields`.
  for (const name of Object.keys(value))
    if (!required.includes(name) && !optional.includes(name))
      throw new FieldError(join(path, name), 'is not a known field');
  return value;
}

function join(path: string, name: string): string {
  return path === '' ? name : `${path}.${name}`;
}

function matching(value: unknown, path: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value))
    throw new FieldError(path, `does not match ${String(pattern)}`);
  return value;
}

function count(value: unknown, path: string): number {
  // Proof: dropping the sign check changed the `sequence: -1` refusal detail in `parse refuses unknown schema, bad hash hex, negative sequence, extra fields`.
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new FieldError(path, 'is not a non-negative integer');
  return value;
}

function oneOf<const Choice extends string>(
  value: unknown,
  path: string,
  choices: readonly Choice[],
): Choice {
  const choice = choices.find((candidate) => candidate === value);
  if (choice === undefined) throw new FieldError(path, `is not one of ${choices.join(', ')}`);
  return choice;
}

function versionId(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumVersionIdLength)
    throw new FieldError(path, 'is not a version id');
  return value;
}

function checkSchema(value: unknown): typeof journalSchema {
  // Proof: dropping this check let `puni-retention-journal/2` through in `parse refuses unknown schema, bad hash hex, negative sequence, extra fields`.
  return oneOf(value, 'schema', [journalSchema]);
}

function checkWriter(value: unknown): JournalWriter {
  const writer = fields(value, 'writer', ['release', 'privateRevision', 'process']);
  return {
    release: matching(writer['release'], 'writer.release', revisionPattern),
    privateRevision: matching(writer['privateRevision'], 'writer.privateRevision', revisionPattern),
    process: oneOf(writer['process'], 'writer.process', ['api', 'cli']),
  };
}

function checkEventBody(value: unknown): JournalEventBody {
  if (!isPlainObject(value)) throw new FieldError('event', 'is not an object');
  const type = oneOf(value['type'], 'event.type', [
    'designate_client',
    'correct_classification',
    'place_hold',
    'release_hold',
    'resolve_anchor',
    'erase',
  ]);
  if (type === 'erase') {
    const body = fields(value, 'event', ['type', 'reason', 'deadlineAt']);
    return {
      type,
      reason: oneOf(body['reason'], 'event.reason', ['due_non_client']),
      deadlineAt: count(body['deadlineAt'], 'event.deadlineAt'),
    };
  }
  const extra =
    type === 'correct_classification' ? ['to'] : type === 'resolve_anchor' ? ['anchorAt'] : [];
  const body = fields(value, 'event', ['type', 'evidenceReference', 'actor', ...extra]);
  // Proof: replacing the evidence pattern with /./ let `client@example.com` through in `a record with an email-shaped evidence reference is refused`.
  const evidenceReference = matching(
    body['evidenceReference'],
    'event.evidenceReference',
    evidencePattern,
  );
  const actor = matching(body['actor'], 'event.actor', actorPattern);
  switch (type) {
    case 'correct_classification':
      return { type, to: oneOf(body['to'], 'event.to', ['non_client']), evidenceReference, actor };
    case 'resolve_anchor':
      return {
        type,
        anchorAt: count(body['anchorAt'], 'event.anchorAt'),
        evidenceReference,
        actor,
      };
    default:
      return { type, evidenceReference, actor };
  }
}

function checkUnsealedEvent(value: unknown, sealed: boolean): UnsealedJournalEvent {
  const event = fields(value, '', [
    'schema',
    'journalId',
    'sequence',
    'previousHash',
    'recordedAt',
    'subject',
    'event',
    'writer',
    ...(sealed ? ['hash'] : []),
  ]);
  const sequence = count(event['sequence'], 'sequence');
  if (sequence < 1 || sequence > maximumSequence)
    throw new FieldError('sequence', 'is outside 1..999999999999');
  const subject = fields(event['subject'], 'subject', ['kind', 'id']);
  return {
    schema: checkSchema(event['schema']),
    journalId: matching(event['journalId'], 'journalId', journalIdPattern),
    sequence,
    // Proof: replacing the hash pattern with /./ let the uppercase `G` hash through in `parse refuses unknown schema, bad hash hex, negative sequence, extra fields`.
    previousHash: matching(event['previousHash'], 'previousHash', hashPattern),
    recordedAt: count(event['recordedAt'], 'recordedAt'),
    subject: {
      kind: oneOf(subject['kind'], 'subject.kind', ['software_request', 'proposal_submission']),
      id: matching(subject['id'], 'subject.id', subjectIdPattern),
    },
    event: checkEventBody(event['event']),
    writer: checkWriter(event['writer']),
  };
}

function checkEvent(value: unknown): JournalEvent {
  const unsealed = checkUnsealedEvent(value, true);
  if (!isPlainObject(value)) throw new FieldError('', 'is not an object');
  const hash = matching(value['hash'], 'hash', hashPattern);
  // Proof: removing this comparison accepted the re-dated body in `an event whose hash does not match its body is refused`.
  if (hash !== hashEvent(unsealed)) throw new FieldError('hash', 'does not match the event body');
  return { ...unsealed, hash };
}

function checkHead(value: unknown): JournalHead {
  const head = fields(
    value,
    '',
    ['schema', 'journalId', 'sequence', 'hash', 'writtenAt', 'writer'],
    ['eventKey', 'eventVersionId'],
  );
  const checked: JournalHead = {
    schema: checkSchema(head['schema']),
    journalId: matching(head['journalId'], 'journalId', journalIdPattern),
    sequence: count(head['sequence'], 'sequence'),
    hash: matching(head['hash'], 'hash', hashPattern),
    writtenAt: count(head['writtenAt'], 'writtenAt'),
    writer: checkWriter(head['writer']),
  };
  // Proof: removing the sequence-zero branch made `heads round-trip and keep the sequence-zero invariant` fail (eventKey(0) threw RangeError).
  if (checked.sequence === 0) {
    if (checked.hash !== zeroHash)
      throw new FieldError('hash', 'is not the zero hash at sequence 0');
    if (Object.hasOwn(head, 'eventKey') || Object.hasOwn(head, 'eventVersionId'))
      throw new FieldError('eventKey', 'is present at sequence 0');
    return checked;
  }
  if (checked.sequence > maximumSequence)
    throw new FieldError('sequence', 'is outside 0..999999999999');
  // Proof: removing the eventKey equality accepted events/000000000011.json for sequence 12 in `heads round-trip and keep the sequence-zero invariant`.
  if (head['eventKey'] !== eventKey(checked.sequence))
    throw new FieldError('eventKey', 'does not name the head sequence');
  return {
    ...checked,
    eventKey: eventKey(checked.sequence),
    eventVersionId: versionId(head['eventVersionId'], 'eventVersionId'),
  };
}

function checkGenesis(value: unknown): JournalGenesis {
  const genesis = fields(value, '', [
    'schema',
    'journalId',
    'environment',
    'createdAt',
    'createdBy',
  ]);
  const createdBy = fields(genesis['createdBy'], 'createdBy', ['release', 'privateRevision']);
  return {
    schema: checkSchema(genesis['schema']),
    journalId: matching(genesis['journalId'], 'journalId', journalIdPattern),
    environment: matching(genesis['environment'], 'environment', environmentPattern),
    createdAt: count(genesis['createdAt'], 'createdAt'),
    createdBy: {
      release: matching(createdBy['release'], 'createdBy.release', revisionPattern),
      privateRevision: matching(
        createdBy['privateRevision'],
        'createdBy.privateRevision',
        revisionPattern,
      ),
    },
  };
}

function canonicalText(value: unknown, path: string): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new TypeError(`canonical JSON at ${path || '<root>'} is not a safe integer`);
    return String(value);
  }
  if (Array.isArray(value))
    return `[${value.map((entry, index) => canonicalText(entry, `${path}[${String(index)}]`)).join(',')}]`;
  if (isPlainObject(value)) {
    const members = Object.keys(value)
      .sort()
      .map((name) => `${JSON.stringify(name)}:${canonicalText(value[name], join(path, name))}`);
    return `{${members.join(',')}}`;
  }
  throw new TypeError(
    `canonical JSON at ${path || '<root>'} is not a string, safe integer, array or object`,
  );
}

/**
 * Canonical journal bytes: object keys sorted by UTF-16 code unit at every level, no whitespace,
 * UTF-8, one trailing `\n`.
 *
 * @throws TypeError for anything but plain objects, arrays, strings and safe integers.
 */
export function encodeCanonical(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${canonicalText(value, '')}\n`);
}

/** SHA-256 hex of the canonical encoding; callers validate first (see {@link sealEvent}). */
export function hashEvent(unsealed: UnsealedJournalEvent): string {
  return createHash('sha256').update(encodeCanonical(unsealed)).digest('hex');
}

function keyOfEvent(value: unknown): string {
  const sequence = isPlainObject(value) ? value['sequence'] : undefined;
  return typeof sequence === 'number' &&
    Number.isSafeInteger(sequence) &&
    sequence >= 1 &&
    sequence <= maximumSequence
    ? eventKey(sequence)
    : 'events/<invalid sequence>';
}

/** Runs the shared validator, reporting its refusal as `malformed` for `key`. */
function validated<Checked>(key: string, check: () => Checked): Checked {
  try {
    return check();
  } catch (error) {
    if (error instanceof FieldError)
      throw new JournalRecordError('malformed', key, error.message, { cause: error });
    throw error;
  }
}

/**
 * Validates and hashes an event.
 *
 * @throws JournalRecordError (`malformed`) for any value {@link parseEvent} would refuse.
 */
export function sealEvent(unsealed: UnsealedJournalEvent): JournalEvent {
  const checked = validated(keyOfEvent(unsealed), () => checkUnsealedEvent(unsealed, false));
  return { ...checked, hash: hashEvent(checked) };
}

/** @throws JournalRecordError (`malformed`) for any event {@link parseEvent} would refuse, including a stale `hash`. */
export function encodeEvent(event: JournalEvent): Uint8Array {
  return encodeCanonical(validated(keyOfEvent(event), () => checkEvent(event)));
}

/** @throws JournalRecordError (`malformed`) for any head {@link parseHead} would refuse. */
export function encodeHead(head: JournalHead): Uint8Array {
  return encodeCanonical(validated(headKey, () => checkHead(head)));
}

/** @throws JournalRecordError (`malformed`) for any genesis {@link parseGenesis} would refuse. */
export function encodeGenesis(genesis: JournalGenesis): Uint8Array {
  return encodeCanonical(validated(genesisKey, () => checkGenesis(genesis)));
}

const newline = 0x0a;
/** Bun's `JSON.parse` messages for input that stops inside a value. */
const endOfInput = /Unexpected EOF|Unterminated/u;

/**
 * Decodes, validates and re-encodes one object; only byte-identical canonical records pass.
 *
 * @throws JournalRecordError `truncated` when the bytes lack the final `\n` or JSON stops early,
 *   otherwise `malformed`.
 */
function parseRecord<Checked>(
  bytes: Uint8Array,
  key: string,
  check: (value: unknown) => Checked,
): Checked {
  // Proof: removing the trailing-newline check reported the newline-less event as malformed in `truncated and malformed bytes are told apart`.
  if (bytes.length === 0 || bytes[bytes.length - 1] !== newline)
    throw new JournalRecordError('truncated', key, 'does not end with a newline');
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new JournalRecordError('malformed', key, 'is not UTF-8', { cause: error });
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    // Proof: always answering malformed here failed the newline-terminated cut in `truncated and malformed bytes are told apart`.
    if (error instanceof SyntaxError && endOfInput.test(error.message))
      throw new JournalRecordError('truncated', key, 'ends inside a JSON value', { cause: error });
    throw new JournalRecordError('malformed', key, 'is not JSON', { cause: error });
  }
  const record = validated(key, () => check(value));
  const canonical = encodeCanonical(record);
  // Proof: removing this comparison accepted the spaced body in `a non-canonical body is refused even when its JSON is valid`.
  if (canonical.length !== bytes.length || canonical.some((byte, index) => byte !== bytes[index]))
    throw new JournalRecordError('malformed', key, 'is not canonical JSON');
  return record;
}

/** @throws JournalRecordError; see {@link parseRecord}. A `hash` not matching the body is `malformed`. */
export function parseEvent(bytes: Uint8Array, key: string): JournalEvent {
  return parseRecord(bytes, key, checkEvent);
}

/** @throws JournalRecordError; see {@link parseRecord}. */
export function parseHead(bytes: Uint8Array, key: string): JournalHead {
  return parseRecord(bytes, key, checkHead);
}

/** @throws JournalRecordError; see {@link parseRecord}. */
export function parseGenesis(bytes: Uint8Array, key: string): JournalGenesis {
  return parseRecord(bytes, key, checkGenesis);
}
