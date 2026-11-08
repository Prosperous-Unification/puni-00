import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import type { ConversationAdmissionRequest } from './conversation-store';
import { websiteMigrations } from './migration-catalogue';
import { inspectExpiredDrafts, purgeExpiredDrafts, WebsiteStore } from './store';
import { seedLegacyAccount } from './testing/legacy-account-fixture';

const directories: string[] = [];
const stores: WebsiteStore[] = [];
const now = Date.UTC(2026, 10, 8, 12);
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'anonymous-admission-'));
  directories.push(directory);
  const path = join(directory, 'site.sqlite');
  const store = new WebsiteStore(path);
  stores.push(store);
  return { store, path };
}
function draft(store: WebsiteStore, claim: string, browser = claim, at = now) {
  store.registerBrowserClaim(browser, at);
  expect(
    store.createDraft(claim, 'Build a tool', claim, at, at + 172_800_000, claim, undefined, browser)
      .kind,
  ).toBe('created');
}
function ask(claim: string, source = claim, at = now, amount = 1000): ConversationAdmissionRequest {
  return {
    claimHash: claim,
    sourceHash: source,
    sourceHashes: [source],
    idempotencyKey: 'initial',
    bodyHash: 'body',
    message: 'Build a tool',
    initial: true,
    promptVersion: 'test',
    pricing: { kind: 'paid', price: () => amount },
    browserCheck: 'verified',
    now: at,
  };
}
function stop(store: WebsiteStore, request: ConversationAdmissionRequest) {
  const admission = store.admitConversationOperation(request);
  expect(admission.kind).toBe('started');
  if (admission.kind !== 'started') throw new Error('Expected started');
  expect(store.markConversationOperationUnknown(admission.id)).toBe(true);
  return admission;
}

test('ten interrupted paid attempts exhaust the eleventh without another reservation', () => {
  const { store } = fixture();
  draft(store, 'claim');
  for (let attempt = 0; attempt < 10; attempt++) stop(store, ask('claim'));
  expect(store.admitConversationOperation(ask('claim'))).toEqual({
    kind: 'exhausted',
    reason: 'conversation_spend',
  });
});

test('retained browser refuses fourth paid conversation despite changing source', () => {
  const { store } = fixture();
  for (let count = 0; count < 4; count++) {
    const claim = `claim-${String(count)}`;
    const at = now + count * 61_000;
    draft(store, claim, 'browser', at);
    if (count < 3) stop(store, ask(claim, claim, at));
    else expect(store.admitConversationOperation(ask(claim, claim, at)).kind).toBe('rate_limited');
  }
});

test('new browser keeps rolling source ceiling across midnight with yesterday hash', () => {
  const { store } = fixture();
  const midnight = Date.UTC(2026, 10, 9);
  for (let count = 0; count < 3; count++) {
    const claim = `claim-${String(count)}`;
    const at = midnight - (4 - count) * 61_000;
    draft(store, claim, claim, at);
    stop(store, ask(claim, 'yesterday', at));
  }
  draft(store, 'new-browser', 'new-browser', midnight + 1000);
  expect(
    store.admitConversationOperation({
      ...ask('new-browser', 'today', midnight + 1000),
      sourceHashes: ['today', 'yesterday'],
    }).kind,
  ).toBe('rate_limited');
});

test('rolling source and browser spend each refuse a reservation beyond thirty cents', () => {
  for (const scope of ['source', 'browser']) {
    const { store } = fixture();
    for (let count = 0; count < 3; count++) {
      const claim = `${scope}-${String(count)}`;
      const at = now + count * 61_000;
      draft(store, claim, scope === 'browser' ? scope : claim, at);
      const request = ask(claim, scope === 'source' ? scope : claim, at, 150_000);
      if (count < 2) stop(store, request);
      else expect(store.admitConversationOperation(request).kind).toBe('rate_limited');
    }
  }
});

