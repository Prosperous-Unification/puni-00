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
    store.createDraft('draft-1', 'secret need', 'claim-1', leapDay, leapDay + 1000);
    expect(
      store.submit('claim-1', 'key-1', 'hash-1', 'a@example.test', 'brief', 'r-1', leapDay + 500),
    ).toEqual({ kind: 'created', receipt: 'r-1' });
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

test('a draft-backed account request uses the draft anchor and its submission is not a second subject', () => {
  fixture((databasePath) => {
    const store = new WebsiteStore(databasePath);
    const account = store.createProspect('owner@example.test', 10);
    store.createDraft('draft-1', 'secret need', 'claim-1', 100, 100_000);
    expect(store.attachDraft(account.id, 'claim-1', 5000)).toBe(true);
    expect(
      store.submitAccount(account.id, 'key', 'hash', 'owner@example.test', 'brief', 'r-1', 6000),
    ).toEqual({ kind: 'created', receipt: 'r-1' });
    store.close();
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

test('a blank account request anchors on its first nonempty write and later edits keep it', () => {
  fixture((databasePath) => {
    const store = new WebsiteStore(databasePath);
    const account = store.createProspect('owner@example.test', 10);
    store.ensureBlankRequest(account.id, 20);
    const request = store.findAccountRequest(account.id);
    if (!request) throw new Error('Missing account request');
    expect(subject(databasePath, 'software_request', request.id)).toMatchObject({
      resolution: 'pending_content',
      anchor_at: null,
    });
    expect(store.updateAccountBrief(account.id, '   ', leapDay - 10)).toBe(true);
    expect(subject(databasePath, 'software_request', request.id)?.resolution).toBe(
      'pending_content',
    );
    expect(store.updateAccountBrief(account.id, 'first content', leapDay)).toBe(true);
    expect(store.updateAccountBrief(account.id, 'edited later', leapDay + 1000)).toBe(true);
    store.addTurn(account.id, request.id, 'user', 'later chat', leapDay + 2000);
    store.saveConcept(request.id, '{"screens":[]}', leapDay + 3000);
    const started = store.admitChatOperation(
      account.id,
      request.id,
      'key-1',
      'hash-1',
      'later message',
      false,
      null,
      leapDay + 4000,
    );
    expect(started.kind).toBe('started');
    store.close();
    expect(subject(databasePath, 'software_request', request.id)).toMatchObject({
      resolution: 'anchored',
      anchor_at: leapDay,
      deadline_at: leapDeadline,
      anchor_source: 'first_write',
    });
    expect(inspectRequestRetention(databasePath, leapDeadline).softwareRequest.due).toBe(1);
    expect(inspectRequestRetention(databasePath, leapDeadline - 1).softwareRequest.due).toBe(0);
  });
});

test('a first chat message anchors a blank request and a later turn shares the deadline', () => {
  fixture((databasePath) => {
    const store = new WebsiteStore(databasePath);
    const account = store.createProspect('owner@example.test', 10);
    store.ensureBlankRequest(account.id, 20);
    const request = store.findAccountRequest(account.id);
    if (!request) throw new Error('Missing account request');
    const started = store.admitChatOperation(
      account.id,
      request.id,
      'key-1',
      'hash-1',
      'hello',
      true,
      null,
      leapDay,
    );
    if (started.kind !== 'started') throw new Error('Chat was not admitted');
    expect(store.completeChatOperation(started.id, 'reply', null, leapDay + 60_000)).toBe(true);
    store.close();
    expect(subject(databasePath, 'software_request', request.id)).toMatchObject({
      anchor_at: leapDay,
      deadline_at: leapDeadline,
    });
  });
});

test('the schema refuses to move an anchored subject', () => {
  fixture((databasePath) => {
    const store = new WebsiteStore(databasePath);
    store.createDraft('draft-1', 'secret need', 'claim-1', 100, 1000);
    store.submit('claim-1', 'key-1', 'hash-1', 'a@example.test', 'brief', 'r-1', 500);
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

test('concurrent first writes from separate processes record exactly one anchor', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-retention-race-'));
  const databasePath = join(directory, 'website.sqlite');
  try {
    const store = new WebsiteStore(databasePath);
    const account = store.createProspect('owner@example.test', 10);
    store.ensureBlankRequest(account.id, 20);
    const request = store.findAccountRequest(account.id);
    if (!request) throw new Error('Missing account request');
    store.close();
    const writerPath = join(directory, 'writer.ts');
    writeFileSync(
      writerPath,
      `import { WebsiteStore } from ${JSON.stringify(join(import.meta.dir, 'store.ts'))};
const [databasePath, accountId, startAt, now] = Bun.argv.slice(2);
function retry<T>(attempt: () => T): T {
  for (let tries = 0; tries < 2000; tries += 1) {
    try { return attempt(); } catch (error) {
      if (!(error instanceof Error) || !/locked|busy/i.test(error.message)) throw error;
      Bun.sleepSync(1);
    }
  }
  throw new Error('writer stayed busy');
}
const store = retry(() => new WebsiteStore(databasePath));
while (Date.now() < Number(startAt)) {}
if (!retry(() => store.updateAccountBrief(accountId, 'brief ' + now, Number(now)))) throw new Error('write refused');
store.close();
`,
    );
    const startAt = Date.now() + 1500;
    const writers = [1000, 2000, 3000, 4000].map((offset) =>
      Bun.spawn(
        ['bun', writerPath, databasePath, account.id, String(startAt), String(leapDay + offset)],
        { stdout: 'pipe', stderr: 'pipe' },
      ),
    );
    const exits = await Promise.all(writers.map((writer) => writer.exited));
    const errors = await Promise.all(writers.map((writer) => new Response(writer.stderr).text()));
    expect({ exits, errors }).toEqual({ exits: [0, 0, 0, 0], errors: ['', '', '', ''] });
    const anchored = subject(databasePath, 'software_request', request.id);
    expect(anchored?.resolution).toBe('anchored');
    expect([leapDay + 1000, leapDay + 2000, leapDay + 3000, leapDay + 4000]).toContain(
      anchored?.anchor_at ?? -1,
    );
    expect(anchored?.deadline_at).toBe(addUtcMonths(anchored?.anchor_at ?? -1, 12));
    expect(subjects(databasePath)).toHaveLength(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
    store.createDraft('draft-1', 'secret need', 'claim-1', 100, 1000);
    store.submit('claim-1', 'key-1', 'hash-1', 'a@example.test', 'brief', 'r-1', 500);
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
    const store = new WebsiteStore(databasePath);
    const account = store.createProspect('owner@example.test', 10);
    store.ensureBlankRequest(account.id, 20);
    store.close();
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
