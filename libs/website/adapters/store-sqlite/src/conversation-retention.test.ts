import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { eraseConversationContent } from './conversation-store';
import {
  addUtcMonths,
  inspectExpiredDrafts,
  inspectRequestRetention,
  purgeExpiredDrafts,
  WebsiteStore,
} from './store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const day = Date.UTC(2026, 9, 6, 12);

function databaseFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni-conversation-retention-'));
  directories.push(directory);
  return join(directory, 'website.sqlite');
}

/** Completes `turns` visitor turns on the draft's conversation and returns the operation ids. */
function converse(store: WebsiteStore, claimHash: string, turns: number, at = day): string[] {
  const ids: string[] = [];
  for (let turn = 1; turn <= turns; turn += 1) {
    const admitted = store.admitConversationOperation({
      claimHash,
      sourceHash: `source-${claimHash}`,
      idempotencyKey: `key-${claimHash}-${String(turn)}`,
      bodyHash: `hash-${String(turn)}`,
      message: `secret visitor text ${String(turn)}`,
      initial: turn === 1,
      promptVersion: 'puni-sales-v1',
      pricing: { kind: 'paid', price: () => 1_000 },
      now: at + turn,
    });
    if (admitted.kind !== 'started') throw new Error(admitted.kind);
    if (
      !store.completeConversationOperation(
        admitted.id,
        `secret reply ${String(turn)}`,
        400,
        at + turn,
        false,
      )
    )
      throw new Error('Completion refused');
    ids.push(admitted.id);
  }
  return ids;
}

function query<T>(databasePath: string, sql: string): T[] {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.query<T, []>(sql).all();
  } finally {
    database.close();
  }
}

test('conversation content makes a draft-linked request content-bearing in the report', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  store.createDraft(
    'draft-1',
    'secret description',
    'claim-1',
    day,
    day + 1_000_000,
    'source-test',
  );
  converse(store, 'claim-1', 1);
  store.close();
  const database = new Database(databasePath);
  database.run("UPDATE conversation_operation SET message = '', reply = ''");
  database.run(
    "INSERT INTO prospect_account (id, email, created_at) VALUES ('a', 'a@example.test', 1)",
  );
  database.run(
    "INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at) VALUES ('r', 'a', 'draft-1', '', '', 5)",
  );
  database.close();
  // Proof: removing the conversation_turn branch from requestHasContent reported 0 uncovered here.
  expect(inspectRequestRetention(databasePath, day).softwareRequest.uncovered).toBe(1);
});

test('a request attached from a draft with conversation turns anchors to the draft', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  store.createDraft(
    'draft-1',
    'secret description',
    'claim-1',
    day,
    day + 1_000_000,
    'source-test',
  );
  converse(store, 'claim-1', 2);
  const account = store.createProspect('owner@example.test', day + 100);
  expect(store.attachDraft(account.id, 'claim-1', day + 100)).toBe(true);
  store.close();
  const subjects = () =>
    query<{ resolution: string; anchor_at: number | null; anchor_source: string | null }>(
      databasePath,
      "SELECT resolution, anchor_at, anchor_source FROM retention_subject WHERE subject_kind = 'software_request'",
    );
  expect(subjects()).toEqual([{ resolution: 'anchored', anchor_at: day, anchor_source: 'draft' }]);
  const database = new Database(databasePath);
  database.run('DELETE FROM retention_subject');
  database.close();
  new WebsiteStore(databasePath).close();
  expect(subjects()).toEqual([{ resolution: 'anchored', anchor_at: day, anchor_source: 'draft' }]);
  expect(inspectRequestRetention(databasePath, day).softwareRequest.ambiguous).toBe(0);
});

test('erasure blanks a due subject conversation and keeps its accounting', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  store.createDraft(
    'draft-1',
    'secret description',
    'claim-1',
    day,
    day + 1_000_000,
    'source-test',
  );
  converse(store, 'claim-1', 2);
  store.submit(
    'claim-1',
    'proposal-key-1',
    'hash',
    'a@example.test',
    'brief',
    'receipt',
    day + 10,
    'source-test',
  );
  store.close();
  const due = addUtcMonths(day, 12);
  expect(inspectRequestRetention(databasePath, due).proposalSubmission.due).toBe(1);
  const accounting =
    'SELECT stage, prompt_version, utc_day, reserved_micro_usd, settled_micro_usd FROM conversation_operation ORDER BY rowid';
  const before = query(databasePath, accounting);
  const database = new Database(databasePath);
  database.transaction(() => {
    eraseConversationContent(database, 'draft-1');
  })();
  database.close();
  // Proof: dropping the conversation_turn update in eraseConversationContent left turn text here.
  expect(
    query<{ text: string }>(
      databasePath,
      "SELECT content AS text FROM conversation_turn UNION ALL SELECT message FROM conversation_operation UNION ALL SELECT coalesce(reply, '') FROM conversation_operation",
    ).filter(({ text }) => text !== ''),
  ).toEqual([]);
  expect(query(databasePath, accounting)).toEqual(before);
  expect(query(databasePath, 'SELECT source_hash, state FROM conversation')).toEqual([
    { source_hash: 'source-claim-1', state: 'handed_off' },
  ]);
});

