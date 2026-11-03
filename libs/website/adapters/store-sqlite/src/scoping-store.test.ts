import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';

import { websiteMigrations } from './migration-catalogue';
import { backfillRetentionSubjects, readSurvivingContentBound } from './request-retention';
import { applyScopingReply } from './scoping-store';
import {
  eraseSubjectContent,
  fenceSubject,
  inspectExpiredDrafts,
  purgeExpiredDrafts,
  WebsiteStore,
} from './store';

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-scoping-'));
  directories.push(directory);
  const path = join(directory, 'website.sqlite');
  const store = new WebsiteStore(path);
  store.createDraft('draft', 'Opening', 'claim', 10, 1000, 'source', {
    version: 1,
    startConversation: true,
    startingChoice: 'improve',
  });
  const database = new Database(path);
  database.run('PRAGMA foreign_keys = ON');
  return { path, store, database };
}
function candidate(database: Database, brief: string, now = 20) {
  return database
    .transaction(() =>
      applyScopingReply(
        database,
        'draft',
        { version: 1, message: 'Ready', nextQuestionId: null, brief },
        now,
      ),
    )
    .immediate();
}
function submit(database: Database, kind: 'software_request' | 'proposal_submission') {
  if (kind === 'software_request')
    database.run(
      "INSERT INTO prospect_account VALUES ('account', 'a@example.test', 10); INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at) VALUES ('subject', 'account', 'draft', '', '', 10)",
    );
  else
    database.run(
      "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('subject', 'draft', 'a@example.test', 'Brief', 'receipt', 'submitted', 10, 10)",
    );
  database
    .query(
      "INSERT INTO retention_subject (subject_kind, subject_id, resolution, anchor_at, deadline_at, anchor_source) VALUES (?, 'subject', 'anchored', 10, 100, 'draft')",
    )
    .run(kind);
}

test('versioned intent and state round trip while legacy remains explicit', () => {
  const { store, database, path } = fixture();
  expect(store.findDraft('claim', 11)?.scoping).toEqual({
    version: 1,
    startConversation: true,
    startingChoice: 'improve',
    questionId: null,
    revision: 0,
    references: null,
    candidateBrief: null,
    emailInvitationDeclined: false,
  });
  store.close();
  const reopened = new WebsiteStore(path);
  expect(reopened.findDraft('claim', 11)?.scoping.version).toBe(1);
  reopened.createDraft('legacy', 'Old', 'old', 10, 1000, 'source');
  expect(reopened.findDraft('old', 11)?.scoping).toEqual({ version: 'legacy' });
  expect(reopened.updateBrief('old', 'Old edit', 11)).toBe(true);
  reopened.close();
  database.close();
});

test('stale edits cannot overwrite the latest brief and legacy update cannot bypass revision', () => {
  const { store, database } = fixture();
  expect(store.editScoping('claim', 0, { kind: 'brief', brief: 'Visitor edit' }, 20).kind).toBe(
    'updated',
  );
  const stale = store.editScoping('claim', 0, { kind: 'brief', brief: 'Stale overwrite' }, 21);
  expect(store.findDraft('claim', 22)?.brief).toBe('Visitor edit');
  expect(stale.kind).toBe('stale');
  expect(store.updateBrief('claim', 'Bypass', 21)).toBe(false);
  expect(store.findDraft('claim', 22)?.brief).toBe('Visitor edit');
  database.close();
  store.close();
});

test('first candidate fills empty brief and later candidates require explicit acceptance preserving edits', () => {
  const { store, database } = fixture();
  expect(candidate(database, 'First')).toBe(true);
  expect(store.findDraft('claim', 21)?.brief).toBe('First');
  expect(store.editScoping('claim', 1, { kind: 'brief', brief: 'Visitor edit' }, 22).kind).toBe(
    'updated',
  );
  expect(candidate(database, 'Second', 23)).toBe(true);
  expect(store.findDraft('claim', 24)?.brief).toBe('Visitor edit');
  expect(store.editScoping('claim', 3, { kind: 'accept_candidate' }, 25).kind).toBe('updated');
  expect(store.findDraft('claim', 26)?.brief).toBe('Second');
  expect(
    store.editScoping('claim', 4, { kind: 'references', references: '  Product link\nNotes  ' }, 27)
      .kind,
  ).toBe('updated');
  expect(store.editScoping('claim', 5, { kind: 'decline_email' }, 28).kind).toBe('updated');
  expect(store.findDraft('claim', 29)?.scoping).toMatchObject({
    references: '  Product link\nNotes  ',
    emailInvitationDeclined: true,
    revision: 6,
  });
  database.close();
  store.close();
});

