import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';

import {
  compactAfterErasure,
  eraseSubjectContent,
  ErasureRefusedError,
  fenceSubject,
  prepareErasureConnection,
  type RetentionSubjectRef,
  WebsiteStore,
} from './store';

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

const sentinel = 'SECRET';
const accountRequest: RetentionSubjectRef = { kind: 'software_request', id: 'req-a' };
const manualProposal: RetentionSubjectRef = { kind: 'proposal_submission', id: 'sub-m' };

function databaseFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni-request-erasure-'));
  directories.push(directory);
  return join(directory, 'website.sqlite');
}

function openDatabase(): Database {
  const databasePath = databaseFile();
  new WebsiteStore(databasePath).close();
  const database = new Database(databasePath);
  database.run('PRAGMA foreign_keys = ON');
  return database;
}

/**
 * Account `acct` owns request `req-a` (draft `draft-a`) with sentinel text in every current
 * and legacy table, a submission on that draft, replay rows, sign-in rows and a paid call;
 * `sub-m` is a standalone manual proposal on `draft-m` with no account.
 */
function seedAccountRequest(database: Database): void {
  database.run(`
    INSERT INTO prospect_account (id, email, created_at) VALUES ('acct', '${sentinel}-owner@example.test', 10);
    INSERT INTO intake_draft (id, description, brief, claim_hash, created_at, expires_at, consumed_at) VALUES
      ('draft-a', '${sentinel} request text', '${sentinel} draft brief', 'claim-a', 10, 99999, 20);
    INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at, submitted_at) VALUES
      ('req-a', 'acct', 'draft-a', '${sentinel} request text', '${sentinel} request brief', 10, 30);
    INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES
      ('sub-a', 'draft-a', '${sentinel}-owner@example.test', '${sentinel} brief', 'receipt-a', 'submitted', 30, 30);
    INSERT INTO submission_replay (claim_hash, idempotency_key, body_hash, receipt, expires_at, request_id) VALUES
      ('claim-a', 'key-1', '${sentinel}-hash', '${sentinel}-receipt', 99999, 'req-a');
    INSERT INTO provider_call (id, account_id, utc_day, reserved_micro_usd, settled_micro_usd, created_at, request_id) VALUES
      ('call-a', 'acct', '1970-01-01', 900, 700, 20, 'req-a');
    INSERT INTO chat_turn (id, account_id, role, content, created_at, request_id) VALUES
      ('turn-a', 'acct', 'user', '${sentinel} hello', 20, 'req-a');
    INSERT INTO chat_operation (id, account_id, request_id, idempotency_key, body_hash, message, initial, state, provider_call_id, reply, created_at) VALUES
      ('op-a', 'acct', 'req-a', 'key-a', 'hash', '${sentinel} hello', 1, 'completed', 'call-a', '${sentinel} reply', 20);
    INSERT INTO request_concept_preview (request_id, body, created_at) VALUES ('req-a', '${sentinel} concept', 25);
    INSERT INTO conversation (id, draft_id, source_hash, state, created_at) VALUES ('conv-a', 'draft-a', 'source', 'handed_off', 10);
    INSERT INTO conversation_turn (id, conversation_id, role, content, created_at) VALUES ('cturn-a', 'conv-a', 'user', '${sentinel} hi', 11);
    INSERT INTO conversation_operation (id, conversation_id, idempotency_key, source_hash, body_hash, message, initial, stage, prompt_version, state, utc_day, reserved_micro_usd, settled_micro_usd, settlement, reply, created_at) VALUES
      ('cop-a', 'conv-a', 'key-c', 'source', 'hash', '${sentinel} hi', 1, 'clarify', 'v1', 'completed', '1970-01-01', 500, 400, 'usage', '${sentinel} answer', 11);
    INSERT INTO account_request (account_id, description, brief, created_at, draft_id) VALUES
      ('acct', '${sentinel} legacy text', '${sentinel} legacy brief', 10, 'draft-a');
    INSERT INTO concept_preview (account_id, body, created_at) VALUES ('acct', '${sentinel} legacy concept', 25);
    INSERT INTO oidc_identity (issuer, subject, account_id) VALUES ('https://issuer.example.test', 'subject-1', 'acct');
    INSERT INTO prospect_session (token_hash, account_id, csrf_hash, expires_at) VALUES ('token-1', 'acct', 'csrf-1', 99999);
    INSERT INTO retention_subject (subject_kind, subject_id, resolution, anchor_at, deadline_at, anchor_source) VALUES
      ('software_request', 'req-a', 'anchored', 10, 1000, 'draft');
  `);
}

