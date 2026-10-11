import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { websiteMigrations } from './migration-catalogue';
import {
  addUtcMonths,
  assertRetentionCoverage,
  inspectRequestRetention,
  listAmbiguousRetentionSubjects,
  resolveRetentionAnchor,
  WebsiteStore,
} from './store';
import { seedLegacyRequest } from './testing/legacy-account-fixture';

const leapDay = Date.UTC(2024, 1, 29, 15, 0, 0, 0);
const leapDeadline = Date.UTC(2025, 1, 28, 15, 0, 0, 0);

interface SubjectRow {
  subject_kind: string;
  subject_id: string;
  resolution: string;
  ambiguity: string | null;
  anchor_at: number | null;
  deadline_at: number | null;
  anchor_source: string | null;
}

function fixture(run: (databasePath: string, directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'puni-request-retention-'));
  try {
    run(join(directory, 'website.sqlite'), directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function subjects(databasePath: string): SubjectRow[] {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database
      .query<SubjectRow, []>(
        'SELECT subject_kind, subject_id, resolution, ambiguity, anchor_at, deadline_at, anchor_source FROM retention_subject ORDER BY subject_kind, subject_id',
      )
      .all();
  } finally {
    database.close();
  }
}

function subject(databasePath: string, kind: string, id: string): SubjectRow | undefined {
  return subjects(databasePath).find((row) => row.subject_kind === kind && row.subject_id === id);
}

function applyMigrations(database: Database, names: readonly string[]): void {
  database.run(
    'CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)',
  );
  for (const migration of websiteMigrations().filter(({ name }) => names.includes(name))) {
    const forward = readFileSync(join(migration.directory, 'migration.sql'), 'utf8');
    database.run(forward);
    database
      .query('INSERT INTO schema_migration (name, checksum) VALUES (?, ?)')
      .run(migration.name, createHash('sha256').update(forward).digest('hex'));
  }
}

/** Builds a database that reached 005 through the real legacy migrations, then seeds historic lineage. */
function historicDatabase(databasePath: string): void {
  const database = new Database(databasePath, { create: true });
  try {
    applyMigrations(database, ['001_initial', '002_m2', '003_account_submission']);
    database.run(
      `INSERT INTO intake_draft (id, description, brief, claim_hash, created_at, expires_at, consumed_at) VALUES
        ('manual-draft', 'secret manual', 'secret manual brief', 'claim-manual', 1000, 2000, 1500),
        ('legacy-draft', 'secret legacy', '', 'claim-legacy', 3000, 4000, 3500),
        ('early-draft', 'secret early', '', 'claim-early', 9000, 9900, 9500),
        ('shared-draft', 'secret shared', '', 'claim-shared', 5000, 6000, 5500)`,
    );
    database.run(
      `INSERT INTO prospect_account (id, email, created_at) VALUES
        ('legacy-drafted', 'drafted@example.test', 100),
        ('legacy-typed', 'typed@example.test', 200),
        ('placeholder', 'placeholder@example.test', 300),
        ('placeholder-chat', 'chat@example.test', 400),
        ('early', 'early@example.test', 500),
        ('shared-owner', 'shared@example.test', 600),
        ('shared-other', 'other@example.test', 700)`,
    );
    database.run(
      `INSERT INTO account_request (account_id, description, brief, created_at, draft_id, submitted_at) VALUES
        ('legacy-drafted', 'secret legacy', '', 3200, 'legacy-draft', NULL),
        ('legacy-typed', 'secret typed', 'secret typed brief', 3300, NULL, NULL),
        ('early', 'secret early', '', 9600, 'early-draft', NULL),
        ('shared-owner', 'secret shared', '', 5600, 'shared-draft', NULL)`,
    );
    database.run(
      "INSERT INTO chat_turn (id, account_id, role, content, created_at) VALUES ('turn-chat', 'placeholder-chat', 'user', 'secret chat', 450), ('turn-early', 'early', 'user', 'secret before draft', 8000)",
    );
    applyMigrations(database, ['004_request_scope', '005_chat_operation']);
    database.run(
      "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('manual-submission', 'manual-draft', 'manual@example.test', 'secret manual brief', 'receipt-manual', 'closed', 1500, 1500)",
    );
    // shared-draft now also belongs to another account's legacy row: overlapping lineage.
    database.run(
      "INSERT INTO account_request (account_id, description, brief, created_at, draft_id) VALUES ('shared-other', 'secret shared copy', '', 5700, 'shared-draft')",
    );
  } finally {
    database.close();
  }
}

function contentFingerprint(databasePath: string): string {
  const database = new Database(databasePath, { readonly: true });
  try {
    const tables = [
      'intake_draft',
      'proposal_submission',
      'software_request',
      'account_request',
      'chat_turn',
      'chat_operation',
      'request_concept_preview',
      'concept_preview',
      'prospect_account',
      'submission_replay',
    ];
    return JSON.stringify(
      tables.map((table) => database.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    );
  } finally {
    database.close();
  }
}

test('calendar-month addition preserves UTC time and clamps to the last day', () => {
  expect(addUtcMonths(leapDay, 12)).toBe(leapDeadline);
  expect(addUtcMonths(Date.UTC(2024, 0, 31, 23, 59, 59, 999), 1)).toBe(
    Date.UTC(2024, 1, 29, 23, 59, 59, 999),
  );
  expect(addUtcMonths(Date.UTC(2023, 0, 31, 1, 2, 3, 4), 1)).toBe(
    Date.UTC(2023, 1, 28, 1, 2, 3, 4),
  );
  expect(addUtcMonths(Date.UTC(2024, 7, 31, 6), 12)).toBe(Date.UTC(2025, 7, 31, 6));
  expect(addUtcMonths(Date.UTC(2024, 11, 15), 12)).toBe(Date.UTC(2025, 11, 15));
  expect(() => addUtcMonths(1.5, 12)).toThrow('UTC epoch milliseconds');
  expect(() => addUtcMonths(Number.NaN, 12)).toThrow('UTC epoch milliseconds');
});

test('a standalone manual proposal has its own subject anchored to the draft with no account', () => {
  fixture((databasePath) => {
    const store = new WebsiteStore(databasePath);
    store.createDraft('draft-1', 'secret need', 'claim-1', leapDay, leapDay + 1000, 'source-test');
    expect(
      store.submit(
        'claim-1',
        'key-1',
        'hash-1',
        'a@example.test',
        'brief',
        'r-1',
        leapDay + 500,
        'source-test',
      ),
    ).toEqual({ kind: 'created', receipt: 'r-1', siteCount: 1 });
    store.close();
    const rows = subjects(databasePath);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subject_kind: 'proposal_submission',
      resolution: 'anchored',
      anchor_at: leapDay,
      deadline_at: leapDeadline,
      anchor_source: 'draft',
    });
    const report = inspectRequestRetention(databasePath, leapDeadline);
    expect(report.proposalSubmission).toMatchObject({ anchored: 1, due: 1 });
    expect(inspectRequestRetention(databasePath, leapDeadline - 1).proposalSubmission.due).toBe(0);
  });
});

