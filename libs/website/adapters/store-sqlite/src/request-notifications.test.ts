import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { WebsiteStore } from './store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-notifications-'));
  directories.push(directory);
  const path = join(directory, 'website.sqlite');
  const store = new WebsiteStore(path);
  const database = new Database(path);
  const submit = (suffix: string, now = 150) => {
    store.createDraft(
      `draft-${suffix}`,
      'Private request description',
      `claim-${suffix}`,
      100,
      1000,
      'source',
    );
    return store.submit(
      `claim-${suffix}`,
      `key-${suffix}`,
      'hash',
      'private@example.test',
      'Private brief',
      `receipt-${suffix}`,
      now,
      'source',
    );
  };
  return { path, store, database, submit };
}

test('proposal commit captures one obligation across reopen and replay, without storing request content', () => {
  const { path, store, database, submit } = fixture();
  try {
    expect(submit('one').kind).toBe('created');
    expect(
      store.submit(
        'claim-one',
        'key-one',
        'hash',
        'private@example.test',
        'Private brief',
        'unused',
        151,
        'source',
      ),
    ).toEqual({ kind: 'replayed', receipt: 'receipt-one' });
    store.close();
    const reopened = new WebsiteStore(path);
    reopened.close();
    const obligations = database.query('SELECT * FROM request_notification').all();
    expect(obligations).toHaveLength(1);
    expect(JSON.stringify(obligations)).not.toMatch(/private|brief|receipt-one|claim-one/i);
    expect(database.query('SELECT submission_id FROM request_notification').get()).toEqual(
      database.query('SELECT id AS submission_id FROM proposal_submission').get(),
    );
  } finally {
    database.close();
  }
});

test('aborted submission rolls its notification back with the proposal', () => {
  const { store, database, submit } = fixture();
  try {
    database.run(
      "CREATE TRIGGER reject_replay BEFORE INSERT ON submission_replay BEGIN SELECT RAISE(ABORT, 'injected replay failure'); END",
    );
    expect(() => submit('abort')).toThrow('injected replay failure');
    expect(database.query('SELECT * FROM proposal_submission').all()).toEqual([]);
    expect(database.query('SELECT * FROM request_notification').all()).toEqual([]);
  } finally {
    store.close();
    database.close();
  }
});

test('compatible predecessor inserts enqueue and content erasure cancels obligations', () => {
  const { store, database, submit } = fixture();
  try {
    submit('one');
    store.createDraft('draft-older', 'Earlier writer', 'claim-older', 100, 1000, 'source');
    database
      .query(
        "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('older-writer', 'draft-older', 'private@example.test', 'Private brief', 'older-receipt', 'submitted', 150, 150)",
      )
      .run();
    expect(
      database.query('SELECT submission_id FROM request_notification ORDER BY submission_id').all(),
    ).toHaveLength(2);
    database.run("UPDATE proposal_submission SET email = '', brief = ''");
    expect(database.query('SELECT * FROM request_notification').all()).toEqual([]);
  } finally {
    store.close();
    database.close();
  }
});

test('migration backfills only unreviewed unerased proposals and down restores the previous schema', () => {
  const { path, store, database, submit } = fixture();
  try {
    submit('one');
    submit('two');
    submit('three');
    store.close();
    const migration = join(import.meta.dir, 'migrations/015_request_notifications');
    database.run(readFileSync(join(migration, 'down.sql'), 'utf8'));
    database.run("DELETE FROM schema_migration WHERE name = '015_request_notifications'");
    database.run(
      "UPDATE proposal_submission SET status = 'reviewing' WHERE receipt = 'receipt-two'",
    );
    database.run(
      "UPDATE proposal_submission SET email = '', brief = '' WHERE receipt = 'receipt-three'",
    );
    const reopened = new WebsiteStore(path);
    reopened.close();
    expect(database.query('SELECT submission_id FROM request_notification').all()).toEqual([
      database
        .query("SELECT id AS submission_id FROM proposal_submission WHERE receipt = 'receipt-one'")
        .get(),
    ]);
    database.run(readFileSync(join(migration, 'down.sql'), 'utf8'));
    expect(
      database
        .query("SELECT name FROM sqlite_master WHERE name LIKE 'request_notification%'")
        .all(),
    ).toEqual([]);
    expect(database.query('SELECT id FROM proposal_submission').all()).toHaveLength(3);
  } finally {
    database.close();
  }
});

test('leases survive restart, exclude other workers, and recover after expiry without stale acknowledgement', async () => {
  const { claimRequestNotification, finishRequestNotification } =
    await import('./request-notifications');
  const { path, store, database, submit } = fixture();
  const peer = new Database(path);
  try {
    submit('lease');
    const first = claimRequestNotification(database, 200);
    expect(first).not.toBeNull();
    expect(first?.attempts).toBe(1);
    expect(claimRequestNotification(peer, 201)).toBeNull();
    database.close();
    expect(claimRequestNotification(peer, 60_199)).toBeNull();
    const second = claimRequestNotification(peer, 60_200);
    expect(second?.attempts).toBe(2);
    expect(second?.token).not.toBe(first?.token);
    if (!first || !second) throw new Error('Expected both leases');
    expect(() => finishRequestNotification(peer, first, 'accepted', 60_201)).toThrow('lease');
    expect(finishRequestNotification(peer, second, 'accepted', 60_202)).toBe('recorded');
    expect(claimRequestNotification(peer, 1_000_000)).toBeNull();
  } finally {
    store.close();
    peer.close();
  }
});

test('failed delivery has durable capped exponential retries and an expired lease cannot settle', async () => {
  const { claimRequestNotification, finishRequestNotification } =
    await import('./request-notifications');
  const { store, database, submit } = fixture();
  try {
    submit('retry');
    let now = 200;
    const delays = [60_000, 120_000, 240_000, 480_000, 960_000, 1_920_000, 3_600_000, 3_600_000];
    for (const [offset, delay] of delays.entries()) {
      const lease = claimRequestNotification(database, now);
      if (!lease) throw new Error('Expected a due notification');
      expect(lease.attempts).toBe(offset + 1);
      expect(finishRequestNotification(database, lease, 'failed', now + 1)).toBe('recorded');
      expect(claimRequestNotification(database, now + delay)).toBeNull();
      now += delay + 1;
    }
    const expired = claimRequestNotification(database, now);
    if (!expired) throw new Error('Expected final lease');
    expect(() => finishRequestNotification(database, expired, 'accepted', now + 60_000)).toThrow(
      'lease',
    );
    expect(claimRequestNotification(database, now + 60_000)?.attempts).toBe(10);
  } finally {
    store.close();
    database.close();
  }
});

test('erasure while a delivery is leased is cancellation and cannot resurrect a notification', async () => {
  const { claimRequestNotification, finishRequestNotification } =
    await import('./request-notifications');
  const { store, database, submit } = fixture();
  try {
    submit('erase');
    const lease = claimRequestNotification(database, 200);
    if (!lease) throw new Error('Expected a due notification');
    database.run("UPDATE proposal_submission SET email = '', brief = ''");
    expect(finishRequestNotification(database, lease, 'accepted', 201)).toBe('cancelled');
    expect(claimRequestNotification(database, 1_000_000)).toBeNull();
    expect(database.query('SELECT * FROM request_notification').all()).toEqual([]);
  } finally {
    store.close();
    database.close();
  }
});
