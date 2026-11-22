import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import type { ConversationAdmissionRequest } from './conversation-store';
import { fenceSubject, WebsiteStore } from './store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const day = Date.UTC(2026, 10, 22, 12);

function databaseFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni-submitted-'));
  directories.push(directory);
  return join(directory, 'website.sqlite');
}

function ask(
  idempotencyKey: string,
  message: string,
  overrides: Partial<ConversationAdmissionRequest> = {},
): ConversationAdmissionRequest {
  return {
    claimHash: 'claim',
    sourceHash: 'source',
    idempotencyKey,
    bodyHash: `hash:${message}`,
    message,
    initial: false,
    answer: { message },
    promptVersion: 'puni-scoping-v12',
    pricing: { kind: 'paid', price: () => 1_000 },
    browserCheck: 'verified',
    now: day,
    ...overrides,
  };
}

/** A draft with one completed opening turn; a scoped opening reply asks a question, no brief. */
function scopedFixture(version: 'scoped' | 'legacy' = 'scoped') {
  const path = databaseFile();
  const store = new WebsiteStore(path);
  store.createDraft(
    'draft',
    'Opening',
    'claim',
    day,
    day + 86_400_000,
    'source',
    version === 'scoped'
      ? { version: 1, startConversation: true, startingChoice: 'launch' }
      : undefined,
  );
  const opening = store.admitConversationOperation(
    ask(version === 'scoped' ? 'initial:draft' : 'initial-key', 'Opening', {
      initial: true,
      answer: undefined,
      ...(version === 'legacy' ? { promptVersion: 'puni-sales-v3' } : {}),
    }),
  );
  if (opening.kind !== 'started') throw new Error(`Opening was ${opening.kind}`);
  const completed =
    version === 'scoped'
      ? store.completeScopingConversationOperation(
          opening.id,
          { version: 1, message: 'Tell me more.', nextQuestionId: null, brief: null },
          500,
          day + 1,
        )
      : store.completeConversationOperation(opening.id, 'Hello', 500, day + 1, false);
  if (!completed) throw new Error('Opening did not complete');
  return { path, store, conversationId: opening.conversationId };
}

function submit(store: WebsiteStore, key = 'proposal-key', now = day + 10) {
  return store.submit(
    'claim',
    key,
    'body-hash',
    'visitor@example.test',
    'First brief',
    'receipt-1',
    now,
    'source',
  );
}

test('a submitted scoped draft keeps its conversation and lists follow-ups for the operator', () => {
  const { path, store, conversationId } = scopedFixture();
  expect(submit(store)).toEqual({ kind: 'created', receipt: 'receipt-1', siteCount: 1 });
  expect(store.findDraft('claim', day + 11)).toBeNull();
  expect(store.findConversationDraft('claim', day + 11)).toMatchObject({
    id: 'draft',
    submission: { turnsBefore: 2 },
  });
  expect(store.findConversation('draft')).toMatchObject({ state: 'open' });

  const followUp = store.admitConversationOperation(
    ask('after-1', 'One more thing', { now: day + 20 }),
  );
  expect(followUp).toMatchObject({ kind: 'started', conversationId });
  if (followUp.kind !== 'started') throw new Error('Follow-up was not admitted');
  expect(followUp.context.submitted).toBe(true);
  expect(
    store.completeScopingConversationOperation(
      followUp.id,
      { version: 1, message: 'Noted.', nextQuestionId: null, brief: 'A revised brief' },
      500,
      day + 21,
    ),
  ).toBe(true);
  expect(store.listConversationTurns(conversationId).map(({ content }) => content)).toEqual([
    'Opening',
    'Tell me more.',
    'One more thing',
    'Noted.',
  ]);
  const database = new Database(path, { readonly: true });
  expect(database.query('SELECT brief FROM intake_draft').get()).toEqual({ brief: '' });
  expect(database.query('SELECT brief FROM proposal_submission').get()).toEqual({
    brief: 'First brief',
  });
  database.close();
  expect(store.listSubmissions()[0]?.followUps).toEqual(['One more thing']);
  store.close();
});

