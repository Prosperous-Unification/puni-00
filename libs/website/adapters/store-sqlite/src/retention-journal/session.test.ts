import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';

import { fenceSubject } from '../request-erasure';
import { WebsiteStore } from '../store';
import { RetentionJournalError } from './chain';
import { MemoryJournalRemote } from './memory-remote';
import { policyLockTimeoutMilliseconds, RetentionPolicyBusyError } from './policy-lock';
import {
  encodeEvent,
  encodeHead,
  eventKey,
  headKey,
  parseEvent,
  parseHead,
  sealEvent,
} from './record';
import {
  attachJournal,
  initJournal,
  openRetentionJournal,
  type RetentionJournalOptions,
  RetentionJournalSession,
  RetentionTransitionError,
} from './session';

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

const journalId = '7d4f2a8e-5b1c-4e3d-9a6f-0c2b8e1d4a7f';
const writer = { release: 'release-test', privateRevision: 'abc1234', process: 'cli' as const };
const evidence = { evidenceReference: 'ops-ticket:42', actor: 'operator' };
const designate = { type: 'designate_client' as const, ...evidence };
const hold = { type: 'place_hold' as const, ...evidence };
const erase = { type: 'erase' as const, reason: 'due_non_client' as const, deadlineAt: 1000 };
const subject = (id: string) => ({ kind: 'software_request' as const, id });

function options(overrides: Partial<RetentionJournalOptions> = {}): RetentionJournalOptions {
  let clock = 10_000;
  return {
    journalId,
    writer,
    now: () => (clock += 1),
    lockTimeoutMilliseconds: 2000,
    ...overrides,
  };
}

function open(databasePath: string): Database {
  const database = new Database(databasePath);
  database.run('PRAGMA foreign_keys = ON');
  database.run('PRAGMA busy_timeout = 5000');
  return database;
}

/** A migrated, attached database with requests `req-1`..`req-3` (content, due) and an initialised journal. */
async function fixture(): Promise<{
  databasePath: string;
  directory: string;
  remote: MemoryJournalRemote;
}> {
  const directory = mkdtempSync(join(tmpdir(), 'puni-retention-session-'));
  directories.push(directory);
  const databasePath = join(directory, 'website.sqlite');
  new WebsiteStore(databasePath).close();
  const database = open(databasePath);
  database.run(`
    INSERT INTO prospect_account (id, email, created_at) VALUES
      ('acct-1', 'one@example.test', 1), ('acct-2', 'two@example.test', 1), ('acct-3', 'three@example.test', 1);
    INSERT INTO software_request (id, account_id, description, brief, created_at, submitted_at) VALUES
      ('req-1', 'acct-1', 'first text', '', 1, 2), ('req-2', 'acct-2', 'second text', '', 1, 2),
      ('req-3', 'acct-3', 'third text', '', 1, 2);
    INSERT INTO retention_subject (subject_kind, subject_id, resolution, anchor_at, deadline_at, anchor_source) VALUES
      ('software_request', 'req-1', 'anchored', 1, 1000, 'first_write'),
      ('software_request', 'req-2', 'anchored', 1, 1000, 'first_write'),
      ('software_request', 'req-3', 'anchored', 1, 1000, 'first_write');
  `);
  attachJournal(database, journalId);
  database.close();
  const remote = new MemoryJournalRemote();
  await initJournal(remote, { journalId, environment: 'website-test', writer, now: 5 });
  return { databasePath, directory, remote };
}

function position(database: Database) {
  return database
    .query<{ applied_sequence: number; state: string; mirrored: number }, []>(
      'SELECT applied_sequence, state, (SELECT count(*) FROM retention_journal_applied) AS mirrored FROM retention_journal_position',
    )
    .get();
}

function classifications(database: Database) {
  return database
    .query<{ subject_id: string; classification: string; erasure_state: string }, []>(
      'SELECT subject_id, classification, erasure_state FROM retention_subject ORDER BY subject_id',
    )
    .all();
}

function headSequence(remote: MemoryJournalRemote): number {
  const bytes = remote.current(headKey);
  if (!bytes) throw new Error('no head');
  return parseHead(bytes, headKey).sequence;
}

/** The error `promise` rejects with; a resolution fails the test. */
async function rejectionOf(promise: Promise<unknown>): Promise<() => never> {
  try {
    await promise;
  } catch (error) {
    return () => {
      throw error;
    };
  }
  throw new Error('expected a rejection');
}

async function refusal(promise: Promise<unknown>): Promise<RetentionJournalError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RetentionJournalError) return error;
    throw error;
  }
  throw new Error('expected a RetentionJournalError');
}

