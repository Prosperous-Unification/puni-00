import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const prior = '20260928030000_add_delegation_use';

test('challenge migration rolls back empty before activation and refuses retained rows', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-challenge-migration-'));
  try {
    const path = join(directory, 'test.db');
    runMigrations(path, folder);
    expect(rollbackTo(path, folder, prior)).toEqual([
      '20261011120000_add_browser_auth_lifecycle',
      '20261005110000_add_shared_people',
      '20261001010000_add_browser_credential_revocations',
      '20260929180000_add_project_rank',
      '20260929100000_add_spaces',
      '20260928200000_add_work_item_status_facts',
      '20260928040000_add_email_challenge',
    ]);
    runMigrations(path, folder);
    const db = openDatabase(path);
    try {
      db.run("INSERT INTO users (id, username, created_at) VALUES ('u', 'u', 1)");
      db.run(
        "INSERT INTO email_challenge (id, user_id, email, token_digest, expires_at, delivery_state, created_at) VALUES ('c', 'u', 'u@example.org', 'digest', 10, 'pending', 1)",
      );
    } finally {
      db.close();
    }
    // Proof: 2026-09-28, dropping the retained-row predicate made this rollback test stop throwing.
    expect(() => rollbackTo(path, folder, prior)).toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('challenge rollback refuses activation without retained challenge rows', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-challenge-activated-'));
  try {
    const path = join(directory, 'test.db');
    runMigrations(path, folder);
    const db = openDatabase(path);
    try {
      db.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
    } finally {
      db.close();
    }
    // Proof: 2026-09-28, dropping the activation predicate made this rollback test stop throwing.
    expect(() => rollbackTo(path, folder, prior)).toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('challenge schema rejects duplicate digests and unknown delivery states', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-challenge-constraints-'));
  try {
    const path = join(directory, 'test.db');
    runMigrations(path, folder);
    const db = openDatabase(path);
    try {
      db.run("INSERT INTO users (id, username, created_at) VALUES ('u', 'u', 1)");
      db.run(
        "INSERT INTO email_challenge (id, user_id, email, token_digest, expires_at, delivery_state, created_at) VALUES ('a', 'u', 'u@example.org', 'digest', 10, 'pending', 1)",
      );
      expect(() =>
        db.run(
          "INSERT INTO email_challenge (id, user_id, email, token_digest, expires_at, delivery_state, created_at) VALUES ('b', 'u', 'u@example.org', 'digest', 10, 'pending', 1)",
        ),
      ).toThrow();
      expect(() =>
        db.run(
          "INSERT INTO email_challenge (id, user_id, email, token_digest, expires_at, delivery_state, created_at) VALUES ('c', 'u', 'u@example.org', 'other', 10, 'unknown', 1)",
        ),
      ).toThrow();
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
