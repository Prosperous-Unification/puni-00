import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { validateDatabase } from './checked-database';
import { websiteMigrations } from './migration-catalogue';
import { WebsiteStore } from './store';

test('applies all migrations and preserves a draft across reopen until expiry', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-website-store-'));
  const databasePath = join(directory, 'website.sqlite');
  try {
    const store = new WebsiteStore(databasePath);
    store.createDraft('draft-1', 'Build a booking app', 'claim-1', 100, 200, 'source-test');
    store.close();

    const reopened = new WebsiteStore(databasePath);
    expect(reopened.findDraft('claim-1', 150)).toMatchObject({
      description: 'Build a booking app',
      expiresAt: 200,
    });
    expect(reopened.findDraft('claim-1', 200)).toBeNull();
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('discarding a draft expires it without deleting content and refuses a consumed one', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-website-discard-'));
  try {
    const store = new WebsiteStore(join(directory, 'website.sqlite'));
    store.createDraft('draft-1', 'Build a booking app', 'claim-1', 100, 1_000, 'source-test');
    expect(store.discardDraft('claim-1', 150)).toBe('discarded');
    expect(store.findDraft('claim-1', 151)).toBeNull();
    expect(store.discardDraft('claim-1', 160)).toBe('discarded');
    expect(store.discardDraft('claim-unknown', 160)).toBe('missing');
    store.createDraft('draft-2', 'Build a dashboard', 'claim-2', 100, 1_000, 'source-test');
    expect(
      store.submit(
        'claim-2',
        'key-12345678',
        'hash',
        'a@example.test',
        'b',
        'r',
        150,
        'source-test',
      ),
    ).toEqual({
      kind: 'created',
      receipt: 'r',
      siteCount: 1,
    });
    // Proof: dropping the consumed branch in discardDraft made this return 'discarded'.
    expect(store.discardDraft('claim-2', 160)).toBe('consumed');
    store.close();
    const database = new Database(join(directory, 'website.sqlite'));
    expect(
      database
        .query<{ id: string; description: string; expires_at: number }, []>(
          'SELECT id, description, expires_at FROM intake_draft ORDER BY id',
        )
        .all(),
    ).toEqual([
      { id: 'draft-1', description: 'Build a booking app', expires_at: 150 },
      { id: 'draft-2', description: 'Build a dashboard', expires_at: 1_000 },
    ]);
    database.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A database migrated through `008_refusal` only, as the preview database stands before 009. */
function databaseAt008(databasePath: string): void {
  const database = new Database(databasePath, { create: true });
  database.run(
    'CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)',
  );
  for (const migration of websiteMigrations().filter(({ name }) => name < '009')) {
    const forward = readFileSync(join(migration.directory, 'migration.sql'), 'utf8');
    database.run(forward);
    database
      .query('INSERT INTO schema_migration (name, checksum) VALUES (?, ?)')
      .run(migration.name, createHash('sha256').update(forward).digest('hex'));
  }
  database.close();
}

function listGuardrailObjects(database: Database): string[] {
  return database
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE name IN ('admission_count', 'guardrail_alert', 'inference_pause', 'login_failure', 'inference_pause_open', 'guardrail_alert_created') ORDER BY name",
    )
    .all()
    .map(({ name }) => name);
}

test('009_guardrails applies on a fresh database and on one at 008, and down.sql drops it cleanly', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-website-009-'));
  try {
    for (const databasePath of [
      join(directory, 'fresh.sqlite'),
      join(directory, 'at-008.sqlite'),
    ]) {
      if (databasePath.endsWith('at-008.sqlite')) databaseAt008(databasePath);
      new WebsiteStore(databasePath).close();
      const database = new Database(databasePath);
      validateDatabase(database, 'test');
      expect(listGuardrailObjects(database)).toEqual([
        'admission_count',
        'guardrail_alert',
        'guardrail_alert_created',
        'inference_pause',
        'inference_pause_open',
        'login_failure',
      ]);
      const guardrails = websiteMigrations().find(({ name }) => name === '009_guardrails');
      if (!guardrails) throw new Error('009_guardrails is not catalogued');
      database.run(readFileSync(join(guardrails.directory, 'down.sql'), 'utf8'));
      database.query('DELETE FROM schema_migration WHERE name = ?').run('009_guardrails');
      expect(listGuardrailObjects(database)).toEqual([]);
      const expected = new Database(':memory:');
      expected.run('CREATE TABLE schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
      for (const migration of websiteMigrations().filter(({ name }) => name < '009'))
        expected.run(readFileSync(join(migration.directory, 'migration.sql'), 'utf8'));
      const schema =
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name";
      expect(database.query(schema).all()).toEqual(expected.query(schema).all());
      expected.close();
      database.close();
      // The API re-applies 009 at its next start.
      new WebsiteStore(databasePath).close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a second open inference pause is refused by the open-pause index', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-website-pause-'));
  try {
    const databasePath = join(directory, 'website.sqlite');
    new WebsiteStore(databasePath).close();
    const database = new Database(databasePath);
    const insert = database.query(
      "INSERT INTO inference_pause (id, paused_at, reason, paused_by) VALUES (?, ?, 'operator', 'operator')",
    );
    insert.run('pause-1', 100);
    // Proof: removing the partial unique index from 009 let this second open row insert.
    expect(() => insert.run('pause-2', 200)).toThrow('UNIQUE');
    database
      .query("UPDATE inference_pause SET resumed_at = 300, resumed_by = 'operator' WHERE id = ?")
      .run('pause-1');
    insert.run('pause-3', 400);
    expect(
      database
        .query<{ count: number }, []>(
          'SELECT count(*) AS count FROM inference_pause WHERE resumed_at IS NULL',
        )
        .get()?.count,
    ).toBe(1);
    database.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