test('reply updates question atomically and cannot commit outside settlement transaction', () => {
  const { store, database } = fixture();
  const reply = {
    version: 1 as const,
    message: 'Question',
    nextQuestionId: 'improve-blocker' as const,
    brief: null,
  };
  expect(() => applyScopingReply(database, 'draft', reply, 20)).toThrow('transaction');
  expect(() =>
    database
      .transaction(() => {
        applyScopingReply(database, 'draft', reply, 20);
        throw new Error('settlement failed');
      })
      .immediate(),
  ).toThrow('settlement failed');
  expect(store.findDraft('claim', 21)?.scoping).toMatchObject({ questionId: null, revision: 0 });
  database.transaction(() => applyScopingReply(database, 'draft', reply, 20)).immediate();
  expect(store.findDraft('claim', 21)?.scoping).toMatchObject({
    questionId: 'improve-blocker',
    revision: 1,
  });
  database.close();
  store.close();
});

for (const fault of [
  'missing state',
  'unknown question',
  'unknown choice',
  'oversized references',
  'bad revision',
  'bad intent',
  'bad version',
] as const)
  test(`malformed new state throws: ${fault}`, () => {
    const { store, database } = fixture();
    const corrupt = {
      'missing state': 'DELETE FROM draft_scoping',
      'unknown question': "UPDATE draft_scoping SET question_id = 'unknown'",
      'unknown choice': "UPDATE intake_draft SET starting_choice = 'unknown'",
      'oversized references': `UPDATE draft_scoping SET reference_text = '${'x'.repeat(4001)}', first_content_at = 20`,
      'bad revision': 'UPDATE draft_scoping SET revision = -1',
      'bad intent': 'UPDATE intake_draft SET start_conversation = 2',
      'bad version': 'UPDATE intake_draft SET scoping_version = 2',
    }[fault];
    database.run('PRAGMA ignore_check_constraints = ON');
    database.run(corrupt);
    expect(() => store.findDraft('claim', 21)).toThrow('Malformed scoping');
    database.close();
    store.close();
  });

test('live ownership and expiry guard every edit and reply', () => {
  const { store, database } = fixture();
  expect(store.editScoping('other', 0, { kind: 'references', references: 'secret' }, 20).kind).toBe(
    'missing',
  );
  expect(
    store.editScoping('claim', 0, { kind: 'references', references: 'secret' }, 1000).kind,
  ).toBe('missing');
  expect(candidate(database, 'late', 1000)).toBe(false);
  expect(
    database
      .transaction(() =>
        applyScopingReply(
          database,
          'other',
          { version: 1, message: 'Ready', nextQuestionId: null, brief: 'Other brief' },
          20,
        ),
      )
      .immediate(),
  ).toBe(false);
  database.run('UPDATE intake_draft SET consumed_at = 15');
  expect(store.editScoping('claim', 0, { kind: 'decline_email' }, 20).kind).toBe('missing');
  expect(candidate(database, 'late', 20)).toBe(false);
  database.close();
  store.close();
});

for (const kind of ['software_request', 'proposal_submission'] as const)
  test(`erasure removes scoping text and fences late writes: ${kind}`, () => {
    const { store, database } = fixture();
    store.editScoping('claim', 0, { kind: 'references', references: 'SECRET reference' }, 20);
    candidate(database, 'SECRET candidate');
    submit(database, kind);
    fenceSubject(database, { kind, id: 'subject' });
    expect(() => database.run("UPDATE draft_scoping SET reference_text = 'resurrect'")).toThrow(
      'fenced',
    );
    expect(() => database.run("UPDATE draft_scoping SET candidate_brief = 'resurrect'")).toThrow(
      'fenced',
    );
    database
      .transaction(() => eraseSubjectContent(database, { kind, id: 'subject' }, 1, 30))
      .immediate();
    expect(
      database.query('SELECT reference_text, candidate_brief FROM draft_scoping').get(),
    ).toEqual({ reference_text: null, candidate_brief: null });
    expect(() => candidate(database, 'SECRET late', 31)).toThrow('fenced');
    expect(() =>
      database.run("UPDATE draft_scoping SET reference_text = 'SECRET late reference'"),
    ).toThrow('fenced');
    expect(() =>
      database.run("UPDATE draft_scoping SET candidate_brief = 'SECRET late candidate'"),
    ).toThrow('fenced');
    database.close();
    store.close();
  });