test('a draft-backed legacy account request uses the draft anchor and its submission is not a second subject', () => {
  fixture((databasePath) => {
    const store = new WebsiteStore(databasePath);
    store.createDraft('draft-1', 'secret need', 'claim-1', 100, 100_000, 'source-test');
    store.close();
    // The retired sign-in attached the draft to a request and submitted it from the account.
    seedLegacyRequest(databasePath, {
      draftId: 'draft-1',
      description: 'secret need',
      brief: 'brief',
      createdAt: 5000,
    });
    const legacy = new Database(databasePath);
    try {
      legacy.run('UPDATE intake_draft SET consumed_at = 5000');
      legacy.run('UPDATE software_request SET submitted_at = 6000');
      legacy.run(
        "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('s-1', 'draft-1', 'owner@example.test', 'brief', 'r-1', 'submitted', 6000, 6000)",
      );
    } finally {
      legacy.close();
    }
    new WebsiteStore(databasePath).close();
    const rows = subjects(databasePath);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subject_kind: 'software_request',
      anchor_at: 100,
      anchor_source: 'draft',
    });
    const report = inspectRequestRetention(databasePath, 7000);
    expect(report.proposalSubmission.uncovered).toBe(0);
    expect(report.activation).toBe('ready');
  });
});

test('the schema refuses to move an anchored subject', () => {
  fixture((databasePath) => {
    const store = new WebsiteStore(databasePath);
    store.createDraft('draft-1', 'secret need', 'claim-1', 100, 1000, 'source-test');
    store.submit(
      'claim-1',
      'key-1',
      'hash-1',
      'a@example.test',
      'brief',
      'r-1',
      500,
      'source-test',
    );
    store.close();
    const database = new Database(databasePath);
    try {
      expect(() =>
        database.run(
          "UPDATE retention_subject SET anchor_at = 900, deadline_at = 901 WHERE subject_kind = 'proposal_submission'",
        ),
      ).toThrow('retention anchor is immutable');
      expect(() =>
        database.run(
          "UPDATE retention_subject SET subject_id = 'other' WHERE subject_kind = 'proposal_submission'",
        ),
      ).toThrow('retention anchor is immutable');
    } finally {
      database.close();
    }
    expect(subjects(databasePath)[0]?.anchor_at).toBe(100);
  });
});