test('an append is confirmed remotely before it changes the database', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    const event = await session.append(subject('req-1'), designate);
    expect(event.sequence).toBe(1);
    expect(headSequence(remote)).toBe(1);
    expect(parseEvent(remote.current(eventKey(1)) ?? new Uint8Array(), eventKey(1)).hash).toBe(
      event.hash,
    );
    expect(position(database)).toEqual({ applied_sequence: 1, state: 'attached', mirrored: 1 });
    expect(classifications(database)[0]).toMatchObject({ classification: 'client' });
  } finally {
    database.close();
  }
});

test('remote failure before head leaves the database unchanged', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    remote.failPutOnce(eventKey(1));
    expect((await refusal(session.append(subject('req-1'), designate))).reason).toBe('unavailable');
    expect(position(database)).toEqual({ applied_sequence: 0, state: 'attached', mirrored: 0 });
    expect(classifications(database)[0]).toMatchObject({ classification: 'non_client' });
    expect(headSequence(remote)).toBe(0);
  } finally {
    database.close();
  }
});

test('append refuses an unversioned bucket', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    remote.dropVersionId(true);
    expect((await refusal(session.append(subject('req-1'), designate))).reason).toBe('unavailable');
    remote.dropVersionId(false);
    expect(headSequence(remote)).toBe(0);
    expect(position(database)).toEqual({ applied_sequence: 0, state: 'attached', mirrored: 0 });
  } finally {
    database.close();
  }
});

test('append detects an overwritten event', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    const rival = sealEvent({
      schema: 'puni-retention-journal/1',
      journalId,
      sequence: 1,
      previousHash: '0'.repeat(64),
      recordedAt: 3,
      subject: subject('req-2'),
      event: hold,
      writer,
    });
    remote.swapBytesAfterPut(eventKey(1), encodeEvent(rival));
    expect((await refusal(session.append(subject('req-1'), designate))).reason).toBe('forked');
    expect(position(database)).toEqual({ applied_sequence: 0, state: 'forked', mirrored: 0 });
    expect(headSequence(remote)).toBe(0);
  } finally {
    database.close();
  }
});

test('an orphan event is settled before new appends', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    remote.failPutOnce(headKey);
    expect((await refusal(session.append(subject('req-1'), designate))).reason).toBe('unavailable');
    expect({ head: headSequence(remote), orphan: remote.versionCount(eventKey(1)) }).toEqual({
      head: 0,
      orphan: 1,
    });
    expect((await refusal(session.append(subject('req-2'), hold))).reason).toBe('behind');
    expect(headSequence(remote)).toBe(1);
    await session.synchronise();
    await session.append(subject('req-2'), hold);
    expect(position(database)).toEqual({ applied_sequence: 2, state: 'attached', mirrored: 2 });
    expect(classifications(database).map(({ classification }) => classification)).toEqual([
      'client',
      'hold',
      'non_client',
    ]);
  } finally {
    database.close();
  }
});

/** Makes the next primary apply fail after the remote head was written, as a crashed commit would. */
function failNextApply(database: Database): void {
  database.run(
    "CREATE TRIGGER injected_apply_failure BEFORE INSERT ON retention_journal_applied BEGIN SELECT RAISE(ABORT, 'injected apply failure'); END",
  );
}

test('crash after durable append replays exactly once', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    failNextApply(database);
    expect(await rejectionOf(session.append(subject('req-1'), designate))).toThrow(
      'injected apply failure',
    );
    database.run('DROP TRIGGER injected_apply_failure');
    expect({ head: headSequence(remote), ...position(database) }).toEqual({
      head: 1,
      applied_sequence: 0,
      state: 'attached',
      mirrored: 0,
    });
    await openRetentionJournal(database, remote, options());
    await openRetentionJournal(database, remote, options());
    expect(position(database)).toEqual({ applied_sequence: 1, state: 'attached', mirrored: 1 });
    expect(classifications(database)[0]).toMatchObject({ classification: 'client' });
  } finally {
    database.close();
  }
});

test('another process refuses cleanup until it replays', async () => {
  const { databasePath, remote } = await fixture();
  const first = open(databasePath);
  const second = open(databasePath);
  try {
    const designating = await openRetentionJournal(first, remote, options());
    const cleaning = await openRetentionJournal(second, remote, options());
    failNextApply(first);
    expect(await rejectionOf(designating.append(subject('req-1'), designate))).toThrow(
      'injected apply failure',
    );
    first.run('DROP TRIGGER injected_apply_failure');
    fenceSubject(second, subject('req-1'));
    expect((await refusal(cleaning.append(subject('req-1'), erase))).reason).toBe('behind');
    await cleaning.synchronise();
    expect(await rejectionOf(cleaning.append(subject('req-1'), erase))).toThrow(
      RetentionTransitionError,
    );
    expect(classifications(second)[0]).toEqual({
      subject_id: 'req-1',
      classification: 'client',
      erasure_state: 'fenced',
    });
    expect(
      second.query("SELECT description FROM software_request WHERE id = 'req-1'").get(),
    ).toEqual({ description: 'first text' });
  } finally {
    first.close();
    second.close();
  }
});