test('durable one-minute source and browser bursts refuse without exhausting drafts', () => {
  for (const scope of ['source', 'browser']) {
    const { store, path } = fixture();
    draft(store, 'first', scope === 'browser' ? scope : 'first');
    stop(store, ask('first', scope === 'source' ? scope : 'first'));
    const other = new WebsiteStore(path);
    stores.push(other);
    draft(other, 'second', scope === 'browser' ? scope : 'second');
    const request = ask('second', scope === 'source' ? scope : 'second');
    expect(other.admitConversationOperation(request)).toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 60,
    });
    expect(other.findConversation('second')?.state).toBe('open');
    expect(other.admitConversationOperation({ ...request, now: now + 60_000 }).kind).toBe(
      'started',
    );
  }
});

test('site twenty-per-minute burst survives distinct sources and browsers', () => {
  const { store } = fixture();
  for (let count = 0; count < 21; count++) {
    const claim = `claim-${String(count)}`;
    draft(store, claim);
    if (count < 20) stop(store, ask(claim));
    else expect(store.admitConversationOperation(ask(claim)).kind).toBe('rate_limited');
  }
});

function seedSpend(path: string, amount: number, at: number) {
  const database = new Database(path);
  database
    .query(
      "INSERT INTO paid_attempt (operation_id, conversation_id, browser_hash, source_hash, utc_day, admitted_at, reserved_micro_usd, settled_micro_usd, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unknown')",
    )
    .run(
      crypto.randomUUID(),
      'removed',
      'removed',
      'removed',
      new Date(at).toISOString().slice(0, 10),
      at,
      amount,
      amount,
    );
  database.close();
}

test('rolling site hour and UTC month ceilings count retained accounting', () => {
  for (const period of ['hour', 'month']) {
    const { store, path } = fixture();
    seedSpend(
      path,
      period === 'hour' ? 2_000_000 : 100_000_000,
      period === 'hour' ? now - 1000 : now - 86_400_000,
    );
    draft(store, period);
    expect(store.admitConversationOperation(ask(period)).kind).toBe('rate_limited');
  }
});

test('content deletion preserves ledger spend and settlement from compatible writers', () => {
  const { store, path } = fixture();
  const admittedAt = now - 40 * 86_400_000;
  draft(store, 'claim', 'claim', admittedAt);
  const admission = stop(store, ask('claim', 'source', admittedAt, 150_000));
  const database = new Database(path);
  database
    .query(
      "UPDATE conversation_operation SET settled_micro_usd = 140000, state = 'completed', settlement = 'usage' WHERE id = ?",
    )
    .run(admission.id);
  expect(store.readSiteSpend(admittedAt)).toBe(140_000);
  database.run(
    'DELETE FROM conversation_operation; DELETE FROM conversation; DELETE FROM intake_draft',
  );
  expect(store.readSiteSpend(admittedAt)).toBe(140_000);
  expect(database.query('SELECT browser_hash, settled_micro_usd FROM paid_attempt').all()).toEqual([
    { browser_hash: 'claim', settled_micro_usd: 140_000 },
  ]);
  database.close();
});

test('preview baselines renew scoped allowances while preserving history and site accounting', () => {
  const { store, path } = fixture();
  draft(store, 'claim');
  let first = '';
  for (let attempt = 0; attempt < 10; attempt++) first = stop(store, ask('claim')).id;
  expect(store.admitConversationOperation(ask('claim')).kind).toBe('exhausted');
  expect(store.resetBrowserAllowance('claim', 'claim', now + 1)).toBe(true);
  expect(store.readSiteSpend(now)).toBe(10_000);
  expect(store.admitConversationOperation(ask('claim', 'claim', now + 2)).kind).toBe('started');
  const database = new Database(path);
  expect(database.query('SELECT count(*) AS count FROM paid_attempt').get()).toEqual({ count: 11 });
  expect(
    database.query('SELECT state FROM conversation_operation WHERE id = ?').get(first),
  ).toEqual({ state: 'unknown' });
  database.close();
});

test('preview reset fences in-flight operation before renewing counters', () => {
  const { store } = fixture();
  draft(store, 'claim');
  const admission = store.admitConversationOperation(ask('claim'));
  if (admission.kind !== 'started') throw new Error('Expected started');
  expect(store.resetBrowserAllowance('claim', 'claim', now)).toBe(true);
  expect(store.findConversationOperation(admission.conversationId, 'initial')?.state).toBe(
    'unknown',
  );
  expect(store.readSiteSpend(now)).toBe(1000);
  expect(store.admitConversationOperation(ask('claim')).kind).toBe('started');
});

