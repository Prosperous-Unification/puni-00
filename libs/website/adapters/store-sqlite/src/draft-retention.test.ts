import { chmodSync, copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { inspectExpiredDrafts, purgeExpiredDrafts, WebsiteStore } from './store';

function fixture(run: (databasePath: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'puni-draft-retention-'));
  try {
    run(join(directory, 'website.sqlite'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function seededDatabase(databasePath: string): void {
  const store = new WebsiteStore(databasePath);
  for (const [id, expiry] of [
    ['eligible-a', 199],
    ['eligible-b', 200],
    ['future', 201],
    ['consumed', 100],
    ['proposal', 100],
    ['request', 100],
    ['legacy', 100],
    ['replay', 100],
  ] as const)
    store.createDraft(id, `secret-description-${id}`, `secret-claim-${id}`, 1, expiry);
  store.close();
  const database = new Database(databasePath);
  try {
    database.run("UPDATE intake_draft SET consumed_at = 100 WHERE id = 'consumed'");
    database.run(
      "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('proposal-1', 'proposal', 'secret@example.test', 'secret-brief', 'receipt-1', 'submitted', 1, 1)",
    );
    database.run(
      "INSERT INTO prospect_account (id, email, created_at) VALUES ('owner-1', 'owner@example.test', 1), ('owner-2', 'owner-2@example.test', 1)",
    );
    database.run(
      "INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at) VALUES ('request-1', 'owner-1', 'request', 'secret-request', '', 1)",
    );
    database.run(
      "INSERT INTO account_request (account_id, description, brief, created_at, draft_id) VALUES ('owner-2', 'secret-legacy', '', 1, 'legacy')",
    );
    database.run(
      "INSERT INTO submission_replay (claim_hash, idempotency_key, body_hash, receipt, expires_at) VALUES ('secret-claim-replay', 'key-1', 'hash-1', 'receipt-2', 1)",
    );
  } finally {
    database.close();
  }
}

function draftIds(databasePath: string): string[] {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database
      .query<{ id: string }, []>('SELECT id FROM intake_draft ORDER BY id')
      .all()
      .map(({ id }) => id);
  } finally {
    database.close();
  }
}

function withSecondDeleteFault(
  mode: 'throw' | 'zero',
  execute: (attempts: () => number) => void,
): void {
  const query = Reflect.get(Database.prototype, 'query');
  let attempts = 0;
  Reflect.set(Database.prototype, 'query', function (this: Database, sql: string) {
    const prepared: unknown = Reflect.apply(query, this, [sql]);
    if (sql !== 'DELETE FROM intake_draft WHERE id = ?') return prepared;
    const deletion = prepared as { run: (id: string) => { changes: number } };
    return {
      run: (id: string) => {
        attempts += 1;
        if (attempts === 2) {
          if (mode === 'throw') throw new Error('injected second delete');
          return { changes: 0 };
        }
        return deletion.run(id);
      },
    };
  });
  try {
    execute(() => attempts);
  } finally {
    Reflect.set(Database.prototype, 'query', query);
  }
}

test('inspection selects only expired unconsumed unlinked drafts and omits private fields', () => {
  fixture((databasePath) => {
    seededDatabase(databasePath);
    const plan = inspectExpiredDrafts(databasePath, 200);
    expect(plan).toMatchObject({ cutoff: 200, eligibleDrafts: 2 });
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(plan)).not.toMatch(/eligible-a|secret|owner@example|receipt/);
    expect(draftIds(databasePath)).toHaveLength(8);
    expect(inspectExpiredDrafts(databasePath, 199).eligibleDrafts).toBe(1);
  });
});

test('unchanged explicit plan removes only its cohort', () => {
  fixture((databasePath) => {
    seededDatabase(databasePath);
    const plan = inspectExpiredDrafts(databasePath, 200);
    expect(purgeExpiredDrafts(databasePath, plan.cutoff, plan.fingerprint, 200)).toEqual({
      deletedDrafts: 2,
    });
    expect(draftIds(databasePath)).toEqual([
      'consumed',
      'future',
      'legacy',
      'proposal',
      'replay',
      'request',
    ]);
    const database = new Database(databasePath, { readonly: true });
    for (const table of [
      'proposal_submission',
      'software_request',
      'account_request',
      'submission_replay',
      'prospect_account',
    ]) {
      expect(
        database.query<{ count: number }, []>(`SELECT count(*) AS count FROM ${table}`).get()
          ?.count,
      ).toBeGreaterThan(0);
    }
    database.close();
    expect(inspectExpiredDrafts(databasePath, 200).eligibleDrafts).toBe(0);
  });
});

test('changed association, different database and future cutoff refuse without deletion', () => {
  fixture((databasePath) => {
    seededDatabase(databasePath);
    const plan = inspectExpiredDrafts(databasePath, 200);
    const copiedPath = join(join(databasePath, '..'), 'copy.sqlite');
    copyFileSync(databasePath, copiedPath);
    expect(() => purgeExpiredDrafts(copiedPath, 200, plan.fingerprint, 200)).toThrow(/changed/);
    expect(draftIds(copiedPath)).toHaveLength(8);
    const database = new Database(databasePath);
    database.run(
      "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('new-proposal', 'eligible-a', 'new@example.test', '', 'new-receipt', 'submitted', 1, 1)",
    );
    database.close();
    expect(() => purgeExpiredDrafts(databasePath, 200, plan.fingerprint, 200)).toThrow(/changed/);
    expect(draftIds(databasePath)).toHaveLength(8);
    const futurePlan = inspectExpiredDrafts(databasePath, 201);
    expect(() => purgeExpiredDrafts(databasePath, 201, futurePlan.fingerprint, 200)).toThrow(
      /future/,
    );
    expect(draftIds(databasePath)).toHaveLength(8);
  });
});

test('a later delete fault rolls back an earlier candidate deletion', () => {
  fixture((databasePath) => {
    seededDatabase(databasePath);
    const plan = inspectExpiredDrafts(databasePath, 200);
    withSecondDeleteFault('throw', (attempts) => {
      expect(() => purgeExpiredDrafts(databasePath, 200, plan.fingerprint, 200)).toThrow(
        /injected second delete/,
      );
      expect(attempts()).toBe(2);
    });
    expect(draftIds(databasePath)).toContain('eligible-a');
    expect(draftIds(databasePath)).toContain('eligible-b');
  });
});

test('a statement reporting no second deletion rolls back the first', () => {
  fixture((databasePath) => {
    seededDatabase(databasePath);
    const plan = inspectExpiredDrafts(databasePath, 200);
    withSecondDeleteFault('zero', (attempts) => {
      expect(() => purgeExpiredDrafts(databasePath, 200, plan.fingerprint, 200)).toThrow(
        /deletion count/,
      );
      expect(attempts()).toBe(2);
    });
    expect(draftIds(databasePath)).toContain('eligible-a');
    expect(draftIds(databasePath)).toContain('eligible-b');
  });
});

test('maintenance rejects absent, unreadable, malformed and unknown databases', () => {
  fixture((databasePath) => {
    expect(() => inspectExpiredDrafts(databasePath, 200)).toThrow();
    expect(() => purgeExpiredDrafts(databasePath, 200, 'a'.repeat(64), 200)).toThrow();
    expect(existsSync(databasePath)).toBe(false);
    const absentParent = join(databasePath, 'nested');
    expect(() => inspectExpiredDrafts(join(absentParent, 'missing.sqlite'), 200)).toThrow();
    expect(existsSync(absentParent)).toBe(false);
    expect(() => inspectExpiredDrafts(join(databasePath, '..'), 200)).toThrow(/readable/);
    writeFileSync(databasePath, 'not a database');
    expect(() => inspectExpiredDrafts(databasePath, 200)).toThrow();
    rmSync(databasePath);
    seededDatabase(databasePath);
    chmodSync(databasePath, 0o000);
    expect(() => inspectExpiredDrafts(databasePath, 200)).toThrow(/readable/);
    chmodSync(databasePath, 0o600);
    const reviewed = inspectExpiredDrafts(databasePath, 200);
    chmodSync(databasePath, 0o400);
    expect(() => purgeExpiredDrafts(databasePath, 200, reviewed.fingerprint, 200)).toThrow(
      /readable/,
    );
    chmodSync(databasePath, 0o600);
    const database = new Database(databasePath);
    database.run("INSERT INTO schema_migration VALUES ('999_unknown', 'bad')");
    database.close();
    expect(() => inspectExpiredDrafts(databasePath, 200)).toThrow(/migrations/);
    const fix = new Database(databasePath);
    fix.run("DELETE FROM schema_migration WHERE name = '999_unknown'");
    fix.run("UPDATE schema_migration SET checksum = 'edited' WHERE name = '005_chat_operation'");
    fix.close();
    expect(() => inspectExpiredDrafts(databasePath, 200)).toThrow(/edited/);
  });
});

test('maintenance rejects a database with failed integrity or incompatible schema', () => {
  fixture((databasePath) => {
    seededDatabase(databasePath);
    const query = Reflect.get(Database.prototype, 'query');
    Reflect.set(Database.prototype, 'query', function (this: Database, sql: string) {
      if (sql === 'PRAGMA integrity_check')
        return { get: () => ({ integrity_check: 'injected corruption' }) };
      return Reflect.apply(query, this, [sql]);
    });
    try {
      expect(() => inspectExpiredDrafts(databasePath, 200)).toThrow(/integrity/);
    } finally {
      Reflect.set(Database.prototype, 'query', query);
    }
  });
  fixture((databasePath) => {
    seededDatabase(databasePath);
    const database = new Database(databasePath);
    database.run('DROP TABLE submission_replay');
    database.close();
    expect(() => inspectExpiredDrafts(databasePath, 200)).toThrow(/schema/);
    expect(() => purgeExpiredDrafts(databasePath, 200, 'a'.repeat(64), 200)).toThrow(/schema/);
    expect(draftIds(databasePath)).toHaveLength(8);
  });
  fixture((databasePath) => {
    seededDatabase(databasePath);
    const database = new Database(databasePath);
    database.run('CREATE TABLE unsupported_extension (id TEXT)');
    database.close();
    expect(() => inspectExpiredDrafts(databasePath, 200)).toThrow(/schema/);
  });
});

test('unapproved delete triggers refuse before they can suppress deletion or change protected rows', () => {
  for (const trigger of [
    "CREATE TRIGGER ignore_second BEFORE DELETE ON intake_draft WHEN OLD.id = 'eligible-b' BEGIN SELECT RAISE(IGNORE); END",
    "CREATE TRIGGER mutate_proposal AFTER DELETE ON intake_draft BEGIN UPDATE proposal_submission SET email = 'mutated@example.test'; END",
  ]) {
    fixture((databasePath) => {
      seededDatabase(databasePath);
      const plan = inspectExpiredDrafts(databasePath, 200);
      const database = new Database(databasePath);
      database.run(trigger);
      database.close();
      expect(() => purgeExpiredDrafts(databasePath, 200, plan.fingerprint, 200)).toThrow(/schema/);
      expect(() => inspectExpiredDrafts(databasePath, 200)).toThrow(/schema/);
      expect(draftIds(databasePath)).toContain('eligible-a');
      expect(draftIds(databasePath)).toContain('eligible-b');
      const check = new Database(databasePath, { readonly: true });
      expect(
        check
          .query<{ email: string }, []>(
            "SELECT email FROM proposal_submission WHERE id = 'proposal-1'",
          )
          .get()?.email,
      ).toBe('secret@example.test');
      check.close();
    });
  }
});

test('inspection leaves an in-flight operation and provider hold untouched', () => {
  fixture((databasePath) => {
    seededDatabase(databasePath);
    const database = new Database(databasePath);
    database.run(
      "INSERT INTO provider_call (id, account_id, utc_day, reserved_micro_usd, created_at, request_id) VALUES ('call-1', 'owner-1', '2026-09-29', 100, 1, 'request-1')",
    );
    database.run(
      "INSERT INTO chat_operation (id, account_id, request_id, idempotency_key, body_hash, message, initial, state, provider_call_id, created_at) VALUES ('operation-1', 'owner-1', 'request-1', 'key-1', 'hash-1', 'private message', 0, 'inflight', 'call-1', 1)",
    );
    database.close();
    expect(inspectExpiredDrafts(databasePath, 200).eligibleDrafts).toBe(2);
    const check = new Database(databasePath, { readonly: true });
    expect(
      check
        .query<{ state: string }, []>("SELECT state FROM chat_operation WHERE id = 'operation-1'")
        .get()?.state,
    ).toBe('inflight');
    expect(
      check
        .query<{ reserved_micro_usd: number }, []>(
          "SELECT reserved_micro_usd FROM provider_call WHERE id = 'call-1'",
        )
        .get()?.reserved_micro_usd,
    ).toBe(100);
    check.close();
  });
});