test('an erase of a newly designated client is refused after replay', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    await session.append(subject('req-1'), designate);
    database.run(
      "UPDATE retention_subject SET erasure_state = 'fenced' WHERE subject_id = 'req-1'",
    );
    expect(await rejectionOf(session.append(subject('req-1'), erase))).toThrow(
      'erase does not apply',
    );
    expect(headSequence(remote)).toBe(1);
  } finally {
    database.close();
  }
});

test('an old snapshot replays designation, hold and erasure', async () => {
  const { databasePath, directory, remote } = await fixture();
  const snapshotPath = join(directory, 'snapshot.sqlite');
  const database = open(databasePath);
  try {
    database.run(`VACUUM INTO '${snapshotPath}'`);
    const session = await openRetentionJournal(database, remote, options());
    await session.append(subject('req-1'), designate);
    await session.append(subject('req-2'), hold);
    fenceSubject(database, subject('req-3'));
    await session.append(subject('req-3'), erase);
  } finally {
    database.close();
  }
  const restored = open(snapshotPath);
  try {
    expect(position(restored)).toEqual({ applied_sequence: 0, state: 'attached', mirrored: 0 });
    await openRetentionJournal(restored, remote, options());
    expect(position(restored)).toEqual({ applied_sequence: 3, state: 'attached', mirrored: 3 });
    expect(classifications(restored)).toEqual([
      { subject_id: 'req-1', classification: 'client', erasure_state: 'none' },
      { subject_id: 'req-2', classification: 'hold', erasure_state: 'none' },
      { subject_id: 'req-3', classification: 'non_client', erasure_state: 'erased' },
    ]);
    expect(
      restored.query('SELECT id, description FROM software_request ORDER BY id').all(),
    ).toEqual([
      { id: 'req-1', description: 'first text' },
      { id: 'req-2', description: 'second text' },
      { id: 'req-3', description: '' },
    ]);
  } finally {
    restored.close();
  }
});

test('restore refuses a snapshot missing a designated subject', async () => {
  const { databasePath, directory, remote } = await fixture();
  const snapshotPath = join(directory, 'snapshot.sqlite');
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    await session.append(subject('req-1'), designate);
  } finally {
    database.close();
  }
  copyFileSync(databasePath, snapshotPath);
  const restored = open(snapshotPath);
  try {
    restored.run(
      "UPDATE retention_journal_position SET applied_sequence = 0, applied_hash = '" +
        '0'.repeat(64) +
        "', head_sequence_seen = 0",
    );
    restored.run("DELETE FROM retention_subject WHERE subject_id = 'req-1'");
    const error = await refusal(openRetentionJournal(restored, remote, options()));
    expect({ reason: error.reason, message: error.message }).toEqual({
      reason: 'ineligible',
      message: expect.stringContaining('software_request req-1') as string,
    });
    expect(position(restored)?.applied_sequence).toBe(0);
  } finally {
    restored.close();
  }
});

test('startup refuses a rolled-back head', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    await session.append(subject('req-1'), designate);
    const firstHead = remote.current(headKey);
    await session.append(subject('req-2'), hold);
    if (!firstHead) throw new Error('no head');
    remote.overwrite(headKey, firstHead);
    const error = await refusal(openRetentionJournal(database, remote, options()));
    expect({ reason: error.reason, message: error.message }).toEqual({
      reason: 'stale',
      message: expect.stringMatching(/sequence 1 .* sequence 2/u) as string,
    });
  } finally {
    database.close();
  }
});

test('startup marks a forked journal', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    await session.append(subject('req-1'), designate);
    const rival = sealEvent({
      schema: 'puni-retention-journal/1',
      journalId,
      sequence: 1,
      previousHash: '0'.repeat(64),
      recordedAt: 3,
      subject: subject('req-2'),
      event: hold,
      writer,
    });
    remote.overwrite(eventKey(1), encodeEvent(rival));
    const head = parseHead(remote.current(headKey) ?? new Uint8Array(), headKey);
    remote.overwrite(headKey, encodeHead({ ...head, hash: rival.hash }));
    expect((await refusal(openRetentionJournal(database, remote, options()))).reason).toBe(
      'forked',
    );
    expect(position(database)?.state).toBe('forked');
    expect((await refusal(openRetentionJournal(database, remote, options()))).message).toContain(
      'marked forked',
    );
  } finally {
    database.close();
  }
});

test('startup refuses a foreign journal', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    database.run(
      "UPDATE retention_journal_position SET journal_id = '0e9b3c1d-2f4a-4b5c-8d6e-7f8091a2b3c4'",
    );
    const error = await refusal(openRetentionJournal(database, remote, options()));
    expect({ reason: error.reason, message: error.message }).toEqual({
      reason: 'foreign',
      message: expect.stringContaining('this database belongs to') as string,
    });
  } finally {
    database.close();
  }
});