function seedManualProposal(database: Database): void {
  database.run(`
    INSERT INTO intake_draft (id, description, brief, claim_hash, created_at, expires_at, consumed_at) VALUES
      ('draft-m', '${sentinel} manual text', '${sentinel} manual brief', 'claim-m', 10, 99999, 20);
    INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES
      ('sub-m', 'draft-m', '${sentinel}-manual@example.test', '${sentinel} manual brief', 'receipt-m', 'closed', 20, 40);
    INSERT INTO submission_replay (claim_hash, idempotency_key, body_hash, receipt, expires_at) VALUES
      ('claim-m', 'key-m', '${sentinel}-hash', '${sentinel}-receipt', 99999);
    INSERT INTO conversation (id, draft_id, source_hash, state, created_at) VALUES ('conv-m', 'draft-m', 'source', 'handed_off', 10);
    INSERT INTO conversation_turn (id, conversation_id, role, content, created_at) VALUES ('cturn-m', 'conv-m', 'user', '${sentinel} hi', 11);
    INSERT INTO retention_subject (subject_kind, subject_id, resolution, anchor_at, deadline_at, anchor_source) VALUES
      ('proposal_submission', 'sub-m', 'anchored', 10, 1000, 'draft');
  `);
}

/** Every `table.column` whose text still contains the sentinel. */
function sentinelColumns(database: Database): string[] {
  const found: string[] = [];
  const tables = database
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  for (const { name } of tables)
    for (const column of database
      .query<{ name: string; type: string }, []>(
        `SELECT name, type FROM pragma_table_info('${name}')`,
      )
      .all())
      if (
        column.type === 'TEXT' &&
        (database
          .query<{ count: number }, [string]>(
            `SELECT count(*) AS count FROM "${name}" WHERE "${column.name}" LIKE ?`,
          )
          .get(`%${sentinel}%`)?.count ?? 0) > 0
      )
        found.push(`${name}.${column.name}`);
  return found;
}

function erase(database: Database, subject: RetentionSubjectRef, sequence: number) {
  fenceSubject(database, subject);
  return database
    .transaction(() => eraseSubjectContent(database, subject, sequence, 500))
    .immediate();
}

test('a due account request is blanked in every current and legacy table', () => {
  const database = openDatabase();
  try {
    seedAccountRequest(database);
    expect(sentinelColumns(database).length).toBeGreaterThan(10);
    expect(erase(database, accountRequest, 1)).toEqual({ kind: 'erased', identityErased: true });
    expect(sentinelColumns(database)).toEqual([]);
    expect(
      database
        .query(
          "SELECT erasure_state, erasure_sequence, erased_at FROM retention_subject WHERE subject_id = 'req-a'",
        )
        .get(),
    ).toEqual({ erasure_state: 'erased', erasure_sequence: 1, erased_at: 500 });
    expect(database.query("SELECT email FROM prospect_account WHERE id = 'acct'").get()).toEqual({
      email: 'erased:acct',
    });
    expect(
      database
        .query(
          'SELECT (SELECT count(*) FROM oidc_identity) AS links, (SELECT count(*) FROM prospect_session) AS sessions',
        )
        .get(),
    ).toEqual({ links: 0, sessions: 0 });
    expect(
      database
        .query(
          "SELECT reserved_micro_usd, settled_micro_usd FROM provider_call WHERE id = 'call-a'",
        )
        .get(),
    ).toEqual({ reserved_micro_usd: 900, settled_micro_usd: 700 });
    expect(
      database
        .query(
          "SELECT state, settlement, settled_micro_usd FROM conversation_operation WHERE id = 'cop-a'",
        )
        .get(),
    ).toEqual({ state: 'completed', settlement: 'usage', settled_micro_usd: 400 });
  } finally {
    database.close();
  }
});