test('migration backfills conversation and retired-provider spend without content ownership', () => {
  const { store, path } = fixture();
  draft(store, 'old');
  stop(store, ask('old'));
  seedLegacyAccount(
    path,
    [{ utcDay: '2026-11-08', reservedMicroUsd: 2000, settledMicroUsd: 1500 }],
    now,
  );
  const database = new Database(path);
  const migration = websiteMigrations().find((entry) => entry.name === '014_anonymous_admission');
  if (!migration) throw new Error('Missing migration 014');
  database.run(readFileSync(join(migration.directory, 'down.sql'), 'utf8'));
  database.query('DELETE FROM schema_migration WHERE name = ?').run(migration.name);
  database.close();
  const upgraded = new WebsiteStore(path);
  stores.push(upgraded);
  expect(upgraded.readSiteSpend(now)).toBe(2500);
  expect(upgraded.findDraftBrowser('old')).toBe('legacy:old');
});

test('retired-provider triggers preserve insert settlement and deletion accounting', () => {
  const { store, path } = fixture();
  seedLegacyAccount(
    path,
    [
      {
        utcDay: new Date(now - 40 * 86_400_000).toISOString().slice(0, 10),
        reservedMicroUsd: 2000,
        settledMicroUsd: null,
      },
    ],
    now - 40 * 86_400_000,
  );
  expect(store.readSiteSpend(now - 40 * 86_400_000)).toBe(2000);
  const database = new Database(path);
  database.run('UPDATE provider_call SET settled_micro_usd = 1500');
  expect(store.readSiteSpend(now - 40 * 86_400_000)).toBe(1500);
  database.run('DELETE FROM provider_call');
  expect(store.readSiteSpend(now - 40 * 86_400_000)).toBe(1500);
  database.close();
});

test('production retention purge preserves current-month spend after deleting old content', () => {
  const { store, path } = fixture();
  draft(store, 'purged');
  const admission = store.admitConversationOperation(ask('purged', 'source', now, 150_000));
  if (admission.kind !== 'started') throw new Error('Expected started');
  expect(store.completeConversationOperation(admission.id, 'Reply', 140_000, now, false)).toBe(
    true,
  );
  const database = new Database(path);
  database.run(`UPDATE intake_draft SET expires_at = ${String(now + 1000)}`);
  database.close();
  const cutoff = Date.UTC(2026, 10, 9);
  const plan = inspectExpiredDrafts(path, cutoff);
  expect(purgeExpiredDrafts(path, cutoff, plan.fingerprint, cutoff).retainedDrafts).toBe(1);
  expect(store.findConversation('purged')).not.toBeNull();
  const retained = new Database(path);
  expect(retained.query('SELECT message, reply FROM conversation_operation').all()).toEqual([
    { message: '', reply: '' },
  ]);
  retained.close();
  expect(store.readSiteSpend(now)).toBe(140_000);
});

test('two processes race for the last source minute admission and only one reserves', async () => {
  const { store, path } = fixture();
  draft(store, 'first');
  draft(store, 'second');
  const script = join(path, '..', 'race.ts');
  writeFileSync(
    script,
    `import { WebsiteStore } from ${JSON.stringify(join(import.meta.dir, 'store.ts'))};
const [path, claim, start] = Bun.argv.slice(2);
const store = new WebsiteStore(path);
while (Date.now() < Number(start)) {}
const admission = store.admitConversationOperation({ ...${JSON.stringify(ask('PLACEHOLDER', 'same-source'))}, claimHash: claim, pricing: { kind: 'paid', price: () => 1000 } });
console.log(admission.kind);
store.close();`,
  );
  const start = Date.now() + 500;
  const writers = ['first', 'second'].map((claim) =>
    Bun.spawn(['bun', script, path, claim, String(start)], { stdout: 'pipe', stderr: 'pipe' }),
  );
  const exits = await Promise.all(writers.map((writer) => writer.exited));
  const output = await Promise.all(writers.map((writer) => new Response(writer.stdout).text()));
  expect(exits).toEqual([0, 0]);
  expect(output.map((entry) => entry.trim()).sort()).toEqual(['rate_limited', 'started']);
});