test('expired retained accounting draft loses scoping text', () => {
  const { store, database, path } = fixture();
  store.editScoping('claim', 0, { kind: 'references', references: 'SECRET reference' }, 20);
  candidate(database, 'SECRET candidate');
  const admitted = store.admitConversationOperation({
    claimHash: 'claim',
    sourceHash: 'source',
    idempotencyKey: 'initial:draft',
    bodyHash: 'hash',
    message: 'Opening',
    initial: true,
    promptVersion: 'test',
    pricing: { kind: 'free' },
    browserCheck: 'absent',
    now: 30,
  });
  expect(admitted.kind).toBe('started');
  const plan = inspectExpiredDrafts(path, 1000);
  expect(purgeExpiredDrafts(path, 1000, plan.fingerprint, 1000).retainedDrafts).toBe(1);
  expect(database.query('SELECT reference_text, candidate_brief FROM draft_scoping').get()).toEqual(
    { reference_text: null, candidate_brief: null },
  );
  expect(candidate(database, 'SECRET late', 1001)).toBe(false);
  expect(database.query('SELECT count(*) AS count FROM conversation_operation').get()).toEqual({
    count: 1,
  });
  database.close();
  store.close();
});

test('migration upgrades legacy and downgrade preserves canonical legacy draft', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-scoping-upgrade-'));
  directories.push(directory);
  const path = join(directory, 'website.sqlite');
  const database = new Database(path);
  database.run('CREATE TABLE schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
  for (const migration of websiteMigrations().filter(({ name }) => name < '011')) {
    const forward = readFileSync(join(migration.directory, 'migration.sql'), 'utf8');
    database.run(forward);
    database
      .query('INSERT INTO schema_migration (name, checksum) VALUES (?, ?)')
      .run(migration.name, createHash('sha256').update(forward).digest('hex'));
  }
  database.run(
    "INSERT INTO intake_draft (id, description, brief, claim_hash, created_at, expires_at) VALUES ('old', 'Opening', 'Saved edit', 'old', 10, 1000)",
  );
  const upgraded = new WebsiteStore(path);
  expect(upgraded.findDraft('old', 20)).toMatchObject({
    brief: 'Saved edit',
    scoping: { version: 'legacy' },
  });
  upgraded.close();
  const migration = websiteMigrations().find(({ name }) => name.startsWith('011'));
  expect(migration).toBeDefined();
  if (!migration) throw new Error('011 missing');
  expect(database.query('SELECT scoping_version FROM intake_draft').get()).toEqual({
    scoping_version: null,
  });
  for (const newer of websiteMigrations()
    .filter(({ name }) => name >= '011')
    .toReversed())
    database.run(readFileSync(join(newer.directory, 'down.sql'), 'utf8'));
  expect(database.query('SELECT brief FROM intake_draft').get()).toEqual({ brief: 'Saved edit' });
  database.close();
});

test('all scoping edits and question-only replies refuse fenced ownership', () => {
  const { store, database } = fixture();
  submit(database, 'software_request');
  fenceSubject(database, { kind: 'software_request', id: 'subject' });
  expect(() => store.editScoping('claim', 0, { kind: 'decline_email' }, 20)).toThrow('fenced');
  expect(() =>
    database
      .transaction(() =>
        applyScopingReply(
          database,
          'draft',
          { version: 1, message: 'Ask', nextQuestionId: 'improve-blocker', brief: null },
          20,
        ),
      )
      .immediate(),
  ).toThrow('fenced');
  database.close();
  store.close();
});

