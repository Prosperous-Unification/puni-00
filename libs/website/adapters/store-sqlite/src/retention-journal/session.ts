import type { Database } from 'bun:sqlite';

import {
  compactAfterErasure,
  eraseSubjectContent,
  prepareErasureConnection,
  type RetentionSubjectRef,
} from '../request-erasure';
import { addUtcMonths, retentionMonths } from '../request-retention';
import {
  type JournalPosition,
  type JournalTip,
  readJournalTip,
  RetentionJournalError,
  verifyChain,
} from './chain';
import { withPolicyLock } from './policy-lock';
import {
  encodeEvent,
  encodeGenesis,
  encodeHead,
  eventKey,
  genesisKey,
  headKey,
  type JournalEvent,
  type JournalEventBody,
  type JournalHead,
  journalSchema,
  type JournalWriter,
  parseEvent,
  sealEvent,
  zeroHash,
} from './record';
import { JournalRemoteError, type RetentionJournalRemote } from './remote';

/** The requested policy change does not follow from the subject's current state (HTTP 409). */
export class RetentionTransitionError extends Error {
  override readonly name = 'RetentionTransitionError';

  constructor(
    readonly reason: 'missing_subject' | 'transition_invalid',
    message: string,
  ) {
    super(message);
  }
}

export interface RetentionJournalOptions {
  journalId: string;
  writer: JournalWriter;
  now: () => number;
  /** Overrides the 30 s policy-lock wait; tests shorten it. */
  lockTimeoutMilliseconds?: number;
  /**
   * Never writes the remote: an orphan event refuses instead of being settled, and `append`
   * refuses. `journal-replay` uses it for scratch copies in drills and backup verification.
   */
  readOnly?: boolean;
}

/** Local and remote journal position, without content. */
export interface RetentionJournalStatus {
  journalId: string;
  state: 'detached' | 'attached' | 'forked';
  appliedSequence: number;
  appliedHash: string;
  headSequence: number;
}

interface PositionRow {
  journal_id: string | null;
  applied_sequence: number;
  applied_hash: string;
  head_version_id: string | null;
  head_sequence_seen: number;
  state: 'detached' | 'attached' | 'forked';
}

interface SubjectRow {
  classification: 'non_client' | 'client' | 'hold';
  resolution: 'pending_content' | 'anchored' | 'ambiguous';
  erasure_state: 'none' | 'fenced' | 'erased';
}

function readPosition(database: Database): PositionRow {
  const row = database
    .query<PositionRow, []>(
      'SELECT journal_id, applied_sequence, applied_hash, head_version_id, head_sequence_seen, state FROM retention_journal_position WHERE singleton = 1',
    )
    .get();
  if (!row) throw new Error('retention_journal_position has no singleton row');
  return row;
}

function boundPosition(database: Database, journalId: string): JournalPosition {
  const row = readPosition(database);
  if (row.state === 'forked')
    throw new RetentionJournalError(
      'forked',
      'retention journal is marked forked in this database; resolve it with journal-status before any policy change',
    );
  if (row.state === 'detached' || row.journal_id === null)
    throw new RetentionJournalError(
      'detached',
      'this database is not attached to a retention journal; run journal-attach',
    );
  // Proof: removing this comparison made `startup refuses a foreign journal` open a database bound to another journal.
  if (row.journal_id !== journalId)
    throw new RetentionJournalError(
      'foreign',
      `this database belongs to retention journal ${row.journal_id}, not ${journalId}`,
    );
  return {
    journalId,
    appliedSequence: row.applied_sequence,
    appliedHash: row.applied_hash,
    headSequenceSeen: row.head_sequence_seen,
  };
}

function markForked(database: Database): void {
  database.run("UPDATE retention_journal_position SET state = 'forked' WHERE singleton = 1");
}

function subjectRow(database: Database, subject: { kind: string; id: string }): SubjectRow | null {
  return database
    .query<SubjectRow, [string, string]>(
      'SELECT classification, resolution, erasure_state FROM retention_subject WHERE subject_kind = ? AND subject_id = ?',
    )
    .get(subject.kind, subject.id);
}

