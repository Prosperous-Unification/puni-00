import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const PREVIOUS = '20260928010000_add_project_solution';

/** The additive verification column starts false and cannot discard evidence. */
describe('email verification migration', () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-email-verification-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function withDatabase<T>(read: (db: ReturnType<typeof openDatabase>) => T): T {
    const db = openDatabase(path);
    try {
      return read(db);
    } finally {
      db.close();
    }
  }

  it('starts old accounts unverified and checks the boolean and email', () => {
    withDatabase((db) => {
      db.run("INSERT INTO users (id, username, created_at) VALUES ('u', 'u', 1)");
      expect(db.query("SELECT email_verified FROM users WHERE id = 'u'").get()).toEqual({
        email_verified: 0,
      });
      expect(() => db.run("UPDATE users SET email_verified = 1 WHERE id = 'u'")).toThrow();
      expect(() => db.run("UPDATE users SET email_verified = 2 WHERE id = 'u'")).toThrow();
      db.run("UPDATE users SET email = 'u@example.org', email_verified = 1 WHERE id = 'u'");
      expect(() => db.run("UPDATE users SET email_verified = 2 WHERE id = 'u'")).toThrow();
      expect(() => db.run("UPDATE users SET email = NULL WHERE id = 'u'")).toThrow();
    });
  });

  it('rolls down before activation without evidence', () => {
    expect(rollbackTo(path, FOLDER, PREVIOUS)).toEqual([
      '20260928200000_add_work_item_status_facts',
      '20260928040000_add_email_challenge',
      '20260928030000_add_delegation_use',
      '20260928020000_add_email_verification',
    ]);
    withDatabase((db) => {
      expect(db.query('PRAGMA table_info(users)').all()).not.toContainEqual(
        expect.objectContaining({ name: 'email_verified' }),
      );
    });
  });

  it('refuses rollback with retained evidence', () => {
    withDatabase((db) =>
      db.run(
        "INSERT INTO users (id, username, email, email_verified, created_at) VALUES ('u', 'u', 'u@example.org', 1, 1)",
      ),
    );
    expect(() => rollbackTo(path, FOLDER, PREVIOUS)).toThrow();
    withDatabase((db) => {
      expect(db.query('SELECT email_verified FROM users').get()).toEqual({ email_verified: 1 });
    });
  });

  it('refuses rollback after activation even without verified rows', () => {
    withDatabase((db) =>
      db.run("UPDATE organization_activation SET state = 'activated', activated_at = 1"),
    );
    expect(() => rollbackTo(path, FOLDER, PREVIOUS)).toThrow();
  });
});
