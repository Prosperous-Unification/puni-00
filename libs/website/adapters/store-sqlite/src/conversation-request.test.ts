import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { backfillRetentionSubjects, readSurvivingContentBound } from './request-retention';
import {
  eraseSubjectContent,
  fenceSubject,
  inspectExpiredDrafts,
  purgeExpiredDrafts,
  WebsiteStore,
} from './store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const raw = JSON.stringify({
  selected: { questionId: 'launch-purpose', answerId: 'buy-book', revision: 1 },
  message: 'SECRET exact explanation',
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-answer-'));
  directories.push(directory);
  const path = join(directory, 'website.sqlite');
  const store = new WebsiteStore(path);
  store.createDraft('draft', 'Opening', 'claim', 10, 1000, 'source', {
    version: 1,
    startingChoice: 'launch',
    startConversation: true,
  });
  const database = new Database(path);
  database.run('PRAGMA foreign_keys = ON');
  database.run(
    "INSERT INTO conversation (id, draft_id, source_hash, state, created_at) VALUES ('talk', 'draft', 'source', 'open', 10)",
  );
  database
    .query(
      "INSERT INTO conversation_operation (id, conversation_id, idempotency_key, source_hash, body_hash, message, initial, stage, prompt_version, state, utc_day, reserved_micro_usd, settled_micro_usd, settlement, created_at, request_json) VALUES ('answer', 'talk', 'answer-key', 'source', 'hash', '', 0, 'clarify', 'test', 'unknown', '1970-01-01', 500, 500, 'reserved_ceiling', 5, ?)",
    )
    .run(raw);
  return { path, store, database };
}
function subject(database: Database, kind: 'software_request' | 'proposal_submission') {
  if (kind === 'software_request')
    database.run(
      "INSERT INTO prospect_account (id, email, created_at) VALUES ('account', 'owner@example.test', 10); INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at) VALUES ('subject', 'account', 'draft', '', '', 10)",
    );
  else
    database.run(
      "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('subject', 'draft', 'owner@example.test', '', 'receipt', 'submitted', 10, 10)",
    );
  database
    .query(
      "INSERT INTO retention_subject (subject_kind, subject_id, resolution, anchor_at, deadline_at, anchor_source) VALUES (?, 'subject', 'anchored', 10, 100, 'draft')",
    )
    .run(kind);
}

test('saved normalized answer is read exactly and malformed/missing trusted payload throws', () => {
  const { store, database } = fixture();
  database.run(
    "UPDATE conversation_operation SET message = 'Buy or book\n\nSECRET exact explanation'",
  );
  expect(store.findLatestConversationOperation('talk')?.answer).toEqual({
    selected: { questionId: 'launch-purpose', answerId: 'buy-book', revision: 1 },
    message: 'SECRET exact explanation',
  });
  for (const source of [
    null,
    '{',
    '{}',
    '{"message":""}',
    '{"selected":{"questionId":"unknown","answerId":"x","revision":1}}',
    '{"message":"ok","extra":1}',
  ]) {
    database.query('UPDATE conversation_operation SET request_json = ?').run(source);
    expect(() => store.findLatestConversationOperation('talk')).toThrow();
  }
  database.query('UPDATE conversation_operation SET request_json = ?').run(raw);
  database.run('UPDATE conversation_operation SET initial = 1');
  expect(() => store.findLatestConversationOperation('talk')).toThrow('Unexpected');
  database.run(
    'UPDATE conversation_operation SET initial = 0; UPDATE intake_draft SET scoping_version = NULL',
  );
  expect(() => store.findLatestConversationOperation('talk')).toThrow('Unexpected');
  database.run(
    "UPDATE intake_draft SET scoping_version = 1; UPDATE conversation_operation SET message = '', request_json = NULL",
  );
  expect(store.findLatestConversationOperation('talk')?.answer).toBeNull();
  database.close();
  store.close();
});

for (const kind of ['software_request', 'proposal_submission'] as const)
  test(`retry payload erases and refuses insert/update resurrection: ${kind}`, () => {
    const { store, database } = fixture();
    subject(database, kind);
    fenceSubject(database, { kind, id: 'subject' });
    expect(() =>
      database.query('UPDATE conversation_operation SET request_json = ?').run(raw),
    ).toThrow('fenced');
    database
      .transaction(() => eraseSubjectContent(database, { kind, id: 'subject' }, 1, 30))
      .immediate();
    expect(
      database
        .query(
          'SELECT request_json, reserved_micro_usd, settled_micro_usd FROM conversation_operation',
        )
        .get(),
    ).toEqual({ request_json: null, reserved_micro_usd: 500, settled_micro_usd: 500 });
    expect(() =>
      database.query('UPDATE conversation_operation SET request_json = ?').run(raw),
    ).toThrow('fenced');
    expect(() =>
      database
        .query(
          "INSERT INTO conversation_operation (id, conversation_id, idempotency_key, source_hash, body_hash, message, initial, stage, prompt_version, state, utc_day, created_at, request_json) VALUES ('resurrect', 'talk', 'other-key', 'source', 'hash', '', 0, 'clarify', 'test', 'inflight', '1970-01-01', 31, ?)",
        )
        .run(raw),
    ).toThrow('fenced');
    database.close();
    store.close();
  });