test('a standalone manual proposal is blanked with no account row', () => {
  const database = openDatabase();
  try {
    seedManualProposal(database);
    expect(erase(database, manualProposal, 2)).toEqual({ kind: 'erased', identityErased: false });
    expect(sentinelColumns(database)).toEqual([]);
    expect(
      database.query("SELECT status, receipt FROM proposal_submission WHERE id = 'sub-m'").get(),
    ).toEqual({ status: 'closed', receipt: 'receipt-m' });
  } finally {
    database.close();
  }
});

/** Account `acct` with requests `req-1` (due) and `req-2`, both holding content. */
function seedSharedAccount(database: Database, second: 'hold' | 'blank'): void {
  database.run(`
    INSERT INTO prospect_account (id, email, created_at) VALUES ('acct', 'owner@example.test', 10);
    INSERT INTO software_request (id, account_id, description, brief, created_at, submitted_at) VALUES
      ('req-1', 'acct', '${sentinel} one', '', 10, 20),
      ('req-2', 'acct', '${second === 'hold' ? 'kept text' : ''}', '', 30, NULL);
    INSERT INTO oidc_identity (issuer, subject, account_id) VALUES ('https://issuer.example.test', 'subject-1', 'acct');
    INSERT INTO retention_subject (subject_kind, subject_id, resolution, anchor_at, deadline_at, anchor_source, classification) VALUES
      ('software_request', 'req-1', 'anchored', 10, 1000, 'first_write', 'non_client'),
      ('software_request', 'req-2', ${second === 'hold' ? "'anchored', 10, 1000, 'first_write', 'hold'" : "'pending_content', NULL, NULL, NULL, 'non_client'"});
  `);
}

test('two due requests sharing an account keep the email while one is held', () => {
  const database = openDatabase();
  try {
    seedSharedAccount(database, 'hold');
    expect(erase(database, { kind: 'software_request', id: 'req-1' }, 1)).toEqual({
      kind: 'erased',
      identityErased: false,
    });
    expect(database.query("SELECT email FROM prospect_account WHERE id = 'acct'").get()).toEqual({
      email: 'owner@example.test',
    });
    expect(database.query('SELECT count(*) AS links FROM oidc_identity').get()).toEqual({
      links: 1,
    });
    expect(() => {
      fenceSubject(database, { kind: 'software_request', id: 'req-2' });
    }).toThrow(ErasureRefusedError);
  } finally {
    database.close();
  }
});

test('an empty placeholder never retains the email', () => {
  const database = openDatabase();
  try {
    seedSharedAccount(database, 'blank');
    expect(erase(database, { kind: 'software_request', id: 'req-1' }, 1)).toEqual({
      kind: 'erased',
      identityErased: true,
    });
    expect(database.query("SELECT email FROM prospect_account WHERE id = 'acct'").get()).toEqual({
      email: 'erased:acct',
    });
  } finally {
    database.close();
  }
});

test('fencing refuses a client or held subject', () => {
  const database = openDatabase();
  try {
    seedSharedAccount(database, 'hold');
    database.run(
      "UPDATE retention_subject SET classification = 'client' WHERE subject_id = 'req-1'",
    );
    for (const id of ['req-1', 'req-2'])
      expect(() => {
        fenceSubject(database, { kind: 'software_request', id });
      }).toThrow('refused: classification');
    expect(database.query('SELECT DISTINCT erasure_state FROM retention_subject').all()).toEqual([
      { erasure_state: 'none' },
    ]);
  } finally {
    database.close();
  }
});

