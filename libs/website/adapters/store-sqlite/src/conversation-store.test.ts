import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import type { ConversationAdmissionRequest, ConversationPricing } from './conversation-store';
import { websiteMigrations } from './migration-catalogue';
import { WebsiteStore } from './store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const day = Date.UTC(2026, 9, 6, 12);

function databaseFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni-conversation-'));
  directories.push(directory);
  return join(directory, 'website.sqlite');
}

function paid(amount: number): ConversationPricing {
  return { kind: 'paid', price: () => amount };
}

function ask(
  claimHash: string,
  idempotencyKey: string,
  message: string,
  overrides: Partial<ConversationAdmissionRequest> = {},
): ConversationAdmissionRequest {
  return {
    claimHash,
    sourceHash: 'source-a',
    idempotencyKey,
    bodyHash: `hash:${message}`,
    message,
    initial: false,
    promptVersion: 'puni-sales-v1',
    pricing: paid(1_000),
    now: day,
    ...overrides,
  };
}

function started(store: WebsiteStore, request: ConversationAdmissionRequest): string {
  const admitted = store.admitConversationOperation(request);
  if (admitted.kind !== 'started') throw new Error(`Expected started, got ${admitted.kind}`);
  return admitted.id;
}

/** Runs one completed visitor turn and returns its operation id. */
function converse(
  store: WebsiteStore,
  claimHash: string,
  turn: number,
  overrides: Partial<ConversationAdmissionRequest> = {},
): string {
  const id = started(
    store,
    ask(claimHash, `key-${claimHash}-${String(turn)}`, `message ${String(turn)}`, {
      initial: turn === 1,
      ...overrides,
    }),
  );
  const reservation = overrides.pricing?.kind === 'free' ? null : 500;
  if (!store.completeConversationOperation(id, `reply ${String(turn)}`, reservation, day, false))
    throw new Error('Completion refused');
  return id;
}

function rows<T>(databasePath: string, sql: string): T[] {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.query<T, []>(sql).all();
  } finally {
    database.close();
  }
}

test('migration 007 applies forward and its down.sql restores the exact 006 schema', () => {
  const databasePath = databaseFile();
  new WebsiteStore(databasePath).close();
  expect(
    rows<{ name: string }>(
      databasePath,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'conversation%' ORDER BY name",
    ).map(({ name }) => name),
  ).toEqual(['conversation', 'conversation_operation', 'conversation_turn']);
  const expected = new Database(':memory:');
  const database = new Database(databasePath);
  try {
    expected.run('CREATE TABLE schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
    for (const migration of websiteMigrations().filter(({ name }) => name < '007'))
      expected.run(readFileSync(join(migration.directory, 'migration.sql'), 'utf8'));
    const migration = websiteMigrations().find(({ name }) => name === '007_conversation');
    if (!migration) throw new Error('Missing migration 007');
    database.run(readFileSync(join(migration.directory, 'down.sql'), 'utf8'));
    const schema =
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name";
    expect(database.query(schema).all()).toEqual(expected.query(schema).all());
  } finally {
    database.close();
    expected.close();
  }
});

test('restart marks in-flight conversation operations unknown and holds the conversation', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', day, day + 1_000_000);
  started(store, ask('claim-1', 'initial:draft-1', 'Build a booking app', { initial: true }));
  store.close();
  // Proof: deleting the startup recovery in WebsiteStore made this read `inflight`.
  new WebsiteStore(databasePath).close();
  expect(rows(databasePath, 'SELECT state FROM conversation_operation')).toEqual([
    { state: 'unknown' },
  ]);
  expect(rows(databasePath, 'SELECT state, exhausted_reason FROM conversation')).toEqual([
    { state: 'exhausted', exhausted_reason: 'unsettled' },
  ]);
});