test('creation rolls back cap and draft when scoping insertion fails', () => {
  const { store, database } = fixture();
  database.run(
    "CREATE TRIGGER fail_scoping BEFORE INSERT ON draft_scoping BEGIN SELECT RAISE(ABORT, 'injected state failure'); END",
  );
  const before = database.query('SELECT * FROM admission_count ORDER BY rowid').all();
  expect(() =>
    store.createDraft('failed', 'Opening', 'failed', 11, 1000, 'source', {
      version: 1,
      startConversation: true,
      startingChoice: 'launch',
    }),
  ).toThrow('injected state failure');
  expect(store.findDraft('failed', 12)).toBeNull();
  expect(database.query('SELECT * FROM admission_count ORDER BY rowid').all()).toEqual(before);
  database.close();
  store.close();
});

for (const kind of ['software_request', 'proposal_submission'] as const)
  test(`SQL fences cover inserts, each text column and immutable ownership: ${kind}`, () => {
    const { store, database } = fixture();
    submit(database, kind);
    database.run(
      "INSERT INTO intake_draft (id, description, claim_hash, created_at, expires_at) VALUES ('other', 'Unrelated', 'other', 10, 1000)",
    );
    expect(() => database.run("UPDATE draft_scoping SET draft_id = 'other'")).toThrow('immutable');
    fenceSubject(database, { kind, id: 'subject' });
    database.run('DELETE FROM draft_scoping');
    expect(() =>
      database.run(
        "INSERT INTO draft_scoping (draft_id, reference_text, created_at, updated_at) VALUES ('draft', 'SECRET inserted reference', 10, 10)",
      ),
    ).toThrow('fenced');
    database.close();
    store.close();
  });

test('absent candidate and legacy edits are modeled without changing revision', () => {
  const { store, database } = fixture();
  expect(store.editScoping('claim', 0, { kind: 'accept_candidate' }, 20).kind).toBe('no_candidate');
  store.createDraft('old', 'Old', 'old', 10, 1000, 'source');
  expect(store.editScoping('old', 0, { kind: 'decline_email' }, 20).kind).toBe('legacy');
  expect(
    database
      .transaction(() =>
        applyScopingReply(
          database,
          'old',
          { version: 1, message: 'Ask', nextQuestionId: null, brief: null },
          20,
        ),
      )
      .immediate(),
  ).toBe(false);
  database.close();
  store.close();
});

for (const column of ['reference_text', 'candidate_brief'] as const)
  test(`scoping-only content participates in coverage and first-content bounds: ${column}`, () => {
    const { store, database } = fixture();
    database.run(
      `UPDATE intake_draft SET description = '', brief = ''; UPDATE draft_scoping SET ${column} = 'SECRET', first_content_at = 5`,
    );
    submit(database, 'software_request');
    database.run('DELETE FROM retention_subject');
    backfillRetentionSubjects(database);
    expect(
      database
        .query("SELECT resolution, ambiguity FROM retention_subject WHERE subject_id = 'subject'")
        .get(),
    ).toEqual({ resolution: 'ambiguous', ambiguity: 'content_predates_anchor' });
    expect(readSurvivingContentBound(database, 'software_request', 'subject')).toBe(5);
    database.run("UPDATE retention_subject SET resolution = 'pending_content', ambiguity = NULL");
    backfillRetentionSubjects(database);
    expect(
      database
        .query("SELECT resolution, ambiguity FROM retention_subject WHERE subject_id = 'subject'")
        .get(),
    ).toEqual({ resolution: 'ambiguous', ambiguity: 'unanchored_content' });
    database.close();
    store.close();
  });

test('later candidate cannot fill a canonical brief the visitor intentionally cleared', () => {
  const { store, database } = fixture();
  candidate(database, 'First');
  store.editScoping('claim', 1, { kind: 'brief', brief: '' }, 21);
  candidate(database, 'Second', 22);
  expect(store.findDraft('claim', 23)?.brief).toBe('');
  database.close();
  store.close();
});

test('reply preserves references and declined invitation edited during inference', () => {
  const { store, database } = fixture();
  store.editScoping('claim', 0, { kind: 'references', references: 'Visitor references' }, 20);
  store.editScoping('claim', 1, { kind: 'decline_email' }, 21);
  store.editScoping('claim', 2, { kind: 'brief', brief: 'Visitor brief' }, 22);
  candidate(database, 'AI candidate', 23);
  expect(store.findDraft('claim', 24)).toMatchObject({
    brief: 'Visitor brief',
    scoping: {
      revision: 4,
      references: 'Visitor references',
      emailInvitationDeclined: true,
      candidateBrief: 'AI candidate',
    },
  });
  store.editScoping('claim', 4, { kind: 'references', references: null }, 25);
  expect(store.findDraft('claim', 26)?.scoping).toMatchObject({ references: null, revision: 5 });
  database.close();
  store.close();
});