test('a submitted draft refuses a second submission and still replays the first', () => {
  const { path, store } = scopedFixture();
  submit(store);
  const followUp = store.admitConversationOperation(ask('after-1', 'Later', { now: day + 20 }));
  if (followUp.kind !== 'started') throw new Error('Follow-up was not admitted');
  expect(submit(store, 'second-key', day + 30)).toEqual({ kind: 'submitted' });
  expect(submit(store, 'proposal-key', day + 30)).toEqual({
    kind: 'replayed',
    receipt: 'receipt-1',
  });
  const database = new Database(path, { readonly: true });
  expect(database.query('SELECT count(*) AS count FROM proposal_submission').get()).toEqual({
    count: 1,
  });
  database.close();
  store.close();
});

test('the visitor-turn allowance still exhausts a submitted conversation', () => {
  const { store } = scopedFixture();
  submit(store);
  for (let turn = 2; turn <= 8; turn++) {
    const admitted = store.admitConversationOperation(
      ask(`after-${String(turn)}`, `Turn ${String(turn)}`, { now: day + 20 + turn }),
    );
    if (admitted.kind !== 'started') throw new Error(`Turn ${String(turn)} was ${admitted.kind}`);
    store.completeScopingConversationOperation(
      admitted.id,
      { version: 1, message: 'Ok.', nextQuestionId: null, brief: null },
      500,
      day + 21 + turn,
    );
  }
  expect(store.admitConversationOperation(ask('after-9', 'Ninth', { now: day + 40 }))).toEqual({
    kind: 'exhausted',
    reason: 'turns',
  });
  expect(store.findConversation('draft')).toMatchObject({
    state: 'exhausted',
    exhaustedReason: 'turns',
  });
  store.close();
});

test('a fenced submission refuses new conversation work on its draft', () => {
  const { path, store } = scopedFixture();
  submit(store);
  const inflight = store.admitConversationOperation(ask('after-1', 'Later', { now: day + 20 }));
  if (inflight.kind !== 'started') throw new Error('Follow-up was not admitted');
  const database = new Database(path);
  const submission = database.query<{ id: string }, []>('SELECT id FROM proposal_submission').get();
  if (!submission) throw new Error('Missing submission');
  // A fence written without the operation fence, as a racing settlement would see it.
  database
    .query(
      "UPDATE retention_subject SET erasure_state = 'fenced' WHERE subject_kind = 'proposal_submission' AND subject_id = ?",
    )
    .run(submission.id);
  expect(
    store.completeScopingConversationOperation(
      inflight.id,
      { version: 1, message: 'Noted.', nextQuestionId: null, brief: null },
      500,
      day + 21,
    ),
  ).toBe(false);
  database
    .query(
      "UPDATE retention_subject SET erasure_state = 'none' WHERE subject_kind = 'proposal_submission' AND subject_id = ?",
    )
    .run(submission.id);
  fenceSubject(database, { kind: 'proposal_submission', id: submission.id });
  database.close();
  expect(store.admitConversationOperation(ask('after-2', 'Again', { now: day + 30 }))).toEqual({
    kind: 'draft_unavailable',
  });
  expect(store.findConversationDraft('claim', day + 30)).toBeNull();
  store.close();
});

test('a submitted legacy draft keeps its closed conversation', () => {
  const { store } = scopedFixture('legacy');
  submit(store);
  expect(
    store.admitConversationOperation(
      ask('after-1', 'Later', { now: day + 20, answer: undefined, promptVersion: 'puni-sales-v3' }),
    ),
  ).toEqual({ kind: 'draft_unavailable' });
  expect(store.findConversationDraft('claim', day + 20)).toBeNull();
  store.close();
});

test('a conversation an earlier binary handed off reopens on its next admitted turn', () => {
  const { path, store, conversationId } = scopedFixture();
  submit(store);
  const database = new Database(path);
  database.run("UPDATE conversation SET state = 'handed_off'");
  database.close();
  expect(
    store.admitConversationOperation(ask('after-1', 'Later', { now: day + 20 })),
  ).toMatchObject({ kind: 'started', conversationId });
  expect(store.findConversation('draft')).toMatchObject({ state: 'open' });
  store.close();
});