/**
 * Applies one confirmed event to the primary database (design D§4 step 5) in its own immediate
 * transaction, with its mirror row and the new position. An erasure for a subject absent from
 * this database is a tombstone; any other event naming an absent subject makes the database
 * ineligible to serve.
 *
 * @throws RetentionJournalError `ineligible`; ErasureRefusedError for shared draft lineage.
 */
function applyEvent(
  database: Database,
  event: JournalEvent,
  headVersionId: string,
  now: number,
): void {
  database
    .transaction(() => {
      const subject = event.subject;
      const body = event.event;
      if (body.type === 'erase') {
        prepareErasureConnection(database);
        eraseSubjectContent(database, subject, event.sequence, event.recordedAt);
      } else {
        // Proof: skipping this refusal made `restore refuses a snapshot missing a designated subject` serve the snapshot.
        if (!subjectRow(database, subject))
          throw new RetentionJournalError(
            'ineligible',
            `retention journal ${eventKey(event.sequence)} names ${subject.kind} ${subject.id}, which this database lacks`,
          );
        if (body.type === 'resolve_anchor') applyResolution(database, event, body);
        else
          database
            .query(
              'UPDATE retention_subject SET classification = ?, classification_evidence = ?, classification_actor = ?, classification_at = ?, classification_sequence = ? WHERE subject_kind = ? AND subject_id = ?',
            )
            .run(
              body.type === 'designate_client'
                ? 'client'
                : body.type === 'place_hold'
                  ? 'hold'
                  : 'non_client',
              body.evidenceReference,
              body.actor,
              event.recordedAt,
              event.sequence,
              subject.kind,
              subject.id,
            );
      }
      database
        .query(
          'INSERT INTO retention_journal_applied (sequence, hash, event_type, subject_kind, subject_id, applied_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(event.sequence, event.hash, body.type, subject.kind, subject.id, now);
      const moved = database
        .query(
          'UPDATE retention_journal_position SET applied_sequence = ?1, applied_hash = ?2, head_version_id = ?3, head_sequence_seen = max(head_sequence_seen, ?1) WHERE singleton = 1 AND applied_sequence = ?1 - 1',
        )
        .run(event.sequence, event.hash, headVersionId);
      if (moved.changes !== 1)
        throw new Error(`retention journal event ${String(event.sequence)} is not the next one`);
    })
    .immediate();
}

function applyResolution(
  database: Database,
  event: JournalEvent,
  body: Extract<JournalEventBody, { type: 'resolve_anchor' }>,
): void {
  const resolved = database
    .query(
      "UPDATE retention_subject SET resolution = 'anchored', ambiguity = NULL, anchor_at = ?, deadline_at = ?, anchor_source = 'operator', evidence_reference = ?, resolved_by = ?, resolved_at = ? WHERE subject_kind = ? AND subject_id = ? AND resolution = 'ambiguous'",
    )
    .run(
      body.anchorAt,
      addUtcMonths(body.anchorAt, retentionMonths),
      body.evidenceReference,
      body.actor,
      event.recordedAt,
      event.subject.kind,
      event.subject.id,
    );
  if (resolved.changes === 1) return;
  const anchor = database
    .query<{ anchor_at: number | null }, [string, string]>(
      'SELECT anchor_at FROM retention_subject WHERE subject_kind = ? AND subject_id = ?',
    )
    .get(event.subject.kind, event.subject.id);
  if (anchor?.anchor_at !== body.anchorAt)
    throw new RetentionJournalError(
      'ineligible',
      `retention journal ${eventKey(event.sequence)} resolves an anchor this database holds differently`,
    );
}

/** The state each event requires before it may be appended (design D§7). */
function requireTransition(
  database: Database,
  subject: RetentionSubjectRef,
  body: JournalEventBody,
) {
  const row = subjectRow(database, subject);
  if (!row)
    throw new RetentionTransitionError(
      'missing_subject',
      `no retention subject ${subject.kind} ${subject.id}`,
    );
  const allowed =
    body.type === 'designate_client'
      ? row.classification === 'non_client' && row.erasure_state === 'none'
      : body.type === 'correct_classification'
        ? row.classification === 'client'
        : body.type === 'place_hold'
          ? row.classification === 'non_client' && row.erasure_state === 'none'
          : body.type === 'release_hold'
            ? row.classification === 'hold'
            : body.type === 'resolve_anchor'
              ? row.resolution === 'ambiguous'
              : row.classification === 'non_client' && row.erasure_state === 'fenced';
  // Proof: forcing this to true let `an erase of a newly designated client is refused after replay` append the erasure.
  if (!allowed)
    throw new RetentionTransitionError(
      'transition_invalid',
      `${body.type} does not apply to ${subject.kind} ${subject.id} (${row.classification}, ${row.resolution}, ${row.erasure_state})`,
    );
}

async function confirmedPut(
  remote: RetentionJournalRemote,
  key: string,
  bytes: Uint8Array,
  ifNoneMatch: boolean,
): Promise<string> {
  let versionId: string;
  let readBack;
  try {
    versionId = await remote.put(key, bytes, { ifNoneMatch });
    readBack = await remote.get(key);
  } catch (error) {
    if (error instanceof JournalRemoteError)
      throw new RetentionJournalError(
        'unavailable',
        `retention journal write of ${key} did not complete: ${error.message}`,
        { cause: error },
      );
    throw error;
  }
  // Proof: skipping this comparison made `append detects an overwritten event` resolve the append instead of refusing `forked`.
  if (
    readBack?.versionId !== versionId ||
    Buffer.compare(Buffer.from(readBack.bytes), Buffer.from(bytes)) !== 0
  )
    throw new RetentionJournalError(
      'forked',
      `retention journal ${key} read back differently after its write; another writer raced this one`,
    );
  return versionId;
}

function headFor(event: JournalEvent, eventVersionId: string, writer: JournalWriter, now: number) {
  const head: JournalHead = {
    schema: journalSchema,
    journalId: event.journalId,
    sequence: event.sequence,
    hash: event.hash,
    eventKey: eventKey(event.sequence),
    eventVersionId,
    writtenAt: now,
    writer,
  };
  return head;
}

/**
 * A database bound to one remote retention journal. Every method that reads the remote runs
 * under the policy lock; see {@link openRetentionJournal}.
 */
export class RetentionJournalSession {
  constructor(
    private readonly database: Database,
    private readonly remote: RetentionJournalRemote,
    private readonly options: RetentionJournalOptions,
  ) {}

  private locked<T>(work: () => Promise<T>): Promise<T> {
    return withPolicyLock(this.database.filename, work, this.options.lockTimeoutMilliseconds);
  }

  /**
   * Adopts an event a crashed writer stored without moving the head (design D§4 step 2): a valid
   * continuation of the head gets its head written and is returned for replay; anything else
   * marks the database forked.
   */
  private async settleOrphan(tip: JournalTip): Promise<JournalTip> {
    if (tip.head.sequence >= 999_999_999_999) return tip;
    const key = eventKey(tip.head.sequence + 1);
    let stored;
    try {
      stored = await this.remote.get(key);
    } catch (error) {
      if (error instanceof JournalRemoteError)
        throw new RetentionJournalError('unreadable', `retention journal ${key} is unreadable`, {
          cause: error,
        });
      throw error;
    }
    // Proof: returning here unconditionally made `an orphan event is settled before new appends` see no `behind` refusal for the next append.
    if (stored === null) return tip;
    // Proof: settling here made `journal-replay never writes the remote` add a head version.
    if (this.options.readOnly === true)
      throw new RetentionJournalError(
        'behind',
        `retention journal orphan ${key} awaits a writer; a read-only replay cannot settle it`,
      );
    let orphan: JournalEvent;
    try {
      orphan = parseEvent(stored.bytes, key);
    } catch (error) {
      markForked(this.database);
      throw new RetentionJournalError('forked', `retention journal orphan ${key} is unreadable`, {
        cause: error,
      });
    }
    if (orphan.journalId !== this.options.journalId || orphan.previousHash !== tip.head.hash) {
      markForked(this.database);
      throw new RetentionJournalError(
        'forked',
        `retention journal orphan ${key} does not continue the head`,
      );
    }
    const head = headFor(orphan, stored.versionId, this.options.writer, this.options.now());
    const headVersionId = await confirmedPut(this.remote, headKey, encodeHead(head), false);
    return { genesis: tip.genesis, head, headVersionId };
  }

  /** Reads the tip, settles an orphan and verifies the chain from the applied position. */
  private async verifiedTail(): Promise<{ tip: JournalTip; events: JournalEvent[] }> {
    const position = boundPosition(this.database, this.options.journalId);
    const read = await readJournalTip(this.remote, this.options.journalId);
    const seen = Math.max(position.appliedSequence, position.headSequenceSeen);
    // A head behind what this database has seen is stale even when later events survive: never
    // re-adopt them as orphans. Proof: settling first made `startup refuses a rolled-back head` re-adopt event 2 and pass.
    if (read.head.sequence < seen)
      throw new RetentionJournalError(
        'stale',
        `retention journal head sequence ${String(read.head.sequence)} is behind applied or seen sequence ${String(seen)}`,
      );
    const tip = await this.settleOrphan(read);
    try {
      return { tip, events: await verifyChain(position, tip.head, this.remote) };
    } catch (error) {
      if (error instanceof RetentionJournalError && error.reason === 'forked')
        markForked(this.database);
      throw error;
    }
  }

  private replay(events: JournalEvent[], headVersionId: string): void {
    for (const event of events) applyEvent(this.database, event, headVersionId, this.options.now());
    if (events.some((event) => event.event.type === 'erase')) compactAfterErasure(this.database);
  }

  /**
   * Verifies the remote chain from this database's applied position and replays every later
   * event in order (startup, restore, and before each policy change).
   *
   * @throws RetentionJournalError for any refusal in design §6; the database keeps every event
   *   applied before the failing one.
   */
  async synchronise(): Promise<RetentionJournalStatus> {
    return this.locked(async () => {
      const { tip, events } = await this.verifiedTail();
      this.replay(events, tip.headVersionId);
      this.database
        .query(
          'UPDATE retention_journal_position SET head_version_id = ?, head_sequence_seen = max(head_sequence_seen, ?) WHERE singleton = 1',
        )
        .run(tip.headVersionId, tip.head.sequence);
      return this.statusAt(tip.head.sequence);
    });
  }

  /**
   * Appends one policy event and applies it (design D§4 steps 1–6): the event and the head are
   * each written, read back and compared before the primary transaction commits, so a success
   * means the remote record is durable. A remote that is ahead of this database refuses with
   * `behind` until {@link synchronise} replays it. After `erase` events the caller runs
   * `compactAfterErasure` once its run is complete.
   *
   * @throws RetentionTransitionError when the subject's state does not allow `body`;
   *   RetentionJournalError for every remote refusal, with no database change.
   */
  async append(subject: RetentionSubjectRef, body: JournalEventBody): Promise<JournalEvent> {
    if (this.options.readOnly === true)
      throw new RetentionJournalError('unavailable', 'a read-only journal session cannot append');
    return this.locked(async () => {
      const { tip, events } = await this.verifiedTail();
      const position = boundPosition(this.database, this.options.journalId);
      // Proof: removing this refusal made `another process refuses cleanup until it replays` accept the erase before replaying.
      if (events.length > 0 || tip.head.sequence !== position.appliedSequence)
        throw new RetentionJournalError(
          'behind',
          `retention journal head ${String(tip.head.sequence)} is ahead of applied sequence ${String(position.appliedSequence)}; replay first`,
        );
      requireTransition(this.database, subject, body);
      const now = this.options.now();
      const event = sealEvent({
        schema: journalSchema,
        journalId: this.options.journalId,
        sequence: position.appliedSequence + 1,
        previousHash: position.appliedHash,
        recordedAt: now,
        subject: { kind: subject.kind, id: subject.id },
        event: body,
        writer: this.options.writer,
      });
      const key = eventKey(event.sequence);
      let eventVersionId: string;
      let headVersionId: string;
      try {
        eventVersionId = await confirmedPut(this.remote, key, encodeEvent(event), true);
        headVersionId = await confirmedPut(
          this.remote,
          headKey,
          encodeHead(headFor(event, eventVersionId, this.options.writer, now)),
          false,
        );
      } catch (error) {
        if (error instanceof RetentionJournalError && error.reason === 'forked')
          markForked(this.database);
        throw error;
      }
      applyEvent(this.database, event, headVersionId, now);
      return event;
    });
  }

  /** The local position and the remote head sequence; reads the remote under the policy lock. */
  async status(): Promise<RetentionJournalStatus> {
    return this.locked(async () => {
      const tip = await readJournalTip(this.remote, this.options.journalId);
      return this.statusAt(tip.head.sequence);
    });
  }

  private statusAt(headSequence: number): RetentionJournalStatus {
    const row = readPosition(this.database);
    return {
      journalId: this.options.journalId,
      state: row.state,
      appliedSequence: row.applied_sequence,
      appliedHash: row.applied_hash,
      headSequence,
    };
  }
}

/**
 * Binds `database` to journal `options.journalId` and synchronises it (design D§4 startup):
 * the API calls this before serving and every mutating CLI command before acting.
 *
 * @throws RetentionJournalError when the database is detached, forked or foreign, or the remote
 *   is uninitialised, missing, unreadable, malformed, truncated, gapped, stale or forked.
 */
export async function openRetentionJournal(
  database: Database,
  remote: RetentionJournalRemote,
  options: RetentionJournalOptions,
): Promise<RetentionJournalSession> {
  const session = new RetentionJournalSession(database, remote, options);
  await session.synchronise();
  return session;
}

/**
 * Writes genesis and head 0 of a new journal (`journal-init`). Refuses when either already
 * exists, so a journal is never re-created over its history.
 *
 * @throws RetentionJournalError `unavailable` on a remote failure or an existing journal.
 */
export async function initJournal(
  remote: RetentionJournalRemote,
  init: { journalId: string; environment: string; writer: JournalWriter; now: number },
): Promise<void> {
  for (const key of [genesisKey, headKey]) {
    let existing;
    try {
      existing = await remote.get(key);
    } catch (error) {
      if (error instanceof JournalRemoteError)
        throw new RetentionJournalError('unavailable', `retention journal ${key} is unreadable`, {
          cause: error,
        });
      throw error;
    }
    // Proof: skipping this refusal made `journal-init refuses an existing genesis` overwrite the journal.
    if (existing !== null)
      throw new RetentionJournalError(
        'unavailable',
        `retention journal ${key} already exists; journal-init never re-creates a journal`,
      );
  }
  await confirmedPut(
    remote,
    genesisKey,
    encodeGenesis({
      schema: journalSchema,
      journalId: init.journalId,
      environment: init.environment,
      createdAt: init.now,
      createdBy: { release: init.writer.release, privateRevision: init.writer.privateRevision },
    }),
    true,
  );
  await confirmedPut(
    remote,
    headKey,
    encodeHead({
      schema: journalSchema,
      journalId: init.journalId,
      sequence: 0,
      hash: zeroHash,
      writtenAt: init.now,
      writer: init.writer,
    }),
    true,
  );
}

/**
 * Binds a detached database (a fresh one, or a pre-journal snapshot) to `journalId` so the next
 * open replays the whole journal from sequence 0 (`journal-attach`, veto V16).
 *
 * @throws Error unless the database is detached at applied sequence 0.
 */
export function attachJournal(database: Database, journalId: string): void {
  database
    .transaction(() => {
      const row = readPosition(database);
      // Proof: dropping the applied_sequence condition made `journal-attach refuses applied_sequence > 0` attach the database.
      if (row.state !== 'detached' || row.applied_sequence !== 0)
        throw new Error(
          `journal-attach requires a detached database at applied sequence 0 (state ${row.state}, applied ${String(row.applied_sequence)})`,
        );
      database
        .query(
          "UPDATE retention_journal_position SET journal_id = ?, state = 'attached' WHERE singleton = 1",
        )
        .run(journalId);
    })
    .immediate();
}
