import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryJournalRemote, WebsiteStore } from '@website/store-sqlite';
import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';

import { runRequestRetentionCommand } from './request-retention-cli';
import { type JournalCommandContext, runRetentionJournalCommand } from './retention-journal-cli';

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

const now = 50_000;
const s3Environment = {
  S3_ENDPOINT: 'https://objects.example.test',
  S3_REGION: 'hel1',
  S3_ACCESS_KEY_ID: 'dummy-access-key',
  S3_SECRET_ACCESS_KEY: 'dummy-secret-key',
  RETENTION_JOURNAL_BUCKET: 'journal-bucket',
  RETENTION_JOURNAL_PREFIX: 'retention-journal/website-test/',
  RETENTION_WRITER_RELEASE: 'release-test',
  RETENTION_WRITER_REVISION: 'abc1234',
};

/**
 * A migrated database with four due subjects (`req-due` non-client, `req-held`, `req-client`,
 * `sub-due` a manual proposal) and one not yet due (`req-new`), each holding content, plus a
 * journal created by `journal-init`.
 */
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-retention-journal-cli-'));
  directories.push(directory);
  const databasePath = join(directory, 'website.sqlite');
  new WebsiteStore(databasePath).close();
  const database = new Database(databasePath);
  database.run(`
    INSERT INTO prospect_account (id, email, created_at) VALUES
      ('acct-due', 'due@example.test', 1), ('acct-held', 'held@example.test', 1),
      ('acct-client', 'client@example.test', 1), ('acct-new', 'new@example.test', 1);
    INSERT INTO software_request (id, account_id, description, brief, created_at, submitted_at) VALUES
      ('req-due', 'acct-due', 'due text', '', 1, 2), ('req-held', 'acct-held', 'held text', '', 1, 2),
      ('req-client', 'acct-client', 'client text', '', 1, 2), ('req-new', 'acct-new', 'new text', '', 1, 2);
    INSERT INTO intake_draft (id, description, brief, claim_hash, created_at, expires_at, consumed_at) VALUES
      ('draft-m', 'manual text', 'manual brief', 'claim-m', 1, 99999, 2);
    INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES
      ('sub-due', 'draft-m', 'manual@example.test', 'manual brief', 'receipt-m', 'closed', 2, 2);
    INSERT INTO retention_subject (subject_kind, subject_id, resolution, anchor_at, deadline_at, anchor_source, classification) VALUES
      ('software_request', 'req-due', 'anchored', 1, 1000, 'first_write', 'non_client'),
      ('software_request', 'req-held', 'anchored', 1, 1000, 'first_write', 'hold'),
      ('software_request', 'req-client', 'anchored', 1, 1000, 'first_write', 'client'),
      ('software_request', 'req-new', 'anchored', 1, 99999999, 'first_write', 'non_client'),
      ('proposal_submission', 'sub-due', 'anchored', 1, 2000, 'draft', 'non_client');
  `);
  database.close();
  const remote = new MemoryJournalRemote();
  const initialised = await runRetentionJournalCommand(['journal-init', databasePath], {
    environment: s3Environment,
    now,
    remote,
  });
  const { journalId } = initialised.output as { journalId: string };
  const context = (erasure: string, mode = 's3'): JournalCommandContext => ({
    environment: {
      ...s3Environment,
      RETENTION_JOURNAL: mode,
      RETENTION_JOURNAL_ID: journalId,
      RETENTION_ERASURE: erasure,
    },
    now,
    remote,
  });
  return { databasePath, directory, remote, journalId, context };
}

function contents(databasePath: string) {
  const database = new Database(databasePath, { readonly: true });
  try {
    return {
      requests: database.query('SELECT id, description FROM software_request ORDER BY id').all(),
      manual: database
        .query("SELECT email, brief FROM proposal_submission WHERE id = 'sub-due'")
        .get(),
      erasure: database
        .query('SELECT subject_id, erasure_state FROM retention_subject ORDER BY subject_id')
        .all(),
    };
  } finally {
    database.close();
  }
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected a rejection');
}

test('erase-due refuses without a journal', async () => {
  const { databasePath, context } = await fixture();
  const before = contents(databasePath);
  expect(
    await rejection(
      runRetentionJournalCommand(['erase-due', databasePath], context('erase', 'disabled')),
    ),
  ).toContain('RETENTION_JOURNAL=s3');
  expect(
    await rejection(
      runRetentionJournalCommand(['erase-due', databasePath], context('report', 'disabled')),
    ),
  ).toContain('RETENTION_JOURNAL=s3');
  expect(contents(databasePath)).toEqual(before);
});

test('erase-due in report mode changes nothing', async () => {
  const { databasePath, remote, context } = await fixture();
  const before = contents(databasePath);
  const outcome = await runRetentionJournalCommand(['erase-due', databasePath], context('report'));
  expect(outcome).toEqual({
    output: {
      mode: 'report',
      asOf: now,
      due: 2,
      held: 1,
      client: 1,
      erased: 0,
      identitiesErased: 0,
      exceptions: {},
    },
    exitCode: 0,
  });
  expect(contents(databasePath)).toEqual(before);
  expect(remote.keys()).toEqual(['genesis.json', 'head.json']);
});

