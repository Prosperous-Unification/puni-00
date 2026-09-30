import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { backfillExternalIdentities } from './external-identity';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

describe('backfillExternalIdentities', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-external-identity-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const raw = (statement: string, params: (string | number | null)[] = []) => {
    const db = openDatabase(path);
    try {
      db.run(statement, params);
    } finally {
      db.close();
    }
  };
  const mappings = () => {
    const db = openDatabase(path);
    try {
      return db
        .query('SELECT user_id, issuer, subject FROM external_identity ORDER BY user_id')
        .all();
    } finally {
      db.close();
    }
  };
  const user = (id: string, issuer: string | null, subject: string | null) => {
    raw(
      'INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES (?, ?, NULL, ?, ?, 1)',
      [id, id, issuer, subject],
    );
  };
  const backfill = () => openDrizzle(path).transaction((tx) => backfillExternalIdentities(tx, 2));

  it('maps every legacy pair to its own user, once, and skips password-only users', () => {
    user('ada', 'https://issuer', 'sub-ada');
    user('sam', 'https://issuer', 'sub-sam');
    user('pat', null, null);

    expect(backfill()).toBe(2);
    expect(backfill()).toBe(0);
    expect(mappings()).toEqual([
      { user_id: 'ada', issuer: 'https://issuer', subject: 'sub-ada' },
      { user_id: 'sam', issuer: 'https://issuer', subject: 'sub-sam' },
    ]);
  });

  it('refuses a half, empty or non-text legacy pair, mapping nothing', () => {
    user('ada', 'https://issuer', 'sub-ada');
    user('half', 'https://issuer', null);
    expect(backfill).toThrow('partial or empty legacy identity pair');
    raw("UPDATE users SET idp_sub = '' WHERE id = 'half'");
    expect(backfill).toThrow('partial or empty legacy identity pair');
    raw("UPDATE users SET idp_sub = x'616263' WHERE id = 'half'");
    expect(backfill).toThrow('partial or empty legacy identity pair');
    expect(mappings()).toEqual([]);
  });

  it('refuses a pair already mapped to another user, mapping nothing', () => {
    user('ada', 'https://issuer', 'sub-ada');
    user('sam', 'https://issuer', 'sub-sam');
    raw(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('m1', 'sam', 'https://issuer', 'sub-ada', 1)",
    );

    expect(backfill).toThrow('is mapped to sam');
    expect(mappings()).toEqual([{ user_id: 'sam', issuer: 'https://issuer', subject: 'sub-ada' }]);
  });
});