test('the expired-draft purge removes earlier days and retains unknown usage blanked', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  store.createDraft('draft-a', 'secret a', 'claim-a', day, day + 1_000, 'source-test');
  store.createDraft('draft-b', 'secret b', 'claim-b', day, day + 1_000, 'source-test');
  converse(store, 'claim-a', 2);
  converse(store, 'claim-b', 1);
  const unknown = store.admitConversationOperation({
    claimHash: 'claim-b',
    sourceHash: 'source-claim-b',
    idempotencyKey: 'key-b-unknown',
    bodyHash: 'hash-unknown',
    message: 'secret unsettled text',
    initial: false,
    promptVersion: 'puni-sales-v1',
    pricing: { kind: 'paid', price: () => 1_000 },
    now: day + 10,
  });
  if (unknown.kind !== 'started') throw new Error(unknown.kind);
  store.markConversationOperationUnknown(unknown.id);
  store.close();

  const cutoff = day + 86_400_000;
  const plan = inspectExpiredDrafts(databasePath, cutoff);
  expect(plan).toMatchObject({
    eligibleDrafts: 2,
    retainedDrafts: 1,
    conversations: 1,
    conversationTurns: 6,
    completedOperations: 3,
    retainedOperations: 1,
  });
  expect(JSON.stringify(plan)).not.toContain('secret');
  expect(purgeExpiredDrafts(databasePath, cutoff, plan.fingerprint, cutoff)).toEqual({
    deletedDrafts: 1,
    retainedDrafts: 1,
    deletedConversations: 1,
    deletedConversationTurns: 6,
    deletedConversationOperations: 3,
    retainedOperations: 1,
  });
  expect(query(databasePath, 'SELECT id, description, brief FROM intake_draft')).toEqual([
    { id: 'draft-b', description: '', brief: '' },
  ]);
  expect(
    query(databasePath, "SELECT count(*) AS count FROM conversation WHERE draft_id = 'draft-a'"),
  ).toEqual([{ count: 0 }]);
  expect(query(databasePath, 'SELECT count(*) AS count FROM conversation_turn')).toEqual([
    { count: 0 },
  ]);
  expect(
    query(
      databasePath,
      'SELECT state, message, reply, reserved_micro_usd, settled_micro_usd FROM conversation_operation',
    ),
  ).toEqual([
    {
      state: 'unknown',
      message: '',
      reply: null,
      reserved_micro_usd: 1_000,
      settled_micro_usd: 1_000,
    },
  ]);
  expect(inspectExpiredDrafts(databasePath, cutoff).eligibleDrafts).toBe(0);
});

test('the purge keeps the cutoff day’s completed operations as blanked accounting rows', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  store.createDraft('draft-a', 'secret a', 'claim-a', day, day + 1_000, 'source-test');
  converse(store, 'claim-a', 2);
  store.close();
  const spend =
    "SELECT COALESCE(SUM(COALESCE(settled_micro_usd, reserved_micro_usd)), 0) AS total FROM conversation_operation WHERE utc_day = '2026-10-06'";
  const cutoff = day + 2_000;
  const plan = inspectExpiredDrafts(databasePath, cutoff);
  expect(plan).toMatchObject({
    eligibleDrafts: 1,
    retainedDrafts: 1,
    conversations: 0,
    conversationTurns: 4,
    completedOperations: 0,
    retainedOperations: 2,
  });
  expect(purgeExpiredDrafts(databasePath, cutoff, plan.fingerprint, cutoff)).toMatchObject({
    deletedDrafts: 0,
    retainedDrafts: 1,
    deletedConversationOperations: 0,
    retainedOperations: 2,
  });
  expect(query(databasePath, spend)).toEqual([{ total: 800 }]);
  expect(query(databasePath, 'SELECT state, message, reply FROM conversation_operation')).toEqual([
    { state: 'completed', message: '', reply: '' },
    { state: 'completed', message: '', reply: '' },
  ]);
  expect(query(databasePath, 'SELECT description, brief FROM intake_draft')).toEqual([
    { description: '', brief: '' },
  ]);
});