for (const fault of [
  "UPDATE draft_scoping SET candidate_brief = '', first_content_at = 20",
  "UPDATE draft_scoping SET candidate_brief = 'x', first_content_at = NULL",
  'UPDATE draft_scoping SET email_invitation_declined = 2',
  'UPDATE draft_scoping SET created_at = -1',
  'UPDATE draft_scoping SET updated_at = -1',
  'UPDATE draft_scoping SET first_content_at = -1',
  'UPDATE intake_draft SET scoping_version = NULL',
  `UPDATE draft_scoping SET candidate_brief = '${'x'.repeat(4001)}', first_content_at = 20`,
] as const)
  test(`trusted state validation rejects ${fault.slice(0, 90)}`, () => {
    const { store, database } = fixture();
    database.run('PRAGMA ignore_check_constraints = ON');
    database.run(fault);
    expect(() => store.findDraft('claim', 20)).toThrow();
    database.close();
    store.close();
  });

for (const fault of [
  'UPDATE intake_draft SET scoping_version = 2',
  'UPDATE intake_draft SET start_conversation = 2',
  'UPDATE draft_scoping SET revision = -1',
  `UPDATE draft_scoping SET reference_text = '${'x'.repeat(4001)}'`,
  `UPDATE draft_scoping SET candidate_brief = '${'x'.repeat(4001)}'`,
  'UPDATE draft_scoping SET email_invitation_declined = 2',
  'UPDATE conversation_operation SET reply_version = 2',
])
  test(`schema refuses invalid versioned writes: ${fault.slice(0, 80)}`, () => {
    const { store, database } = fixture();
    const admitted = store.admitConversationOperation({
      claimHash: 'claim',
      sourceHash: 'source',
      idempotencyKey: 'initial:draft',
      bodyHash: 'hash',
      message: 'Opening',
      initial: true,
      promptVersion: 'test',
      pricing: { kind: 'free' },
      browserCheck: 'absent',
      now: 30,
    });
    expect(admitted.kind).toBe('started');
    expect(() => database.run(fault)).toThrow('CHECK constraint failed');
    database.close();
    store.close();
  });

for (const column of ['reference_text', 'candidate_brief'] as const)
  test(`another request with only ${column} retains its account identity`, () => {
    const { store, database } = fixture();
    submit(database, 'software_request');
    database.run(`
    INSERT INTO intake_draft (id, description, claim_hash, created_at, expires_at, scoping_version, start_conversation) VALUES ('other', '', 'other', 10, 1000, 1, 1);
    INSERT INTO draft_scoping (draft_id, ${column}, created_at, updated_at, first_content_at) VALUES ('other', 'SECRET other request', 10, 10, 10);
    INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at, submitted_at) VALUES ('other-request', 'account', 'other', '', '', 10, 20);
  `);
    fenceSubject(database, { kind: 'software_request', id: 'subject' });
    const erased = database
      .transaction(() =>
        eraseSubjectContent(database, { kind: 'software_request', id: 'subject' }, 1, 30),
      )
      .immediate();
    expect(erased.identityErased).toBe(false);
    expect(database.query("SELECT email FROM prospect_account WHERE id = 'account'").get()).toEqual(
      { email: 'a@example.test' },
    );
    database.close();
    store.close();
  });

test('scoping content cannot lose its owning draft through a null primary key', () => {
  const { store, database } = fixture();
  expect(() => database.run('UPDATE draft_scoping SET draft_id = NULL')).toThrow();
  expect(() =>
    database.run(
      "INSERT INTO draft_scoping (draft_id, reference_text, created_at, updated_at) VALUES (NULL, 'SECRET orphan', 10, 10)",
    ),
  ).toThrow();
  database.close();
  store.close();
});

test('revision exhaustion rolls back edits and replies instead of storing an unsafe revision', () => {
  const { store, database } = fixture();
  database.run('UPDATE draft_scoping SET revision = 9007199254740991');
  expect(() =>
    store.editScoping(
      'claim',
      Number.MAX_SAFE_INTEGER,
      { kind: 'brief', brief: 'overflow edit' },
      20,
    ),
  ).toThrow();
  expect(() => candidate(database, 'overflow reply', 21)).toThrow();
  expect(store.findDraft('claim', 22)).toMatchObject({
    brief: '',
    scoping: { revision: Number.MAX_SAFE_INTEGER },
  });
  database.close();
  store.close();
});

