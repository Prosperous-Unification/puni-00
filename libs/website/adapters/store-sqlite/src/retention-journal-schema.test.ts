import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';

import { websiteMigrations } from './migration-catalogue';
import { WebsiteStore } from './store';

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

const fenced = 'retention: subject content is fenced';
const journalMigration = '010_retention_journal';

function databaseFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni-retention-journal-schema-'));
  directories.push(directory);
  return join(directory, 'website.sqlite');
}

function migration(name: string): { name: string; directory: string } {
  const found = websiteMigrations().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing migration ${name}`);
  return found;
}

/** Applies the catalogue's migrations strictly before `name` with raw SQL, as an older binary did. */
function migrateBefore(database: Database, name: string): void {
  database.run('CREATE TABLE schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
  for (const earlier of websiteMigrations().filter((candidate) => candidate.name < name)) {
    const forward = readFileSync(join(earlier.directory, 'migration.sql'), 'utf8');
    database.run(forward);
    database
      .query('INSERT INTO schema_migration (name, checksum) VALUES (?, ?)')
      .run(earlier.name, createHash('sha256').update(forward).digest('hex'));
  }
}

/**
 * Seeds an account request `req-a` on `draft-a` and a standalone manual proposal `sub-m` on
 * `draft-m`, each with content in every table that can hold it, plus an unrelated `req-b`.
 */
function seedSubjects(database: Database): void {
  database.run(`
    INSERT INTO prospect_account (id, email, created_at) VALUES
      ('acct', 'owner@example.test', 10), ('acct-b', 'other@example.test', 10);
    INSERT INTO intake_draft (id, description, brief, claim_hash, created_at, expires_at, consumed_at) VALUES
      ('draft-a', 'request text', 'request brief', 'claim-a', 10, 99999, 20),
      ('draft-m', 'manual text', 'manual brief', 'claim-m', 10, 99999, 20);
    INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at) VALUES
      ('req-a', 'acct', 'draft-a', 'request text', 'request brief', 10),
      ('req-b', 'acct-b', NULL, 'other text', '', 10);
    INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES
      ('sub-m', 'draft-m', 'manual@example.test', 'manual brief', 'receipt-m', 'submitted', 20, 20);
    INSERT INTO chat_turn (id, account_id, role, content, created_at, request_id) VALUES
      ('turn-a', 'acct', 'user', 'hello', 20, 'req-a');
    INSERT INTO chat_operation (id, account_id, request_id, idempotency_key, body_hash, message, initial, state, created_at) VALUES
      ('op-a', 'acct', 'req-a', 'key-a', 'hash', 'hello', 1, 'inflight', 20);
    INSERT INTO request_concept_preview (request_id, body, created_at) VALUES ('req-a', 'concept', 20);
    INSERT INTO conversation (id, draft_id, source_hash, state, created_at) VALUES
      ('conv-a', 'draft-a', 'source', 'open', 10), ('conv-m', 'draft-m', 'source', 'open', 10);
    INSERT INTO conversation_turn (id, conversation_id, role, content, created_at) VALUES
      ('cturn-a', 'conv-a', 'user', 'hi', 20), ('cturn-m', 'conv-m', 'user', 'hi', 20);
    INSERT INTO conversation_operation (id, conversation_id, idempotency_key, source_hash, body_hash, message, initial, stage, prompt_version, state, utc_day, created_at) VALUES
      ('cop-m', 'conv-m', 'key-m', 'source', 'hash', 'hi', 1, 'clarify', 'v1', 'inflight', '1970-01-01', 20);
    INSERT INTO account_request (account_id, description, brief, created_at, draft_id) VALUES
      ('acct', 'legacy text', 'legacy brief', 5, 'draft-a');
    INSERT INTO concept_preview (account_id, body, created_at) VALUES ('acct', 'legacy concept', 5);
    INSERT INTO retention_subject (subject_kind, subject_id, resolution, anchor_at, deadline_at, anchor_source) VALUES
      ('software_request', 'req-a', 'anchored', 10, 1000, 'draft'),
      ('proposal_submission', 'sub-m', 'anchored', 10, 1000, 'draft'),
      ('software_request', 'req-b', 'anchored', 10, 1000, 'first_write');
  `);
}

/** A 010 database whose `req-a` and `sub-m` subjects are in `state`. */
function fencedDatabase(state: 'fenced' | 'erased'): Database {
  const databasePath = databaseFile();
  new WebsiteStore(databasePath).close();
  const database = new Database(databasePath);
  seedSubjects(database);
  database.run(
    `UPDATE retention_subject SET erasure_state = '${state}' WHERE subject_id IN ('req-a', 'sub-m')`,
  );
  return database;
}

/** One content table's raw writes, in the SQL a 009 binary sends. */
interface FenceCase {
  table: string;
  insert: string;
  update: string;
  blank: string;
}

const fenceCases: FenceCase[] = [
  {
    table: 'software_request',
    insert:
      "INSERT INTO software_request (id, account_id, description, brief, created_at) VALUES ('req-a', 'acct', 'again', '', 30)",
    update: "UPDATE software_request SET brief = 'new brief' WHERE id = 'req-a'",
    blank: "UPDATE software_request SET description = '', brief = '' WHERE id = 'req-a'",
  },
  {
    table: 'intake_draft',
    insert:
      "INSERT INTO intake_draft (id, description, claim_hash, created_at, expires_at) VALUES ('draft-m', 'again', 'claim-x', 30, 99999)",
    update: "UPDATE intake_draft SET description = 'new text' WHERE id = 'draft-a'",
    blank:
      "UPDATE intake_draft SET description = '', brief = '' WHERE id IN ('draft-a', 'draft-m')",
  },
  {
    table: 'proposal_submission',
    insert:
      "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('sub-x', 'draft-m', 'x@example.test', 'b', 'receipt-x', 'submitted', 30, 30)",
    update: "UPDATE proposal_submission SET email = 'new@example.test' WHERE id = 'sub-m'",
    blank: "UPDATE proposal_submission SET email = '', brief = '' WHERE id = 'sub-m'",
  },
  {
    table: 'chat_turn',
    insert:
      "INSERT INTO chat_turn (id, account_id, role, content, created_at, request_id) VALUES ('turn-x', 'acct', 'assistant', 'late reply', 30, 'req-a')",
    update: "UPDATE chat_turn SET content = 'edited' WHERE id = 'turn-a'",
    blank: "UPDATE chat_turn SET content = '' WHERE id = 'turn-a'",
  },
  {
    table: 'chat_operation',
    insert:
      "INSERT INTO chat_operation (id, account_id, request_id, idempotency_key, body_hash, message, initial, state, created_at) VALUES ('op-x', 'acct', 'req-a', 'key-x', 'hash', 'more', 0, 'inflight', 30)",
    update: "UPDATE chat_operation SET state = 'completed', reply = 'late reply' WHERE id = 'op-a'",
    blank: "UPDATE chat_operation SET message = '', reply = '' WHERE id = 'op-a'",
  },
  {
    table: 'request_concept_preview',
    insert:
      "INSERT OR IGNORE INTO request_concept_preview (request_id, body, created_at) VALUES ('req-a', 'again', 30)",
    update: "UPDATE request_concept_preview SET body = 'revised' WHERE request_id = 'req-a'",
    blank: "UPDATE request_concept_preview SET body = '' WHERE request_id = 'req-a'",
  },
  {
    table: 'conversation_turn',
    insert:
      "INSERT INTO conversation_turn (id, conversation_id, role, content, created_at) VALUES ('cturn-x', 'conv-a', 'assistant', 'late reply', 30)",
    update: "UPDATE conversation_turn SET content = 'edited' WHERE id = 'cturn-m'",
    blank: "UPDATE conversation_turn SET content = '' WHERE id IN ('cturn-a', 'cturn-m')",
  },
  {
    table: 'conversation_operation',
    insert:
      "INSERT INTO conversation_operation (id, conversation_id, idempotency_key, source_hash, body_hash, message, initial, stage, prompt_version, state, utc_day, created_at) VALUES ('cop-x', 'conv-m', 'key-x', 'source', 'hash', 'more', 0, 'clarify', 'v1', 'inflight', '1970-01-01', 30)",
    update:
      "UPDATE conversation_operation SET state = 'completed', settlement = 'usage', reply = 'late reply' WHERE id = 'cop-m'",
    blank: "UPDATE conversation_operation SET message = '', reply = NULL WHERE id = 'cop-m'",
  },
  {
    table: 'account_request',
    insert:
      "INSERT OR REPLACE INTO account_request (account_id, description, brief, created_at) VALUES ('acct', 'again', '', 30)",
    update: "UPDATE account_request SET brief = 'edited' WHERE account_id = 'acct'",
    blank: "UPDATE account_request SET description = '', brief = '' WHERE account_id = 'acct'",
  },
  {
    table: 'concept_preview',
    insert:
      "INSERT OR REPLACE INTO concept_preview (account_id, body, created_at) VALUES ('acct', 'again', 30)",
    update: "UPDATE concept_preview SET body = 'edited' WHERE account_id = 'acct'",
    blank: "UPDATE concept_preview SET body = '' WHERE account_id = 'acct'",
  },
];

test('010 applies over 009 and rolls back to the exact 009 schema', () => {
  const databasePath = databaseFile();
  const older = new Database(databasePath, { create: true });
  migrateBefore(older, journalMigration);
  seedSubjects(older);
  older.close();
  new WebsiteStore(databasePath).close();
  const database = new Database(databasePath);
  const expected = new Database(':memory:');
  try {
    expect(
      database
        .query(
          'SELECT applied_sequence, journal_id, applied_hash, head_version_id, head_sequence_seen, state FROM retention_journal_position',
        )
        .all(),
    ).toEqual([
      {
        applied_sequence: 0,
        journal_id: null,
        applied_hash: '0'.repeat(64),
        head_version_id: null,
        head_sequence_seen: 0,
        state: 'detached',
      },
    ]);
    expect(
      database
        .query(
          "SELECT DISTINCT erasure_state FROM retention_subject WHERE subject_id IN ('req-a', 'sub-m', 'req-b')",
        )
        .all(),
    ).toEqual([{ erasure_state: 'none' }]);
    migrateBefore(expected, journalMigration);
    database.run(readFileSync(join(migration(journalMigration).directory, 'down.sql'), 'utf8'));
    const schema =
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name";
    expect(database.query(schema).all()).toEqual(expected.query(schema).all());
  } finally {
    database.close();
    expected.close();
  }
});

for (const fenceCase of fenceCases)
  test(`a fenced subject refuses an older binary's content write: ${fenceCase.table}`, () => {
    for (const state of ['fenced', 'erased'] as const) {
      const database = fencedDatabase(state);
      try {
        expect(() => database.run(fenceCase.insert)).toThrow(fenced);
        expect(() => database.run(fenceCase.update)).toThrow(fenced);
      } finally {
        database.close();
      }
    }
  });

