import {
  eventKey,
  genesisKey,
  headKey,
  type JournalEvent,
  type JournalGenesis,
  type JournalHead,
  JournalRecordError,
  parseEvent,
  parseGenesis,
  parseHead,
} from './record';
import { JournalRemoteError, type RetentionJournalRemote } from './remote';

/** Why a reader refused the remote journal; design §6 rows 1–9. */
export type JournalRefusal =
  | 'uninitialised'
  | 'missing'
  | 'unreadable'
  | 'malformed'
  | 'truncated'
  | 'gapped'
  | 'stale'
  | 'forked'
  | 'foreign';

/** The remote journal cannot be trusted as it stands; the message names the key or both sequences. */
export class RetentionJournalError extends Error {
  override readonly name = 'RetentionJournalError';

  constructor(
    readonly reason: JournalRefusal,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** What the local database last applied and the highest head sequence it has ever observed. */
export interface JournalPosition {
  journalId: string;
  appliedSequence: number;
  appliedHash: string;
  headSequenceSeen: number;
}

export interface JournalTip {
  genesis: JournalGenesis;
  head: JournalHead;
  headVersionId: string;
}

/**
 * Reads and parses one object, translating port and record failures into refusals.
 *
 * @returns `null` for a definite absence.
 */
async function readRecord<Checked>(
  remote: RetentionJournalRemote,
  key: string,
  parse: (bytes: Uint8Array, key: string) => Checked,
): Promise<{ record: Checked; versionId: string } | null> {
  let stored;
  try {
    stored = await remote.get(key);
  } catch (error) {
    // Proof: rethrowing the port error unchanged made `an unreadable remote is refused naming the key` fail on the error class.
    if (error instanceof JournalRemoteError)
      throw new RetentionJournalError(
        'unreadable',
        `retention journal ${key} is unreadable: ${error.message}`,
        { cause: error },
      );
    throw error;
  }
  if (stored === null) return null;
  try {
    return { record: parse(stored.bytes, key), versionId: stored.versionId };
  } catch (error) {
    // Proof: rethrowing the record error unchanged made `a truncated event is refused` fail on the error class.
    if (error instanceof JournalRecordError)
      throw new RetentionJournalError(error.reason, error.message, { cause: error });
    throw error;
  }
}

/**
 * Reads genesis and the current head of journal `journalId`.
 *
 * @throws RetentionJournalError `uninitialised` without genesis, `missing` without a head,
 *   `foreign` when either names another journal, or the read or parse refusal.
 */
export async function readJournalTip(
  remote: RetentionJournalRemote,
  journalId: string,
): Promise<JournalTip> {
  const genesis = await readRecord(remote, genesisKey, parseGenesis);
  // Proof: removing this branch made `an uninitialised journal is refused naming journal-init` fail with a TypeError.
  if (genesis === null)
    throw new RetentionJournalError(
      'uninitialised',
      `retention journal ${genesisKey} is absent; run journal-init first`,
    );
  // Proof: removing this comparison made `a foreign journal is refused` blame head.json instead of genesis.json.
  if (genesis.record.journalId !== journalId)
    throw new RetentionJournalError(
      'foreign',
      `retention journal ${genesisKey} names another journal than ${journalId}`,
    );
  const head = await readRecord(remote, headKey, parseHead);
  // Proof: removing this branch made `a missing head is refused` fail with a TypeError.
  if (head === null)
    throw new RetentionJournalError('missing', `retention journal ${headKey} is missing`);
  // Proof: removing this comparison made `a foreign journal is refused` resolve for the foreign head.
  if (head.record.journalId !== journalId)
    throw new RetentionJournalError(
      'foreign',
      `retention journal ${headKey} names another journal than ${journalId}`,
    );
  return { genesis: genesis.record, head: head.record, headVersionId: head.versionId };
}

/**
 * Proves `head` is a consistent extension of `position` by walking every event after the
 * applied sequence.
 *
 * @returns the events after `position.appliedSequence` in order; empty when in sync.
 * @throws RetentionJournalError `foreign`, `stale` (naming both sequences), `forked`, `gapped`
 *   or the read or parse refusal of an event.
 */
export async function verifyChain(
  position: JournalPosition,
  head: JournalHead,
  remote: RetentionJournalRemote,
): Promise<JournalEvent[]> {
  // Proof: removing this comparison made `a foreign journal is refused` blame events/000000000001.json instead of head.json.
  if (head.journalId !== position.journalId)
    throw new RetentionJournalError(
      'foreign',
      `retention journal ${headKey} names another journal than ${position.journalId}`,
    );
  // Proof: removing the applied comparison made `a rolled-back head is refused as stale naming both sequences` name the seen sequence instead.
  if (head.sequence < position.appliedSequence)
    throw new RetentionJournalError(
      'stale',
      `retention journal head sequence ${String(head.sequence)} is behind applied sequence ${String(position.appliedSequence)}`,
    );
  // Proof: removing the seen comparison made `a rolled-back head is refused as stale naming both sequences` fail on the seen case.
  if (head.sequence < position.headSequenceSeen)
    throw new RetentionJournalError(
      'stale',
      `retention journal head sequence ${String(head.sequence)} is behind seen sequence ${String(position.headSequenceSeen)}`,
    );
  // Proof: removing this comparison made `a forked journal is refused` lose the database-disagreement message (the closing check still refuses).
  if (head.sequence === position.appliedSequence && head.hash !== position.appliedHash)
    throw new RetentionJournalError(
      'forked',
      `retention journal head and database disagree at sequence ${String(head.sequence)}`,
    );
  const events: JournalEvent[] = [];
  let runningHash = position.appliedHash;
  for (let sequence = position.appliedSequence + 1; sequence <= head.sequence; sequence += 1) {
    const key = eventKey(sequence);
    const stored = await readRecord(remote, key, parseEvent);
    // Proof: removing this branch made `a gapped chain is refused` fail with a TypeError.
    if (stored === null)
      throw new RetentionJournalError(
        'gapped',
        `retention journal ${key} is absent below the head`,
      );
    const event = stored.record;
    // Proof: removing this comparison made `a foreign journal is refused` report `forked` for the stranger event.
    if (event.journalId !== position.journalId)
      throw new RetentionJournalError('foreign', `retention journal ${key} names another journal`);
    // Proof: removing this comparison made `a malformed event is refused` report `forked` for the misplaced event.
    if (event.sequence !== sequence)
      throw new RetentionJournalError(
        'malformed',
        `retention journal ${key} carries sequence ${String(event.sequence)}`,
      );
    // Proof: removing this comparison made `a forked journal is refused` resolve for the rewritten event 2.
    if (event.previousHash !== runningHash)
      throw new RetentionJournalError(
        'forked',
        `retention journal ${key} does not chain to the previous hash`,
      );
    runningHash = event.hash;
    events.push(event);
  }
  // Proof: removing this comparison made `a forked journal is refused` resolve for the unclosed head.
  if (runningHash !== head.hash)
    throw new RetentionJournalError(
      'forked',
      `retention journal ${headKey} hash does not close the chain at sequence ${String(head.sequence)}`,
    );
  return events;
}