test('stale browser registrations expire while draft bindings remain', () => {
  const { store, path } = fixture();
  store.registerBrowserClaim('orphan', now - 32 * 86_400_000);
  draft(store, 'bound', 'retained', now - 32 * 86_400_000);
  draft(store, 'fresh');
  expect(store.hasBrowserClaim('orphan')).toBe(false);
  expect(store.hasBrowserClaim('retained', now)).toBe(false);
  expect(store.findDraftBrowser('bound')).toBe('retained');
  const database = new Database(path);
  expect(
    database
      .query("SELECT count(*) AS count FROM browser_claim WHERE hash IN ('orphan', 'retained')")
      .get(),
  ).toEqual({ count: 0 });
  database.close();
});

test('preview reset preserves hourly monthly daily and pause refusals', () => {
  for (const ceiling of ['hour', 'month', 'day', 'automatic', 'operator']) {
    const { store, path } = fixture();
    draft(store, ceiling);
    if (ceiling === 'hour') seedSpend(path, 2_000_000, now - 1000);
    if (ceiling === 'month') seedSpend(path, 100_000_000, now - 86_400_000);
    if (ceiling === 'day' || ceiling === 'automatic')
      seedSpend(path, ceiling === 'day' ? 10_000_000 : 8_000_000, now - 7_200_000);
    if (ceiling === 'day') {
      expect(store.openInferencePause('site_spend', 'system', now)).not.toBeNull();
      expect(store.resumeInferencePause(now)).toBe(true);
    }
    if (ceiling === 'operator')
      expect(store.openInferencePause('operator', 'operator', now)).not.toBeNull();
    expect(store.resetBrowserAllowance(ceiling, ceiling, now)).toBe(true);
    expect(store.admitConversationOperation(ask(ceiling)).kind).toBe(
      ceiling === 'hour' || ceiling === 'month'
        ? 'rate_limited'
        : ceiling === 'day'
          ? 'exhausted'
          : 'paused',
    );
  }
});

test('preview reset preserves four-call concurrency and site fresh-minute ceiling', () => {
  for (const ceiling of ['concurrency', 'minute']) {
    const { store } = fixture();
    const count = ceiling === 'concurrency' ? 4 : 20;
    for (let index = 0; index < count; index++) {
      const claim = `claim-${String(index)}`;
      draft(store, claim);
      if (ceiling === 'concurrency')
        expect(store.admitConversationOperation(ask(claim)).kind).toBe('started');
      else stop(store, ask(claim));
    }
    draft(store, 'reset');
    expect(store.resetBrowserAllowance('reset', 'reset', now)).toBe(true);
    expect(store.admitConversationOperation(ask('reset')).kind).toBe(
      ceiling === 'concurrency' ? 'busy' : 'rate_limited',
    );
  }
});

test('a browser reset does not renew another browser sharing its source', () => {
  const { store } = fixture();
  for (let index = 0; index < 3; index++) {
    const claim = `claim-${String(index)}`;
    const at = now + index * 61_000;
    draft(store, claim, claim, at);
    stop(store, ask(claim, 'shared', at));
  }
  draft(store, 'reset', 'reset', now + 240_000);
  expect(store.resetBrowserAllowance('reset', 'reset', now + 240_000)).toBe(true);
  stop(store, ask('reset', 'shared', now + 240_000));
  draft(store, 'ordinary', 'ordinary', now + 301_000);
  expect(store.admitConversationOperation(ask('ordinary', 'shared', now + 301_000)).kind).toBe(
    'rate_limited',
  );
});