test('migration 006 rolls back to the 005 schema', () => {
  fixture((databasePath) => {
    new WebsiteStore(databasePath).close();
    const expected = new Database(':memory:');
    const database = new Database(databasePath);
    try {
      applyMigrations(
        expected,
        websiteMigrations()
          .map(({ name }) => name)
          .filter((name) => name !== '006_retention_subject'),
      );
      const migration = websiteMigrations().find(({ name }) => name === '006_retention_subject');
      if (!migration) throw new Error('Missing migration 006');
      database.run(readFileSync(join(migration.directory, 'down.sql'), 'utf8'));
      database.run("DELETE FROM schema_migration WHERE name = '006_retention_subject'");
      const schema =
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name";
      expect(database.query(schema).all()).toEqual(expected.query(schema).all());
    } finally {
      database.close();
      expected.close();
    }
  });
});

test('backfill anchors only durable draft lineage and reports historic ambiguity by count', () => {
  fixture((databasePath) => {
    historicDatabase(databasePath);
    const before = contentFingerprint(databasePath);
    new WebsiteStore(databasePath).close();
    const byKind = subjects(databasePath);
    const requestFor = (accountId: string): SubjectRow => {
      const database = new Database(databasePath, { readonly: true });
      try {
        const request = database
          .query<{ id: string }, [string]>('SELECT id FROM software_request WHERE account_id = ?')
          .get(accountId);
        const row = byKind.find((candidate) => candidate.subject_id === request?.id);
        if (!row) throw new Error(`Missing subject for ${accountId}`);
        return row;
      } finally {
        database.close();
      }
    };
    expect(subject(databasePath, 'proposal_submission', 'manual-submission')).toMatchObject({
      resolution: 'anchored',
      anchor_at: 1000,
      anchor_source: 'draft',
    });
    expect(requestFor('legacy-drafted')).toMatchObject({
      resolution: 'anchored',
      anchor_at: 3000,
      anchor_source: 'draft',
    });
    expect(requestFor('legacy-typed')).toMatchObject({
      resolution: 'ambiguous',
      ambiguity: 'unanchored_content',
      anchor_at: null,
    });
    expect(requestFor('placeholder')).toMatchObject({
      resolution: 'pending_content',
      anchor_at: null,
    });
    expect(requestFor('placeholder-chat')).toMatchObject({
      resolution: 'ambiguous',
      ambiguity: 'unanchored_content',
    });
    expect(requestFor('early')).toMatchObject({
      resolution: 'ambiguous',
      ambiguity: 'content_predates_anchor',
    });
    expect(requestFor('shared-owner')).toMatchObject({
      resolution: 'ambiguous',
      ambiguity: 'overlapping_lineage',
    });
    expect(byKind).toHaveLength(8);

    const report = inspectRequestRetention(databasePath, Date.UTC(2030, 0, 1));
    expect(report).toEqual({
      asOf: Date.UTC(2030, 0, 1),
      deletion: 'disabled',
      activation: 'refused',
      softwareRequest: {
        anchored: 1,
        due: 1,
        dueHeld: 0,
        client: 0,
        pendingContent: 2,
        ambiguous: 4,
        uncovered: 0,
        unanchoredContent: 0,
      },
      proposalSubmission: {
        anchored: 1,
        due: 1,
        dueHeld: 0,
        client: 0,
        pendingContent: 0,
        ambiguous: 0,
        uncovered: 0,
        unanchoredContent: 0,
      },
    });
    expect(JSON.stringify(report)).not.toMatch(/secret|example\.test|legacy|manual|draft|claim/);
    expect(contentFingerprint(databasePath)).toBe(before);

    const ambiguous = listAmbiguousRetentionSubjects(databasePath);
    expect(ambiguous).toHaveLength(4);
    expect(JSON.stringify(ambiguous)).not.toMatch(/secret|example\.test/);
    expect(ambiguous.map(({ reason }) => reason).sort()).toEqual([
      'content_predates_anchor',
      'overlapping_lineage',
      'unanchored_content',
      'unanchored_content',
    ]);

    new WebsiteStore(databasePath).close();
    expect(subjects(databasePath)).toEqual(byKind);
  });
});