test('admission replays, conflicts, refuses in-flight and orders the initial operation', () => {
  const store = new WebsiteStore(databaseFile());
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', day, day + 1_000_000);
  expect(store.admitConversationOperation(ask('claim-1', 'later-key-1', 'Too early'))).toEqual({
    kind: 'initial_required',
  });
  const initial = ask('claim-1', 'initial:draft-1', 'Build a booking app', { initial: true });
  const first = store.admitConversationOperation(initial);
  expect(first).toMatchObject({ kind: 'started', stage: 'clarify', history: [] });
  expect(store.admitConversationOperation(initial)).toEqual({ kind: 'inflight' });
  expect(store.admitConversationOperation(ask('claim-1', 'other-key-1', 'Parallel'))).toEqual({
    kind: 'initial_required',
  });
  if (first.kind !== 'started') throw new Error('unreachable');
  expect(store.completeConversationOperation(first.id, 'Who uses it?', 900, day, false)).toBe(true);
  expect(store.admitConversationOperation(initial)).toEqual({
    kind: 'completed',
    reply: 'Who uses it?',
  });
  expect(
    store.admitConversationOperation({ ...initial, bodyHash: 'hash:changed description' }),
  ).toEqual({ kind: 'conflict' });
  const second = ask('claim-1', 'later-key-2', 'Volunteers');
  expect(store.admitConversationOperation(second)).toMatchObject({
    kind: 'started',
    stage: 'clarify',
    history: [
      { role: 'user', content: 'Build a booking app' },
      { role: 'assistant', content: 'Who uses it?' },
    ],
  });
  expect(store.admitConversationOperation({ ...second, bodyHash: 'hash:other' })).toEqual({
    kind: 'conflict',
  });
  expect(store.admitConversationOperation(ask('claim-1', 'later-key-3', 'Third'))).toEqual({
    kind: 'inflight',
  });
  const replacement = ask('claim-1', 'browser-initial-2', 'Build a booking app', {
    initial: true,
  });
  expect(store.admitConversationOperation(replacement)).toEqual({ kind: 'turn_limit' });
  store.close();
});

test('stages follow completed visitor turns and the ninth turn exhausts the conversation', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', day, day + 1_000_000);
  const stages: string[] = [];
  for (let turn = 1; turn <= 8; turn += 1) {
    const admitted = store.admitConversationOperation(
      ask('claim-1', `key-claim-1-${String(turn)}`, `message ${String(turn)}`, {
        initial: turn === 1,
      }),
    );
    if (admitted.kind !== 'started') throw new Error(admitted.kind);
    stages.push(admitted.stage);
    store.completeConversationOperation(admitted.id, `reply ${String(turn)}`, 500, day, false);
  }
  expect(stages).toEqual([
    'clarify',
    'clarify',
    'brief',
    'contact',
    'contact',
    'contact',
    'contact',
    'contact',
  ]);
  expect(
    store.admitConversationOperation(ask('claim-1', 'key-claim-1-8', 'message 8')),
  ).toMatchObject({ kind: 'completed' });
  expect(store.admitConversationOperation(ask('claim-1', 'key-ninth-1', 'Ninth'))).toEqual({
    kind: 'exhausted',
    reason: 'turns',
  });
  expect(store.findConversation('draft-1')).toMatchObject({
    state: 'exhausted',
    exhaustedReason: 'turns',
  });
  expect(
    rows(databasePath, "SELECT count(*) AS count FROM conversation_turn WHERE role = 'user'"),
  ).toEqual([{ count: 8 }]);
  store.close();
});

test('a closed provider admits no new conversation or operation but still replays', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', day, day + 1_000_000);
  store.createDraft('draft-2', 'Build a dashboard', 'claim-2', day, day + 1_000_000);
  converse(store, 'claim-1', 1);
  const closed: ConversationPricing = { kind: 'closed' };
  expect(
    store.admitConversationOperation(
      ask('claim-2', 'initial:draft-2', 'Build a dashboard', { initial: true, pricing: closed }),
    ),
  ).toEqual({ kind: 'provider_unavailable' });
  expect(store.findConversation('draft-2')).toBeNull();
  expect(
    store.admitConversationOperation(
      ask('claim-1', 'key-claim-1-1', 'message 1', { initial: true, pricing: closed }),
    ),
  ).toEqual({ kind: 'completed', reply: 'reply 1' });
  expect(
    store.admitConversationOperation(ask('claim-1', 'new-key-1', 'More', { pricing: closed })),
  ).toEqual({ kind: 'provider_unavailable' });
  expect(store.admitConversationOperation(ask('claim-x', 'key-x-1', 'Lost'))).toEqual({
    kind: 'draft_unavailable',
  });
  store.close();
});