test('shared draft lineage is refused, not erased', () => {
  const database = openDatabase();
  try {
    seedAccountRequest(database);
    seedManualProposal(database);
    database.run(`
      INSERT INTO prospect_account (id, email, created_at) VALUES ('other', 'other@example.test', 10);
      INSERT INTO account_request (account_id, description, brief, created_at, draft_id) VALUES
        ('other', '${sentinel} other legacy', '', 10, 'draft-a');
    `);
    const before = sentinelColumns(database);
    expect(() => erase(database, accountRequest, 1)).toThrow('another subject names its draft');
    database.run("UPDATE account_request SET draft_id = 'draft-m' WHERE account_id = 'other'");
    expect(() => erase(database, manualProposal, 2)).toThrow('legacy account row names its draft');
    expect(sentinelColumns(database)).toEqual(before);
    expect(
      database
        .query('SELECT subject_id, erasure_state FROM retention_subject ORDER BY subject_id')
        .all(),
    ).toEqual([
      { subject_id: 'req-a', erasure_state: 'fenced' },
      { subject_id: 'sub-m', erasure_state: 'fenced' },
    ]);
  } finally {
    database.close();
  }
});

test('erasure is idempotent', () => {
  const database = openDatabase();
  try {
    seedAccountRequest(database);
    erase(database, accountRequest, 1);
    const replayed = database
      .transaction(() => eraseSubjectContent(database, accountRequest, 7, 900))
      .immediate();
    expect(replayed).toEqual({ kind: 'already_erased', identityErased: false });
    expect(sentinelColumns(database)).toEqual([]);
    expect(
      database
        .query(
          "SELECT erasure_sequence, erased_at FROM retention_subject WHERE subject_id = 'req-a'",
        )
        .get(),
    ).toEqual({ erasure_sequence: 1, erased_at: 500 });
    expect(
      database.transaction(() =>
        eraseSubjectContent(database, { kind: 'software_request', id: 'absent' }, 8, 900),
      )(),
    ).toEqual({ kind: 'tombstone', identityErased: false });
  } finally {
    database.close();
  }
});

test('unknown provider usage keeps its reservation', () => {
  const databasePath = databaseFile();
  const store = new WebsiteStore(databasePath);
  try {
    const account = store.createProspect('owner@example.test', 100);
    store.ensureBlankRequest(account.id, 100);
    const request = store.findAccountRequest(account.id);
    if (!request) throw new Error('No active request');
    const admission = store.admitChatOperation(
      account.id,
      request.id,
      'key-12345678',
      'hash',
      `${sentinel} build me a shop`,
      true,
      900,
      200,
    );
    if (admission.kind !== 'started') throw new Error(`Admission ${admission.kind}`);
    const database = new Database(databasePath);
    try {
      fenceSubject(database, { kind: 'software_request', id: request.id });
      expect(
        database.query('SELECT state FROM chat_operation WHERE id = ?').get(admission.id),
      ).toEqual({ state: 'unknown' });
    } finally {
      database.close();
    }
    expect(store.completeChatOperation(admission.id, `${sentinel} reply`, 700, 300)).toBe(false);
    expect(store.listTurns(request.id)).toEqual([]);
    expect(
      store.admitChatOperation(
        account.id,
        request.id,
        'key-87654321',
        'hash-2',
        'more',
        false,
        null,
        400,
      ),
    ).toEqual({ kind: 'request_unavailable' });
  } finally {
    store.close();
  }
  const database = new Database(databasePath);
  try {
    expect(
      database.query('SELECT reserved_micro_usd, settled_micro_usd FROM provider_call').all(),
    ).toEqual([{ reserved_micro_usd: 900, settled_micro_usd: null }]);
  } finally {
    database.close();
  }
});

test('erased text is absent from the database file and a fresh VACUUM INTO backup', () => {
  const database = openDatabase();
  const backupPath = `${database.filename}.backup`;
  try {
    prepareErasureConnection(database);
    seedAccountRequest(database);
    seedManualProposal(database);
    const raw = (path: string) => readFileSync(path).includes(Buffer.from(sentinel));
    expect(raw(database.filename)).toBe(true);
    erase(database, accountRequest, 1);
    erase(database, manualProposal, 2);
    compactAfterErasure(database);
    database.run(`VACUUM INTO '${backupPath}'`);
    expect({ file: raw(database.filename), backup: raw(backupPath) }).toEqual({
      file: false,
      backup: false,
    });
  } finally {
    database.close();
  }
});