test('an account submission sharing an unsubmitted request draft is overlapping lineage, not a second subject', () => {
  fixture((databasePath) => {
    const database = new Database(databasePath, { create: true });
    try {
      applyMigrations(
        database,
        websiteMigrations()
          .map(({ name }) => name)
          .filter((name) => name !== '006_retention_subject'),
      );
      database.run(
        "INSERT INTO intake_draft (id, description, claim_hash, created_at, expires_at, consumed_at) VALUES ('d', 'secret', 'c', 100, 200, 150)",
      );
      database.run(
        "INSERT INTO prospect_account (id, email, created_at) VALUES ('a', 'a@example.test', 1)",
      );
      database.run(
        "INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at) VALUES ('r', 'a', 'd', 'secret', '', 150)",
      );
      database.run(
        "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('s', 'd', 'a@example.test', 'secret', 'receipt', 'submitted', 120, 120)",
      );
    } finally {
      database.close();
    }
    new WebsiteStore(databasePath).close();
    expect(subjects(databasePath)).toEqual([
      {
        subject_kind: 'software_request',
        subject_id: 'r',
        resolution: 'ambiguous',
        ambiguity: 'overlapping_lineage',
        anchor_at: null,
        deadline_at: null,
        anchor_source: null,
      },
    ]);
  });
});

