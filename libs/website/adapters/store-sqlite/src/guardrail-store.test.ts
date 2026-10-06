import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { conversationAllowance, guardrailAllowance, WebsiteStore } from './store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const day = Date.UTC(2026, 9, 7, 12);
const hour = 60 * 60_000;

function databaseFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni-guardrail-'));
  directories.push(directory);
  return join(directory, 'website.sqlite');
}

function count(databasePath: string, sql: string): number {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database.query<{ count: number }, []>(sql).get();
    if (!row) throw new Error('Count query returned no row');
    return row.count;
  } finally {
    database.close();
  }
}

function seedCount(
  databasePath: string,
  scope: string,
  keyHash: string,
  utcDay: string,
  value: number,
) {
  const database = new Database(databasePath);
  database
    .query(
      'INSERT INTO admission_count (scope, key_hash, utc_day, count) VALUES (?, ?, ?, ?) ON CONFLICT(scope, key_hash, utc_day) DO UPDATE SET count = excluded.count',
    )
    .run(scope, keyHash, utcDay, value);
  database.close();
}

function draft(store: WebsiteStore, index: number, source = 'source-a', now = day) {
  return store.createDraft(
    `draft-${String(index)}`,
    'Build a booking app',
    `claim-${String(index)}`,
    now,
    now + 24 * hour,
    source,
  );
}

test('the twenty-first draft from one source is refused and leaves no draft row', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  for (let index = 1; index <= 20; index += 1) expect(draft(store, index).kind).toBe('created');
  // Proof: dropping `WHERE count < ?` from the conditional upsert inserted this 21st draft.
  expect(draft(store, 21)).toEqual({ kind: 'draft_source_limit' });
  expect(count(databasePath, 'SELECT count(*) AS count FROM intake_draft')).toBe(20);
  expect(
    count(
      databasePath,
      "SELECT count AS count FROM admission_count WHERE scope = 'draft:source' AND key_hash = 'source-a'",
    ),
  ).toBe(20);
  expect(draft(store, 22, 'source-b')).toEqual({ kind: 'created', siteCount: 21 });
  store.close();
});

test('the site draft cap refuses every source once reached', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  seedCount(databasePath, 'draft:site', '*', '2026-10-07', 1_999);
  expect(draft(store, 1, 'source-a')).toEqual({ kind: 'created', siteCount: 2_000 });
  expect(draft(store, 2, 'source-b')).toEqual({ kind: 'draft_site_limit' });
  // The refused site count rolled back the source increment too.
  expect(
    count(
      databasePath,
      "SELECT COALESCE(SUM(count), 0) AS count FROM admission_count WHERE scope = 'draft:source' AND key_hash = 'source-b'",
    ),
  ).toBe(0);
  expect(count(databasePath, 'SELECT count(*) AS count FROM intake_draft')).toBe(1);
  store.close();
});

test('three proposals with one email in any case, from any source, refuse the fourth without a trace', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  const emails = [
    'Owner@Example.test',
    'owner@example.test',
    'OWNER@EXAMPLE.TEST',
    'owner@Example.TEST',
  ];
  emails.forEach((email, index) => {
    draft(store, index, `source-${String(index)}`);
  });
  for (const [index, email] of emails.slice(0, 3).entries())
    expect(
      store.submit(
        `claim-${String(index)}`,
        `key-${String(index)}-0000`,
        'hash',
        email,
        'brief',
        `r-${String(index)}`,
        day,
        `source-${String(index)}`,
      ).kind,
    ).toBe('created');
  const before = {
    submissions: count(databasePath, 'SELECT count(*) AS count FROM proposal_submission'),
    replays: count(databasePath, 'SELECT count(*) AS count FROM submission_replay'),
    subjects: count(databasePath, 'SELECT count(*) AS count FROM retention_subject'),
  };
  // Proof: counting in a separate transaction after the submit left a proposal_submission row here.
  expect(
    store.submit('claim-3', 'key-3-0000', 'hash', emails[3], 'brief', 'r-3', day, 'source-3'),
  ).toEqual({
    kind: 'limited',
    code: 'proposal_email_limit',
  });
  expect({
    submissions: count(databasePath, 'SELECT count(*) AS count FROM proposal_submission'),
    replays: count(databasePath, 'SELECT count(*) AS count FROM submission_replay'),
    subjects: count(databasePath, 'SELECT count(*) AS count FROM retention_subject'),
  }).toEqual(before);
  expect(store.findDraft('claim-3', day)).not.toBeNull();
  // The email key is salted, never the address itself.
  expect(
    count(
      databasePath,
      "SELECT count(*) AS count FROM admission_count WHERE key_hash LIKE '%example%'",
    ),
  ).toBe(0);
  store.close();
});