test('per-conversation and per-source spend ceilings exhaust with their reasons', () => {
  const store = new WebsiteStore(databaseFile());
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', day, day + 1_000_000);
  const first = started(
    store,
    ask('claim-1', 'initial:draft-1', 'Build a booking app', {
      initial: true,
      pricing: paid(100_000),
    }),
  );
  store.completeConversationOperation(first, 'reply', 100_000, day, false);
  expect(
    store.admitConversationOperation(
      ask('claim-1', 'key-2-xxxx', 'Two', { pricing: paid(60_000) }),
    ),
  ).toEqual({ kind: 'exhausted', reason: 'conversation_spend' });

  for (const index of [2, 3, 4, 5]) {
    store.createDraft(
      `draft-${String(index)}`,
      'Request',
      `claim-${String(index)}`,
      day,
      day + 1_000_000,
    );
  }
  // draft-1 is the source's first conversation today, so draft-2 and draft-3 make three.
  converse(store, 'claim-2', 1);
  converse(store, 'claim-3', 1);
  expect(
    store.admitConversationOperation(
      ask('claim-4', 'initial:draft-4', 'Request', { initial: true }),
    ),
  ).toEqual({ kind: 'exhausted', reason: 'source_spend' });
  expect(store.findConversation('draft-4')).toMatchObject({
    state: 'exhausted',
    exhaustedReason: 'source_spend',
  });
  // Proof: counting every same-day conversation instead of earlier ones refused this one.
  expect(store.admitConversationOperation(ask('claim-2', 'key-2-turn-2', 'More'))).toMatchObject({
    kind: 'started',
  });
  expect(
    store.admitConversationOperation(
      ask('claim-5', 'initial:draft-5', 'Request', {
        initial: true,
        sourceHash: 'source-b',
        pricing: paid(300_001),
      }),
    ),
  ).toEqual({ kind: 'exhausted', reason: 'source_spend' });
  store.close();
});

test('the site-day ceiling and unsettled-call count are shared with account reservations', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  const account = store.createProspect('owner@example.test', day);
  store.ensureBlankRequest(account.id, day);
  const request = store.findAccountRequest(account.id);
  if (!request) throw new Error('Missing account request');
  const callId = store.reserveProviderCall(account.id, request.id, 400_000, day);
  if (!callId) throw new Error('Account reservation refused');
  const database = new Database(databasePath);
  database.run(
    'UPDATE provider_call SET reserved_micro_usd = 9_999_000, settled_micro_usd = 9_999_000',
  );
  database.close();
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', day, day + 1_000_000);
  expect(
    store.admitConversationOperation(
      ask('claim-1', 'initial:draft-1', 'Build a booking app', {
        initial: true,
        pricing: paid(1_001),
      }),
    ),
  ).toEqual({ kind: 'exhausted', reason: 'site_spend' });

  store.createDraft('draft-2', 'Request', 'claim-2', day, day + 1_000_000);
  started(
    store,
    ask('claim-2', 'initial:draft-2', 'Request', {
      initial: true,
      sourceHash: 'source-b',
      pricing: paid(900),
    }),
  );
  const shared = new Database(databasePath);
  shared.run('UPDATE provider_call SET reserved_micro_usd = 400_000, settled_micro_usd = 400_000');
  shared.run('UPDATE conversation_operation SET reserved_micro_usd = 9_599_900');
  shared.close();
  // Anonymous reservations fill the same site day for the account path.
  expect(store.reserveProviderCall(account.id, request.id, 200, day)).toBeNull();

  const unsettled = new Database(databasePath);
  unsettled.run('UPDATE provider_call SET reserved_micro_usd = 10, settled_micro_usd = NULL');
  unsettled.run('UPDATE conversation_operation SET reserved_micro_usd = 900');
  unsettled.close();
  for (const index of [3, 4]) {
    store.createDraft(`draft-${String(index)}`, 'R', `claim-${String(index)}`, day, day + 1e6);
    started(
      store,
      ask(`claim-${String(index)}`, `initial:draft-${String(index)}`, 'R', {
        initial: true,
        sourceHash: `source-${String(index)}`,
      }),
    );
  }
  store.createDraft('draft-5', 'R', 'claim-5', day, day + 1e6);
  expect(
    store.admitConversationOperation(
      ask('claim-5', 'initial:draft-5', 'R', { initial: true, sourceHash: 'source-5' }),
    ),
  ).toEqual({ kind: 'busy' });
  expect(store.findConversation('draft-5')).toMatchObject({ state: 'open' });
  store.close();
});