test('activation coverage refuses an omitted accountless submitted proposal or ambiguous subject', () => {
  fixture((databasePath) => {
    const store = new WebsiteStore(databasePath);
    store.createDraft('draft-1', 'secret need', 'claim-1', 100, 1000, 'source-test');
    store.submit(
      'claim-1',
      'key-1',
      'hash-1',
      'a@example.test',
      'brief',
      'r-1',
      500,
      'source-test',
    );
    store.close();
    expect(assertRetentionCoverage(databasePath, 600).activation).toBe('ready');

    const database = new Database(databasePath);
    try {
      database.run(
        "INSERT INTO intake_draft (id, description, claim_hash, created_at, expires_at, consumed_at) VALUES ('draft-2', 'secret', 'claim-2', 100, 1000, 500)",
      );
      database.run(
        "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES ('omitted', 'draft-2', 'b@example.test', 'secret', 'r-2', 'submitted', 500, 500)",
      );
    } finally {
      database.close();
    }
    expect(inspectRequestRetention(databasePath, 600).proposalSubmission.uncovered).toBe(1);
    expect(() => assertRetentionCoverage(databasePath, 600)).toThrow(
      'Retention activation refused: 1 uncovered proposal submission',
    );

    const ambiguous = new Database(databasePath);
    try {
      ambiguous.run(
        "INSERT INTO retention_subject (subject_kind, subject_id, resolution, ambiguity) VALUES ('proposal_submission', 'omitted', 'ambiguous', 'overlapping_lineage')",
      );
    } finally {
      ambiguous.close();
    }
    expect(() => assertRetentionCoverage(databasePath, 600)).toThrow(
      'Retention activation refused: 1 ambiguous proposal submission',
    );
  });
});

test('activation coverage refuses a content-bearing request without an anchor', () => {
  fixture((databasePath) => {
    new WebsiteStore(databasePath).close();
    seedLegacyRequest(databasePath, { createdAt: 20 });
    new WebsiteStore(databasePath).close();
    const database = new Database(databasePath);
    try {
      // An older API process writes content without recording the first-content anchor.
      database.run("UPDATE software_request SET brief = 'secret brief'");
    } finally {
      database.close();
    }
    expect(inspectRequestRetention(databasePath, 30).softwareRequest.unanchoredContent).toBe(1);
    expect(() => assertRetentionCoverage(databasePath, 30)).toThrow(
      '1 unanchored software request',
    );
    const uncovered = new Database(databasePath);
    try {
      uncovered.run('DELETE FROM retention_subject');
    } finally {
      uncovered.close();
    }
    expect(() => assertRetentionCoverage(databasePath, 30)).toThrow('1 uncovered software request');
  });
});

test('an operator resolves an ambiguous anchor only with an evidence reference', () => {
  fixture((databasePath) => {
    historicDatabase(databasePath);
    new WebsiteStore(databasePath).close();
    const before = contentFingerprint(databasePath);
    const first = listAmbiguousRetentionSubjects(databasePath).find(
      ({ reason }) => reason === 'content_predates_anchor',
    );
    if (!first) throw new Error('Missing ambiguous subject');
    const resolution = {
      kind: first.kind,
      subjectId: first.subjectId,
      anchorAt: 8000,
      evidenceReference: 'ops-ticket:2026-09-30#1',
      actor: 'operator-1',
    };
    for (const evidenceReference of ['', '  ', 'owner@example.test', 'free text note'])
      expect(() =>
        resolveRetentionAnchor(databasePath, { ...resolution, evidenceReference }, 10_000),
      ).toThrow('Evidence reference must be an opaque reference');
    expect(() =>
      resolveRetentionAnchor(databasePath, { ...resolution, actor: 'Operator One' }, 10_000),
    ).toThrow('Actor must be');
    expect(() => resolveRetentionAnchor(databasePath, resolution, 7999)).toThrow(
      'Anchor cannot be later',
    );
    expect(() =>
      resolveRetentionAnchor(databasePath, { ...resolution, anchorAt: 8001 }, 10_000),
    ).toThrow('Anchor cannot be later than surviving content');
    expect(subject(databasePath, first.kind, first.subjectId)?.resolution).toBe('ambiguous');

    expect(resolveRetentionAnchor(databasePath, resolution, 10_000)).toEqual({
      deadlineAt: addUtcMonths(8000, 12),
    });
    expect(subject(databasePath, first.kind, first.subjectId)).toMatchObject({
      resolution: 'anchored',
      ambiguity: 'content_predates_anchor',
      anchor_at: 8000,
      anchor_source: 'operator',
    });
    expect(() => resolveRetentionAnchor(databasePath, resolution, 10_000)).toThrow(
      'not an ambiguous anchor',
    );
    expect(contentFingerprint(databasePath)).toBe(before);
  });
});