test('the source and site proposal caps refuse with their own codes', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  for (let index = 0; index < 7; index += 1) draft(store, index, 'source-a');
  for (let index = 0; index < 5; index += 1)
    expect(
      store.submit(
        `claim-${String(index)}`,
        `key-${String(index)}-0000`,
        'hash',
        `person${String(index)}@example.test`,
        'brief',
        `r-${String(index)}`,
        day,
        'source-a',
      ).kind,
    ).toBe('created');
  expect(
    store.submit('claim-5', 'key-5-0000', 'hash', 'p5@example.test', 'b', 'r-5', day, 'source-a'),
  ).toEqual({ kind: 'limited', code: 'proposal_source_limit' });
  seedCount(databasePath, 'proposal:site', '*', '2026-10-07', 200);
  expect(
    store.submit('claim-6', 'key-6-0000', 'hash', 'p6@example.test', 'b', 'r-6', day, 'source-b'),
  ).toEqual({ kind: 'limited', code: 'proposal_site_limit' });
  store.close();
});

test('a replayed proposal is not counted again', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  draft(store, 1);
  expect(
    store.submit('claim-1', 'key-1-0000', 'hash', 'a@example.test', 'b', 'r-1', day, 'source-a'),
  ).toEqual({ kind: 'created', receipt: 'r-1', siteCount: 1 });
  expect(
    store.submit('claim-1', 'key-1-0000', 'hash', 'a@example.test', 'b', 'r-2', day, 'source-a'),
  ).toEqual({ kind: 'replayed', receipt: 'r-1' });
  expect(
    count(
      databasePath,
      "SELECT count AS count FROM admission_count WHERE scope = 'proposal:source'",
    ),
  ).toBe(1);
  store.close();
});

test('the signed-in submission counts source and email', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  const account = store.createProspect('owner@example.test', day);
  for (let index = 0; index < 4; index += 1) {
    draft(store, index, `source-${String(index)}`);
    expect(store.attachDraft(account.id, `claim-${String(index)}`, day)).toBe(true);
    const outcome = store.submitAccount(
      account.id,
      `key-${String(index)}-0000`,
      'hash',
      'owner@example.test',
      'brief',
      `r-${String(index)}`,
      day,
      `source-${String(index)}`,
    );
    expect(outcome.kind).toBe(index < 3 ? 'created' : 'limited');
    if (index === 3) expect(outcome).toEqual({ kind: 'limited', code: 'proposal_email_limit' });
  }
  expect(count(databasePath, 'SELECT count(*) AS count FROM proposal_submission')).toBe(3);
  store.close();
});

test('two connections at the source cap insert exactly one draft', () => {
  const databasePath = databaseFile();
  const first = new WebsiteStore(databasePath);
  const second = new WebsiteStore(databasePath);
  seedCount(databasePath, 'draft:source', 'source-a', '2026-10-07', 19);
  const outcomes = [draft(first, 20), draft(second, 21)].map((outcome) => outcome.kind);
  expect(outcomes.sort()).toEqual(['created', 'draft_source_limit']);
  expect(count(databasePath, 'SELECT count(*) AS count FROM intake_draft')).toBe(1);
  expect(
    count(
      databasePath,
      "SELECT count AS count FROM admission_count WHERE scope = 'draft:source' AND key_hash = 'source-a'",
    ),
  ).toBe(20);
  first.close();
  second.close();
});

test('the salt sweep deletes counts from two days back and keeps yesterday', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  seedCount(databasePath, 'draft:site', '*', '2026-10-05', 3);
  seedCount(databasePath, 'draft:site', '*', '2026-10-06', 4);
  store.readSourceSalt('2026-10-07');
  const database = new Database(databasePath, { readonly: true });
  expect(
    database
      .query<{ utc_day: string }, []>('SELECT utc_day FROM admission_count ORDER BY utc_day')
      .all(),
  ).toEqual([{ utc_day: '2026-10-06' }]);
  database.close();
  store.close();
});

test('the pause and half-spend marks are 80% and 50% of the site-day ceiling', () => {
  expect<number>(guardrailAllowance.pauseMicroUsd).toBe(
    (conversationAllowance.siteDayMicroUsd * 4) / 5,
  );
  expect<number>(guardrailAllowance.halfSpendMicroUsd).toBe(
    conversationAllowance.siteDayMicroUsd / 2,
  );
});