test('scoping creation refuses a vanished draft and rolls back admission', () => {
  const { store, database } = fixture();
  database.run(
    'CREATE TRIGGER lose_scoping_owner AFTER INSERT ON draft_scoping BEGIN DELETE FROM intake_draft WHERE id = NEW.draft_id; END',
  );
  expect(() =>
    store.createDraft('lost', 'Opening', 'lost', 20, 1000, 'source', {
      version: 1,
      startConversation: true,
      startingChoice: null,
    }),
  ).toThrow('not visible');
  expect(store.findDraft('lost', 21)).toBeNull();
  database.close();
  store.close();
});

test('scoping edit refuses version loss and rolls back the canonical brief', () => {
  const { store, database } = fixture();
  database.run(`CREATE TRIGGER lose_scoping_version AFTER UPDATE OF revision ON draft_scoping BEGIN
    DELETE FROM draft_scoping WHERE draft_id = NEW.draft_id;
    UPDATE intake_draft SET scoping_version = NULL, start_conversation = NULL, starting_choice = NULL WHERE id = NEW.draft_id;
  END`);
  expect(() =>
    store.editScoping('claim', 0, { kind: 'brief', brief: 'Must roll back' }, 20),
  ).toThrow('Malformed scoping state');
  expect(store.findDraft('claim', 21)).toMatchObject({
    brief: '',
    scoping: { version: 1, revision: 0 },
  });
  database.close();
  store.close();
});

test('draft reads keep the canonical brief and revision in one snapshot across a concurrent edit', () => {
  const { store, database } = fixture();
  database.run('PRAGMA journal_mode = WAL');
  store.editScoping('claim', 0, { kind: 'brief', brief: 'Before concurrent edit' }, 20);
  const query = Reflect.get(Database.prototype, 'query');
  let injected = false;
  Reflect.set(Database.prototype, 'query', function (this: Database, sql: string) {
    if (!injected && sql === 'SELECT * FROM draft_scoping WHERE draft_id = ?') {
      injected = true;
      database
        .transaction(() => {
          database.run("UPDATE intake_draft SET brief = 'After concurrent edit'");
          database.run('UPDATE draft_scoping SET revision = revision + 1');
        })
        .immediate();
    }
    return Reflect.apply(query, this, [sql]);
  });
  try {
    expect(store.findDraft('claim', 21)).toMatchObject({
      brief: 'Before concurrent edit',
      scoping: { revision: 1 },
    });
    expect(injected).toBe(true);
  } finally {
    Reflect.set(Database.prototype, 'query', query);
  }
  expect(store.findDraft('claim', 22)).toMatchObject({
    brief: 'After concurrent edit',
    scoping: { revision: 2 },
  });
  database.close();
  store.close();
});

test('legacy conversation completion cannot capture a brief on a versioned draft', () => {
  const { store, database } = fixture();
  for (let turn = 0; turn < 3; turn += 1) {
    const admitted = store.admitConversationOperation({
      claimHash: 'claim',
      sourceHash: 'source',
      idempotencyKey: turn === 0 ? 'initial:draft' : `turn-${String(turn)}`,
      bodyHash: `hash-${String(turn)}`,
      message: turn === 0 ? 'Opening' : 'Visitor message',
      ...(turn === 0 ? {} : { answer: { message: 'Visitor message' } }),
      initial: turn === 0,
      promptVersion: 'legacy',
      pricing: { kind: 'free' },
      browserCheck: 'absent',
      now: 20 + turn * 2,
    });
    expect(admitted.kind).toBe('started');
    if (admitted.kind !== 'started') throw new Error('Expected started operation');
    expect(
      store.completeConversationOperation(
        admitted.id,
        'Legacy model candidate',
        null,
        21 + turn * 2,
        false,
      ),
    ).toBe(true);
  }
  expect(store.findDraft('claim', 30)).toMatchObject({
    brief: '',
    scoping: { revision: 0, candidateBrief: null },
  });
  database.close();
  store.close();
});
