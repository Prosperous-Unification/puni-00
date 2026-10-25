import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { eraseConversationContent } from './conversation-store';
import { WebsiteStore } from './store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-reply-'));
  directories.push(directory);
  const path = join(directory, 'website.sqlite');
  const store = new WebsiteStore(path);
  store.createDraft('draft', 'Opening', 'claim', 10, 1000, 'source', {
    version: 1,
    startConversation: true,
    startingChoice: 'launch',
  });
  const request = {
    claimHash: 'claim',
    sourceHash: 'source',
    idempotencyKey: 'initial:draft',
    bodyHash: 'hash',
    message: 'Opening',
    initial: true,
    promptVersion: 'puni-scoping-v1',
    pricing: { kind: 'paid', price: () => 1000 } as const,
    browserCheck: 'verified' as const,
    now: 20,
  };
  const admitted = store.admitConversationOperation(request);
  if (admitted.kind !== 'started') throw new Error('Fixture admission failed');
  return { store, database: new Database(path), admitted, request };
}

test('known invalid output is replayable actual accounting without a capture; erasure keeps metadata only', () => {
  const { store, database, admitted, request } = fixture();
  expect(store.completeScopingConversationOperation(admitted.id, null, 50, 21)).toBe(true);
  expect(store.findLatestConversationOperation(admitted.conversationId)).toMatchObject({
    state: 'completed',
    replyFailure: 'invalid_scoping_reply',
  });
  expect(store.admitConversationOperation(request)).toMatchObject({
    kind: 'completed',
    replyVersion: null,
    replyFailure: 'invalid_scoping_reply',
  });
  expect(store.readFunnelCounts(21).days[0]?.briefsCaptured).toBe(0);
  eraseConversationContent(database, 'draft');
  expect(
    database
      .query(
        'SELECT reply, reply_version, reply_failure, settled_micro_usd FROM conversation_operation',
      )
      .get(),
  ).toEqual({
    reply: '',
    reply_version: null,
    reply_failure: 'invalid_scoping_reply',
    settled_micro_usd: 50,
  });
  expect(store.listConversationTurns(admitted.conversationId).map((turn) => turn.content)).toEqual([
    '',
    '',
  ]);
  expect(store.findLatestConversationOperation(admitted.conversationId)?.replyFailure).toBe(
    'invalid_scoping_reply',
  );
  database.close();
  store.close();
});

for (const corrupt of [
  "reply_failure = 'other'",
  "reply_failure = 'invalid_scoping_reply', reply_version = 1",
  "reply_failure = 'invalid_scoping_reply', state = 'unknown', settlement = 'reserved_ceiling', settled_micro_usd = reserved_micro_usd",
  "reply_failure = 'invalid_scoping_reply', state = 'inflight', settlement = NULL",
])
  test(`failure schema and reader refuse corrupt metadata: ${corrupt}`, () => {
    const { store, database, admitted } = fixture();
    store.completeScopingConversationOperation(admitted.id, null, 50, 21);
    expect(() => database.run(`UPDATE conversation_operation SET ${corrupt}`)).toThrow();
    database.run('PRAGMA ignore_check_constraints = ON');
    database.run(`UPDATE conversation_operation SET ${corrupt}`);
    expect(() => store.findLatestConversationOperation(admitted.conversationId)).toThrow(
      'Malformed conversation reply failure',
    );
    database.close();
    store.close();
  });

test('new brief capture counts once on its first day; accepted edits and submissions keep provenance', () => {
  const { store, database, admitted } = fixture();
  expect(
    store.completeScopingConversationOperation(
      admitted.id,
      { version: 1, message: 'Review', nextQuestionId: null, brief: 'First candidate' },
      50,
      21,
    ),
  ).toBe(true);
  expect(store.readFunnelCounts(21).days[0]?.briefsCaptured).toBe(1);
  expect(store.editScoping('claim', 1, { kind: 'accept_candidate' }, 22).kind).toBe('updated');
  const followup = store.admitConversationOperation({
    claimHash: 'claim',
    sourceHash: 'source',
    idempotencyKey: 'another-turn',
    bodyHash: 'next',
    message: 'Revise',
    answer: { message: 'Revise' },
    initial: false,
    promptVersion: 'puni-scoping-v1',
    pricing: { kind: 'paid', price: () => 1000 },
    browserCheck: 'absent',
    now: 23,
  });
  if (followup.kind !== 'started') throw new Error('Followup failed');
  store.completeScopingConversationOperation(
    followup.id,
    { version: 1, message: 'Review again', nextQuestionId: null, brief: 'Next candidate' },
    60,
    24,
  );
  expect(store.readFunnelCounts(24).days[0]?.briefsCaptured).toBe(1);
  expect(store.findDraft('claim', 25)?.brief).toBe('First candidate');
  database
    .query('UPDATE conversation_operation SET created_at = 86400000 WHERE id = ?')
    .run(followup.id);
  expect(
    store
      .readFunnelCounts(86400000)
      .days.slice(0, 2)
      .map((day) => day.briefsCaptured),
  ).toEqual([0, 1]);

  database.run(
    "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('sent', 'draft', 'a@example.test', 'First candidate', 'receipt', 'submitted', 30, 30)",
  );
  database.run(
    "UPDATE conversation SET state = 'handed_off'; UPDATE intake_draft SET consumed_at = 30",
  );
  expect(store.readFunnelCounts(30).days[0]).toMatchObject({
    briefsCaptured: 1,
    proposals: { fromChat: 1, manual: 0 },
  });
  database.close();
  store.close();
});

for (const lost of ['expired', 'consumed', 'missing'] as const)
  test(`known invalid reply refuses ${lost} draft ownership before settlement`, () => {
    const { store, database, admitted } = fixture();
    if (lost === 'expired') database.run('UPDATE intake_draft SET expires_at = 21');
    if (lost === 'consumed') database.run('UPDATE intake_draft SET consumed_at = 21');
    if (lost === 'missing') database.run('DELETE FROM intake_draft');
    expect(store.completeScopingConversationOperation(admitted.id, null, 50, 21)).toBe(false);
    expect(
      database.query('SELECT state, settled_micro_usd FROM conversation_operation').get(),
    ).toEqual({ state: 'inflight', settled_micro_usd: null });
    expect(store.listConversationTurns(admitted.conversationId)).toEqual([]);
    database.close();
    store.close();
  });