test('resolving every ambiguous subject lets activation coverage pass without deleting content', () => {
  fixture((databasePath) => {
    historicDatabase(databasePath);
    new WebsiteStore(databasePath).close();
    const before = contentFingerprint(databasePath);
    expect(() => assertRetentionCoverage(databasePath, 20_000)).toThrow(
      '4 ambiguous software request',
    );
    for (const ambiguous of listAmbiguousRetentionSubjects(databasePath))
      resolveRetentionAnchor(
        databasePath,
        {
          kind: ambiguous.kind,
          subjectId: ambiguous.subjectId,
          anchorAt: 100,
          evidenceReference: 'ops-ticket:1',
          actor: 'operator-1',
        },
        20_000,
      );
    expect(assertRetentionCoverage(databasePath, 20_000)).toMatchObject({
      activation: 'ready',
      deletion: 'disabled',
    });
    expect(contentFingerprint(databasePath)).toBe(before);
  });
});

const olderApiWrites = {
  brief: "UPDATE software_request SET brief = 'secret older brief' WHERE id = ?1",
  description: "UPDATE software_request SET description = 'secret older description' WHERE id = ?1",
  chatTurn:
    "INSERT INTO chat_turn (id, account_id, request_id, role, content, created_at) VALUES ('older-turn', ?2, ?1, 'user', 'secret older turn', 100)",
  chatOperation:
    "INSERT INTO chat_operation (id, account_id, request_id, idempotency_key, body_hash, message, initial, state, created_at) VALUES ('older-operation', ?2, ?1, 'older-key', 'older-hash', 'secret older message', 1, 'completed', 100)",
  conceptPreview:
    "INSERT INTO request_concept_preview (request_id, body, created_at) VALUES (?1, 'secret older preview', 100)",
} as const;

/** Backfills a blank legacy request as pending, then writes content the way a 005 API did. */
function pendingRequestWithOlderContent(databasePath: string, write: string): string {
  new WebsiteStore(databasePath).close();
  const { accountId, requestId } = seedLegacyRequest(databasePath, { createdAt: 20 });
  new WebsiteStore(databasePath).close();
  const older = new Database(databasePath);
  try {
    if (write.includes('?2')) older.query(write).run(requestId, accountId);
    else older.query(write).run(requestId);
  } finally {
    older.close();
  }
  return requestId;
}

for (const [kind, write] of Object.entries(olderApiWrites)) {
  test(`an older API ${kind} write on a pending subject becomes ambiguous at startup, never a late anchor`, () => {
    fixture((databasePath) => {
      const requestId = pendingRequestWithOlderContent(databasePath, write);
      new WebsiteStore(databasePath).close();
      expect(subject(databasePath, 'software_request', requestId)).toMatchObject({
        resolution: 'ambiguous',
        ambiguity: 'unanchored_content',
        anchor_at: null,
      });
      expect(() => assertRetentionCoverage(databasePath, 6000)).toThrow(
        '1 ambiguous software request',
      );
      resolveRetentionAnchor(
        databasePath,
        {
          kind: 'software_request',
          subjectId: requestId,
          anchorAt: 50,
          evidenceReference: 'ops-ticket:7',
          actor: 'operator-1',
        },
        6000,
      );
      expect(assertRetentionCoverage(databasePath, 6000).activation).toBe('ready');
    });
  });
}

test('startup moves a pending subject holding older content to ambiguous', () => {
  fixture((databasePath) => {
    const requestId = pendingRequestWithOlderContent(databasePath, olderApiWrites.brief);
    expect(inspectRequestRetention(databasePath, 30).softwareRequest.unanchoredContent).toBe(1);
    new WebsiteStore(databasePath).close();
    expect(subject(databasePath, 'software_request', requestId)).toMatchObject({
      resolution: 'ambiguous',
      ambiguity: 'unanchored_content',
    });
    expect(inspectRequestRetention(databasePath, 30).softwareRequest).toMatchObject({
      ambiguous: 1,
      unanchoredContent: 0,
      pendingContent: 0,
    });
  });
});