test('startup refuses a detached database', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    database.run("UPDATE retention_journal_position SET state = 'detached', journal_id = NULL");
    expect((await refusal(openRetentionJournal(database, remote, options()))).message).toContain(
      'journal-attach',
    );
  } finally {
    database.close();
  }
});

test('repeated replay is idempotent', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    await session.append(subject('req-1'), designate);
    fenceSubject(database, subject('req-3'));
    await session.append(subject('req-3'), erase);
    const before = { position: position(database), subjects: classifications(database) };
    for (let run = 0; run < 3; run += 1) await openRetentionJournal(database, remote, options());
    expect({ position: position(database), subjects: classifications(database) }).toEqual(before);
  } finally {
    database.close();
  }
});

test('concurrent appends serialise under the policy lock', async () => {
  const { databasePath, remote } = await fixture();
  const first = open(databasePath);
  const second = open(databasePath);
  try {
    const sessions = [
      await openRetentionJournal(first, remote, options()),
      await openRetentionJournal(second, remote, options()),
    ];
    const outcomes = await Promise.allSettled([
      sessions[0]?.append(subject('req-1'), designate),
      sessions[1]?.append(subject('req-2'), hold),
    ]);
    expect(outcomes.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
    expect({ head: headSequence(remote), ...position(first) }).toEqual({
      head: 2,
      applied_sequence: 2,
      state: 'attached',
      mirrored: 2,
    });
  } finally {
    first.close();
    second.close();
  }
});

test('policy lock expiry refuses, not hangs', async () => {
  expect(policyLockTimeoutMilliseconds).toBe(30_000);
  const { databasePath, directory, remote } = await fixture();
  const holderPath = join(directory, 'holder.ts');
  writeFileSync(
    holderPath,
    `import { Database } from 'bun:sqlite';
const lock = new Database(Bun.argv[2] + '.policy-lock', { create: true });
lock.run('CREATE TABLE IF NOT EXISTS policy_lock (singleton INTEGER PRIMARY KEY)');
lock.run('BEGIN IMMEDIATE');
console.log('held');
await Bun.sleep(3000);
lock.run('ROLLBACK');
`,
  );
  const holder = Bun.spawn(['bun', holderPath, databasePath], { stdout: 'pipe', stderr: 'pipe' });
  const reader = holder.stdout.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('held');
  const database = open(databasePath);
  try {
    const session = new RetentionJournalSession(
      database,
      remote,
      options({ lockTimeoutMilliseconds: 300 }),
    );
    const started = Date.now();
    expect(await rejectionOf(session.append(subject('req-1'), designate))).toThrow(
      RetentionPolicyBusyError,
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(headSequence(remote)).toBe(0);
  } finally {
    database.close();
    holder.kill();
  }
});

test('journal-init refuses an existing genesis', async () => {
  const { remote } = await fixture();
  expect(
    (await refusal(initJournal(remote, { journalId, environment: 'website-test', writer, now: 6 })))
      .message,
  ).toContain('already exists');
});

test('journal-attach refuses applied_sequence > 0', async () => {
  const { databasePath, remote } = await fixture();
  const database = open(databasePath);
  try {
    const session = await openRetentionJournal(database, remote, options());
    await session.append(subject('req-1'), designate);
    database.run("UPDATE retention_journal_position SET state = 'detached'");
    expect(() => {
      attachJournal(database, journalId);
    }).toThrow('requires a detached database at applied sequence 0');
  } finally {
    database.close();
  }
});

test('journal-replay never writes the remote', async () => {
  const { databasePath, directory, remote } = await fixture();
  const scratchPath = join(directory, 'scratch.sqlite');
  const database = open(databasePath);
  try {
    database.run(`VACUUM INTO '${scratchPath}'`);
    const session = await openRetentionJournal(database, remote, options());
    await session.append(subject('req-1'), designate);
    remote.failPutOnce(headKey);
    expect((await refusal(session.append(subject('req-2'), hold))).reason).toBe('unavailable');
  } finally {
    database.close();
  }
  const headVersions = remote.versionCount(headKey);
  const scratch = open(scratchPath);
  try {
    const replaying = new RetentionJournalSession(scratch, remote, options({ readOnly: true }));
    expect((await refusal(replaying.synchronise())).message).toContain('read-only replay');
    expect((await refusal(replaying.append(subject('req-3'), hold))).reason).toBe('unavailable');
    expect(remote.versionCount(headKey)).toBe(headVersions);
    expect(position(scratch)?.applied_sequence).toBe(0);
  } finally {
    scratch.close();
  }
});