test('a fenced subject accepts blanking', () => {
  const database = fencedDatabase('fenced');
  try {
    for (const fenceCase of fenceCases) expect(() => database.run(fenceCase.blank)).not.toThrow();
    database.run("UPDATE retention_subject SET erasure_state = 'erased', erased_at = 40");
    for (const fenceCase of fenceCases) expect(() => database.run(fenceCase.blank)).not.toThrow();
  } finally {
    database.close();
  }
});

test('the fence leaves other subjects writable', () => {
  const database = fencedDatabase('erased');
  try {
    database.run(
      "INSERT INTO chat_turn (id, account_id, role, content, created_at, request_id) VALUES ('turn-b', 'acct-b', 'user', 'still mine', 30, 'req-b')",
    );
    database.run("UPDATE software_request SET brief = 'still mine' WHERE id = 'req-b'");
    database.run("UPDATE chat_operation SET state = 'unknown' WHERE id = 'op-a'");
    expect(
      database
        .query<{ brief: string }, []>("SELECT brief FROM software_request WHERE id = 'req-b'")
        .get(),
    ).toEqual({ brief: 'still mine' });
  } finally {
    database.close();
  }
});

test('erasure is final in the schema', () => {
  const database = fencedDatabase('erased');
  try {
    expect(() =>
      database.run(
        "UPDATE retention_subject SET erasure_state = 'none' WHERE subject_id = 'req-a'",
      ),
    ).toThrow('retention erasure is final');
    database.run("UPDATE retention_subject SET erasure_state = 'none' WHERE subject_id = 'req-b'");
  } finally {
    database.close();
  }
});

test('the applied-event mirror is append-only', () => {
  const databasePath = databaseFile();
  new WebsiteStore(databasePath).close();
  const database = new Database(databasePath);
  try {
    database.run(
      `INSERT INTO retention_journal_applied (sequence, hash, event_type, subject_kind, subject_id, applied_at) VALUES (1, '${'a'.repeat(64)}', 'place_hold', 'software_request', 'req-a', 10)`,
    );
    expect(() => database.run('UPDATE retention_journal_applied SET applied_at = 11')).toThrow(
      'retention journal mirror is append-only',
    );
    expect(() => database.run('DELETE FROM retention_journal_applied')).toThrow(
      'retention journal mirror is append-only',
    );
  } finally {
    database.close();
  }
});

test('migration lint accepts 010', async () => {
  const directory = migration(journalMigration).directory;
  const lint = Bun.spawn(
    [
      'bun',
      'run',
      join(import.meta.dir, '../../../../../tools/tool-git-hooks/src/hooks/migration-lint.ts'),
      join(directory, 'migration.sql'),
      join(directory, 'down.sql'),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const exitCode = await lint.exited;
  expect({ exitCode, error: await new Response(lint.stderr).text() }).toEqual({
    exitCode: 0,
    error: '',
  });
});