test('two processes racing for the last site-day reservation leave exactly one', async () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  const account = store.createProspect('owner@example.test', day);
  store.ensureBlankRequest(account.id, day);
  const request = store.findAccountRequest(account.id);
  if (!request) throw new Error('Missing account request');
  store.reserveProviderCall(account.id, request.id, 1, day);
  store.createDraft('draft-1', 'R', 'claim-1', day, day + 1e6);
  store.createDraft('draft-2', 'R', 'claim-2', day, day + 1e6);
  store.close();
  const seed = new Database(databasePath);
  seed.run(
    'UPDATE provider_call SET reserved_micro_usd = 9_990_000, settled_micro_usd = 9_990_000',
  );
  seed.close();
  const writerPath = join(databasePath, '..', 'writer.ts');
  writeFileSync(
    writerPath,
    `import { WebsiteStore } from ${JSON.stringify(join(import.meta.dir, 'store.ts'))};
const [databasePath, claim, startAt] = Bun.argv.slice(2);
const store = new WebsiteStore(databasePath);
while (Date.now() < Number(startAt)) {}
const admitted = store.admitConversationOperation({
  claimHash: claim, sourceHash: claim, idempotencyKey: 'initial-' + claim, bodyHash: 'h',
  message: 'R', initial: true, promptVersion: 'v', now: ${String(day)},
  pricing: { kind: 'paid', price: () => 6_000 },
});
console.log(admitted.kind);
store.close();
`,
  );
  const startAt = Date.now() + 1500;
  const writers = ['claim-1', 'claim-2'].map((claim) =>
    Bun.spawn(['bun', writerPath, databasePath, claim, String(startAt)], {
      stdout: 'pipe',
      stderr: 'pipe',
    }),
  );
  const exits = await Promise.all(writers.map((writer) => writer.exited));
  const outputs = await Promise.all(writers.map((writer) => new Response(writer.stdout).text()));
  expect(exits).toEqual([0, 0]);
  expect(outputs.map((output) => output.trim()).sort()).toEqual(['exhausted', 'started']);
  expect(rows(databasePath, 'SELECT count(*) AS count FROM conversation_operation')).toEqual([
    { count: 1 },
  ]);
});