test('retry payload alone participates in coverage, first-content bounds and retained expired cleanup', () => {
  const { path, store, database } = fixture();
  database.run("UPDATE intake_draft SET description = '', brief = ''");
  subject(database, 'software_request');
  database.run('DELETE FROM retention_subject');
  backfillRetentionSubjects(database);
  expect(database.query('SELECT resolution, ambiguity FROM retention_subject').get()).toEqual({
    resolution: 'ambiguous',
    ambiguity: 'content_predates_anchor',
  });
  expect(readSurvivingContentBound(database, 'software_request', 'subject')).toBe(5);
  database.run("UPDATE retention_subject SET resolution = 'pending_content', ambiguity = NULL");
  backfillRetentionSubjects(database);
  expect(database.query('SELECT resolution, ambiguity FROM retention_subject').get()).toEqual({
    resolution: 'ambiguous',
    ambiguity: 'unanchored_content',
  });
  database.run('DELETE FROM retention_subject; DELETE FROM software_request');
  const plan = inspectExpiredDrafts(path, 1000);
  expect(plan.retainedDrafts).toBe(1);
  purgeExpiredDrafts(path, 1000, plan.fingerprint, 1000);
  expect(
    database.query('SELECT request_json, settled_micro_usd FROM conversation_operation').get(),
  ).toEqual({ request_json: null, settled_micro_usd: 500 });
  database.close();
  store.close();
});

test('retry payload ownership cannot move through operation or conversation', () => {
  const { store, database } = fixture();
  store.createDraft('other', 'Other', 'other', 10, 1000, 'source');
  store.createDraft('free', 'Free', 'free', 10, 1000, 'source');
  database.run(
    "INSERT INTO conversation (id, draft_id, source_hash, state, created_at) VALUES ('other-talk', 'other', 'source', 'open', 10)",
  );
  expect(() =>
    database.run("UPDATE conversation_operation SET conversation_id = 'other-talk'"),
  ).toThrow('immutable');
  expect(() => database.run("UPDATE conversation SET draft_id = 'free' WHERE id = 'talk'")).toThrow(
    'immutable',
  );
  database.run('UPDATE conversation_operation SET request_json = NULL');
  expect(() => {
    database
      .transaction(() => {
        database.run("UPDATE conversation_operation SET conversation_id = 'other-talk'");
        database.query('UPDATE conversation_operation SET request_json = ?').run(raw);
      })
      .immediate();
  }).toThrow('immutable');
  expect(
    database.query('SELECT conversation_id, request_json FROM conversation_operation').get(),
  ).toEqual({ conversation_id: 'talk', request_json: null });
  database.close();
  store.close();
});

test('another request retaining only retry JSON keeps its account identity', () => {
  const { store, database } = fixture();
  subject(database, 'software_request');
  database.run(
    "INSERT INTO software_request (id, account_id, description, brief, created_at, submitted_at) VALUES ('erase-me', 'account', '', '', 10, 20); INSERT INTO retention_subject (subject_kind, subject_id, resolution, anchor_at, deadline_at, anchor_source) VALUES ('software_request', 'erase-me', 'anchored', 10, 100, 'draft'); UPDATE intake_draft SET description = '', brief = ''",
  );
  fenceSubject(database, { kind: 'software_request', id: 'erase-me' });
  const erased = database
    .transaction(() =>
      eraseSubjectContent(database, { kind: 'software_request', id: 'erase-me' }, 1, 30),
    )
    .immediate();
  expect(erased.identityErased).toBe(false);
  expect(database.query("SELECT email FROM prospect_account WHERE id = 'account'").get()).toEqual({
    email: 'owner@example.test',
  });
  database.close();
  store.close();
});

test('request JSON schema bounds serialization and missing normalized admission throws before pricing', () => {
  const { store, database } = fixture();
  expect(() =>
    database.query('UPDATE conversation_operation SET request_json = ?').run('x'.repeat(13001)),
  ).toThrow('CHECK');
  database.run('DELETE FROM conversation_operation; DELETE FROM conversation');
  const admission = {
    claimHash: 'claim',
    sourceHash: 'source',
    idempotencyKey: 'initial:draft',
    bodyHash: 'hash',
    message: 'Opening',
    initial: true,
    promptVersion: 'test',
    pricing: { kind: 'free' as const },
    browserCheck: 'absent' as const,
    now: 20,
  };
  const first = store.admitConversationOperation(admission);
  if (first.kind !== 'started') throw new Error('Initial refused');
  store.completeConversationOperation(first.id, 'Question', null, 21, false);
  let prices = 0;
  expect(() =>
    store.admitConversationOperation({
      ...admission,
      initial: false,
      idempotencyKey: 'missing-answer-key',
      message: 'Typed answer',
      pricing: {
        kind: 'paid',
        price: () => {
          prices++;
          return 1000;
        },
      },
    }),
  ).toThrow('Missing normalized');
  expect(prices).toBe(0);
  expect(database.query('SELECT count(*) AS count FROM conversation_operation').get()).toEqual({
    count: 1,
  });
  database.close();
  store.close();
});