test('blank legacy content neither anchors a subject nor counts as content', () => {
  fixture((databasePath) => {
    new WebsiteStore(databasePath).close();
    const { accountId, requestId } = seedLegacyRequest(databasePath, {
      brief: '\n\t \r',
      createdAt: 20,
    });
    const legacy = new Database(databasePath);
    try {
      const turn = legacy.query(
        'INSERT INTO chat_turn (id, account_id, request_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      );
      turn.run('turn-1', accountId, requestId, 'assistant', '', 40);
      turn.run('turn-2', accountId, requestId, 'user', ' \n', 50);
    } finally {
      legacy.close();
    }
    new WebsiteStore(databasePath).close();
    expect(subject(databasePath, 'software_request', requestId)?.resolution).toBe(
      'pending_content',
    );
    expect(assertRetentionCoverage(databasePath, 60).softwareRequest).toMatchObject({
      pendingContent: 1,
      unanchoredContent: 0,
    });
  });
});

test('startup waits for a concurrent write lock instead of failing busy', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-retention-busy-'));
  const databasePath = join(directory, 'website.sqlite');
  try {
    new WebsiteStore(databasePath).close();
    const starterPath = join(directory, 'starter.ts');
    writeFileSync(
      starterPath,
      `import { WebsiteStore } from ${JSON.stringify(join(import.meta.dir, 'store.ts'))};
new WebsiteStore(Bun.argv[2] ?? '').close();
`,
    );
    const holder = new Database(databasePath);
    holder.run('BEGIN IMMEDIATE');
    const starter = Bun.spawn(['bun', starterPath, databasePath], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await Bun.sleep(700);
    holder.run('COMMIT');
    holder.close();
    const exitCode = await starter.exited;
    const error = await new Response(starter.stderr).text();
    expect({ exitCode, error }).toEqual({ exitCode: 0, error: '' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('resolution validates the database before taking the write lock', () => {
  fixture((databasePath) => {
    historicDatabase(databasePath);
    new WebsiteStore(databasePath).close();
    const edited = new Database(databasePath);
    edited.run("UPDATE schema_migration SET checksum = 'edited' WHERE name = '005_chat_operation'");
    edited.close();
    const holder = new Database(databasePath);
    holder.run('BEGIN IMMEDIATE');
    try {
      const started = Date.now();
      expect(() =>
        resolveRetentionAnchor(
          databasePath,
          {
            kind: 'software_request',
            subjectId: 'early-draft',
            anchorAt: 100,
            evidenceReference: 'ops-ticket:1',
            actor: 'operator-1',
          },
          20_000,
        ),
      ).toThrow('unexpected or edited migration');
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      holder.run('ROLLBACK');
      holder.close();
    }
  });
});

test('the schema refuses to rewrite an operator resolution', () => {
  fixture((databasePath) => {
    historicDatabase(databasePath);
    new WebsiteStore(databasePath).close();
    resolveRetentionAnchor(
      databasePath,
      {
        kind: 'software_request',
        subjectId: 'early-draft',
        anchorAt: 100,
        evidenceReference: 'ops-ticket:1',
        actor: 'operator-1',
      },
      20_000,
    );
    const database = new Database(databasePath);
    try {
      for (const assignment of [
        "evidence_reference = 'ops-ticket:2'",
        "resolved_by = 'operator-2'",
        'resolved_at = 1',
        "resolution = 'ambiguous'",
        "ambiguity = 'overlapping_lineage'",
      ])
        expect(() =>
          database.run(
            `UPDATE retention_subject SET ${assignment} WHERE subject_id = 'early-draft'`,
          ),
        ).toThrow('retention anchor is immutable');
    } finally {
      database.close();
    }
  });
});