test('completion settles within the reservation and adds both turns atomically', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', day, day + 1_000_000);
  const id = started(
    store,
    ask('claim-1', 'initial:draft-1', 'Build a booking app', { initial: true }),
  );
  expect(store.completeConversationOperation(id, 'Too dear', 1_001, day, false)).toBe(false);
  expect(store.completeConversationOperation(id, 'No usage', null, day, false)).toBe(false);
  expect(
    rows(databasePath, 'SELECT state, settled_micro_usd, reply FROM conversation_operation'),
  ).toEqual([{ state: 'inflight', settled_micro_usd: null, reply: null }]);
  expect(store.listConversationTurns(store.findConversation('draft-1')?.id ?? '')).toEqual([]);

  const database = new Database(databasePath);
  database.run(
    "CREATE TRIGGER refuse_turn BEFORE INSERT ON conversation_turn BEGIN SELECT RAISE(ABORT, 'turn insert refused'); END",
  );
  database.close();
  expect(() => store.completeConversationOperation(id, 'Who uses it?', 900, day, false)).toThrow(
    'turn insert refused',
  );
  // Proof: settling before the transaction left settled_micro_usd 900 with no turns here.
  expect(rows(databasePath, 'SELECT state, settled_micro_usd FROM conversation_operation')).toEqual(
    [{ state: 'inflight', settled_micro_usd: null }],
  );
  const repaired = new Database(databasePath);
  repaired.run('DROP TRIGGER refuse_turn');
  repaired.close();
  expect(store.completeConversationOperation(id, 'Who uses it?', 900, day, true)).toBe(true);
  expect(
    rows(databasePath, 'SELECT state, settled_micro_usd, truncated FROM conversation_operation'),
  ).toEqual([{ state: 'completed', settled_micro_usd: 900, truncated: 1 }]);
  expect(store.completeConversationOperation(id, 'Again', 900, day, false)).toBe(false);
  store.close();
});

test('unknown usage holds the conversation and a demo operation settles without usage', () => {
  const store = new WebsiteStore(databaseFile());
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', day, day + 1_000_000);
  const id = started(
    store,
    ask('claim-1', 'initial:draft-1', 'Build a booking app', { initial: true }),
  );
  expect(store.markConversationOperationUnknown(id)).toBe(true);
  expect(store.markConversationOperationUnknown(id)).toBe(false);
  expect(store.completeConversationOperation(id, 'Late', 500, day, false)).toBe(false);
  expect(store.admitConversationOperation(ask('claim-1', 'key-later-1', 'Later'))).toEqual({
    kind: 'exhausted',
    reason: 'unsettled',
  });

  store.createDraft('draft-2', 'R', 'claim-2', day, day + 1_000_000);
  const free = started(
    store,
    ask('claim-2', 'initial:draft-2', 'R', { initial: true, pricing: { kind: 'free' } }),
  );
  expect(store.completeConversationOperation(free, 'Simulated', 10, day, false)).toBe(false);
  expect(store.completeConversationOperation(free, 'Simulated', null, day, false)).toBe(true);
  store.close();
});

test('the brief reply becomes the draft brief unless the visitor saved one', () => {
  const store = new WebsiteStore(databaseFile());
  for (const index of [1, 2])
    store.createDraft(`draft-${String(index)}`, 'R', `claim-${String(index)}`, day, day + 1e6);
  for (const claim of ['claim-1', 'claim-2']) {
    converse(store, claim, 1);
    converse(store, claim, 2);
  }
  expect(store.updateBrief('claim-2', 'My own brief', day)).toBe(true);
  for (const claim of ['claim-1', 'claim-2']) {
    const id = started(store, ask(claim, `brief-key-${claim}`, 'Third answer'));
    store.completeConversationOperation(id, '  Brief: a booking tool\n- users  ', 500, day, false);
  }
  expect(store.findDraft('claim-1', day)?.brief).toBe('Brief: a booking tool\n- users');
  // Proof: dropping the blank-brief predicate overwrote this saved brief.
  expect(store.findDraft('claim-2', day)?.brief).toBe('My own brief');
  store.close();
});

test('a proposal submission hands the conversation off with the claim', () => {
  const store = new WebsiteStore(databaseFile());
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', day, day + 1_000_000);
  converse(store, 'claim-1', 1);
  converse(store, 'claim-1', 2);
  expect(
    store.submit('claim-1', 'proposal-key-1', 'hash', 'a@example.test', 'brief', 'receipt', day),
  ).toEqual({ kind: 'created', receipt: 'receipt' });
  expect(store.findConversation('draft-1')).toMatchObject({
    state: 'handed_off',
    exhaustedReason: null,
  });
  expect(store.admitConversationOperation(ask('claim-1', 'after-key-1', 'More'))).toEqual({
    kind: 'draft_unavailable',
  });
  store.close();
});