test('preview reset renews turn and conversation spend while retaining all exchanges', () => {
  const { store } = fixture();
  draft(store, 'claim');
  let conversation = '';
  for (let index = 0; index < 8; index++) {
    const request = {
      ...ask('claim'),
      initial: index === 0,
      idempotencyKey: `turn-${String(index)}`,
    };
    const admission = store.admitConversationOperation(request);
    if (admission.kind !== 'started') throw new Error(`Expected started, got ${admission.kind}`);
    conversation = admission.conversationId;
    expect(store.completeConversationOperation(admission.id, 'Reply', 1000, now, false)).toBe(true);
  }
  expect(store.effectiveVisitorTurns(conversation)).toBe(8);
  expect(store.resetBrowserAllowance('claim', 'claim', now)).toBe(true);
  expect(store.effectiveVisitorTurns(conversation)).toBe(0);
  expect(store.listConversationTurns(conversation)).toHaveLength(16);
  expect(
    store.admitConversationOperation({
      ...ask('claim', 'claim', now, 150_000),
      initial: false,
      idempotencyKey: 'renewed',
    }).kind,
  ).toBe('started');
});

test('browser registry refuses expired registrations without waiting for cleanup', () => {
  const { store } = fixture();
  store.registerBrowserClaim('expired', now - 32 * 86_400_000);
  expect(store.hasBrowserClaim('expired', now)).toBe(false);
});

test('a second process cannot recover live calls or bypass four slots before their deadline', () => {
  const { store, path } = fixture();
  const running = [];
  for (let index = 0; index < 4; index++) {
    const claim = `running-${String(index)}`;
    draft(store, claim);
    const admission = store.admitConversationOperation(ask(claim));
    if (admission.kind !== 'started') throw new Error('Expected started');
    running.push(admission);
  }
  draft(store, 'fifth');
  const other = new WebsiteStore(path, () => now);
  stores.push(other);
  expect(other.admitConversationOperation(ask('fifth')).kind).toBe('busy');
  expect(other.findConversationOperation(running[0].conversationId, 'initial')?.state).toBe(
    'inflight',
  );
  expect(other.admitConversationOperation(ask('fifth', 'fifth', now + 29_999)).kind).toBe('busy');
  expect(other.admitConversationOperation(ask('fifth', 'fifth', now + 30_000)).kind).toBe(
    'started',
  );
  expect(other.findConversationOperation(running[0].conversationId, 'initial')?.state).toBe(
    'unknown',
  );
  expect(store.readSiteSpend(now)).toBe(5000);
});

test('predecessor cleanup cannot delete paid original operations still in the current UTC month', () => {
  const { store, path } = fixture();
  const current = Date.now();
  draft(store, 'protected', 'protected', current);
  const admission = store.admitConversationOperation(ask('protected', 'protected', current));
  if (admission.kind !== 'started') throw new Error('Expected started');
  expect(store.completeConversationOperation(admission.id, 'Reply', 1000, current, false)).toBe(
    true,
  );
  const database = new Database(path);
  expect(() =>
    database.query('DELETE FROM conversation_operation WHERE id = ?').run(admission.id),
  ).toThrow('Paid accounting is still retained');
  expect(store.readSiteSpend(current)).toBe(1000);
  database.close();
});

test('predecessor cleanup cannot delete current-month retired-provider accounting', () => {
  const { path } = fixture();
  const current = Date.now();
  seedLegacyAccount(
    path,
    [
      {
        utcDay: new Date(current).toISOString().slice(0, 10),
        reservedMicroUsd: 1000,
        settledMicroUsd: 1000,
      },
    ],
    current,
  );
  const database = new Database(path);
  expect(() => database.run('DELETE FROM provider_call')).toThrow(
    'Paid accounting is still retained',
  );
  database.close();
});

test('migration rollback refuses to discard orphaned retained financial records', () => {
  const { path } = fixture();
  seedSpend(path, 1000, now - 40 * 86_400_000);
  const migration = websiteMigrations().find((entry) => entry.name === '014_anonymous_admission');
  if (!migration) throw new Error('Missing migration');
  const database = new Database(path);
  expect(() => database.run(readFileSync(join(migration.directory, 'down.sql'), 'utf8'))).toThrow(
    'CHECK constraint failed',
  );
  expect(database.query('SELECT count(*) AS count FROM paid_attempt').get()).toEqual({ count: 1 });
  database.close();
});