test('cleanup never erases a client or held subject', async () => {
  const { databasePath, context } = await fixture();
  const outcome = await runRetentionJournalCommand(['erase-due', databasePath], context('erase'));
  expect(outcome).toMatchObject({
    output: { erased: 2, held: 1, client: 1, identitiesErased: 1, exceptions: {} },
    exitCode: 0,
  });
  expect(contents(databasePath)).toEqual({
    requests: [
      { id: 'req-client', description: 'client text' },
      { id: 'req-due', description: '' },
      { id: 'req-held', description: 'held text' },
      { id: 'req-new', description: 'new text' },
    ],
    manual: { email: '', brief: '' },
    erasure: [
      { subject_id: 'req-client', erasure_state: 'none' },
      { subject_id: 'req-due', erasure_state: 'erased' },
      { subject_id: 'req-held', erasure_state: 'none' },
      { subject_id: 'req-new', erasure_state: 'none' },
      { subject_id: 'sub-due', erasure_state: 'erased' },
    ],
  });
  const repeated = await runRetentionJournalCommand(['erase-due', databasePath], context('erase'));
  expect(repeated).toMatchObject({ output: { due: 0, erased: 0 }, exitCode: 0 });
});

test('erase-due erases due subjects, reports exceptions and exits non-zero on a refused one', async () => {
  const { databasePath, remote, context } = await fixture();
  const database = new Database(databasePath);
  database.run(`
    INSERT INTO prospect_account (id, email, created_at) VALUES ('acct-other', 'other@example.test', 1);
    INSERT INTO account_request (account_id, description, brief, created_at, draft_id) VALUES
      ('acct-other', 'legacy text', '', 1, 'draft-m');
  `);
  database.close();
  const outcome = await runRetentionJournalCommand(['erase-due', databasePath], context('erase'));
  expect(outcome).toMatchObject({
    output: { erased: 1, exceptions: { shared_draft_lineage: 1 } },
    exitCode: 1,
  });
  expect(contents(databasePath).erasure).toContainEqual({
    subject_id: 'sub-due',
    erasure_state: 'none',
  });
  expect(remote.keys()).toEqual(['events/000000000001.json', 'genesis.json', 'head.json']);
});

test('cleanup refuses while coverage is incomplete', async () => {
  const { databasePath, context } = await fixture();
  const database = new Database(databasePath);
  database.run(`
    INSERT INTO prospect_account (id, email, created_at) VALUES ('acct-odd', 'odd@example.test', 1);
    INSERT INTO software_request (id, account_id, description, brief, created_at) VALUES ('req-odd', 'acct-odd', 'odd text', '', 1);
    INSERT INTO retention_subject (subject_kind, subject_id, resolution, ambiguity) VALUES
      ('software_request', 'req-odd', 'ambiguous', 'unanchored_content');
  `);
  database.close();
  const before = contents(databasePath);
  expect(
    await rejection(runRetentionJournalCommand(['erase-due', databasePath], context('erase'))),
  ).toContain('Retention activation refused');
  expect(contents(databasePath)).toEqual(before);
});

test('journal-init refuses an existing genesis', async () => {
  const { databasePath, directory, remote } = await fixture();
  expect(
    await rejection(
      runRetentionJournalCommand(['journal-init', databasePath], {
        environment: s3Environment,
        now,
        remote,
      }),
    ),
  ).toContain('requires a detached database');
  const freshPath = join(directory, 'fresh.sqlite');
  new WebsiteStore(freshPath).close();
  expect(
    await rejection(
      runRetentionJournalCommand(['journal-init', freshPath], {
        environment: s3Environment,
        now,
        remote,
      }),
    ),
  ).toContain('already exists');
  const fresh = new Database(freshPath, { readonly: true });
  try {
    expect(fresh.query('SELECT journal_id, state FROM retention_journal_position').get()).toEqual({
      journal_id: null,
      state: 'detached',
    });
  } finally {
    fresh.close();
  }
});

test('journal-attach refuses applied_sequence > 0', async () => {
  const { databasePath, directory, context } = await fixture();
  expect(
    await runRetentionJournalCommand(
      ['event', databasePath, 'place_hold', 'software_request', 'req-new', 'ops-ticket:7', 'dany'],
      context('report'),
    ),
  ).toEqual({ output: { sequence: 1 }, exitCode: 0 });
  const restoredPath = join(directory, 'restored.sqlite');
  const database = new Database(databasePath);
  database.run(`VACUUM INTO '${restoredPath}'`);
  database.close();
  const restored = new Database(restoredPath);
  restored.run("UPDATE retention_journal_position SET state = 'detached', journal_id = NULL");
  restored.close();
  expect(
    await rejection(
      runRetentionJournalCommand(['journal-attach', restoredPath], context('report')),
    ),
  ).toContain('applied sequence 0');
  const status = await runRetentionJournalCommand(
    ['journal-status', databasePath],
    context('report'),
  );
  expect(status.output).toMatchObject({ state: 'attached', appliedSequence: 1, headSequence: 1 });
});

test('journal-replay brings an older snapshot to the head without writing the remote', async () => {
  const { databasePath, directory, remote, context } = await fixture();
  const snapshotPath = join(directory, 'snapshot.sqlite');
  const database = new Database(databasePath);
  database.run(`VACUUM INTO '${snapshotPath}'`);
  database.close();
  await runRetentionJournalCommand(
    [
      'event',
      databasePath,
      'designate_client',
      'software_request',
      'req-new',
      'contract:7',
      'dany',
    ],
    context('report'),
  );
  const headVersions = remote.versionCount('head.json');
  const replayed = await runRetentionJournalCommand(
    ['journal-replay', snapshotPath],
    context('report'),
  );
  expect(replayed.output).toMatchObject({ appliedSequence: 1, headSequence: 1 });
  expect(remote.versionCount('head.json')).toBe(headVersions);
});

test('resolve refuses while the journal is active', () => {
  expect(() =>
    runRequestRetentionCommand(
      ['resolve', '/nonexistent.sqlite', 'software_request', 'x', '1', 'ops-ticket:1', 'dany'],
      now,
      { RETENTION_JOURNAL: 's3' },
    ),
  ).toThrow('must be journaled');
});
