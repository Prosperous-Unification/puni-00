import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Connection, type Drizzle, openConnection, openDatabase } from './db';
import { DrizzleEventLogStore } from './event-log';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { backfillStepCodes } from './step-code-backfill';
import { copyRecoveryPrefix } from './testing/recovery-state';

const LEGACY_BACKFILL_SCHEMA = '20261110100000_rename_project_to_work_package';

let dir: string;
let db: Drizzle;
let connection: Connection | undefined;
let sqlite: Database;
let raw: Database | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-step-code-backfill-'));
  const path = join(dir, 'test.db');
  runMigrations(path, copyRecoveryPrefix(dir, LEGACY_BACKFILL_SCHEMA));
  connection = openConnection(path);
  db = connection.db;
  sqlite = openDatabase(path);
  raw = sqlite;
  sqlite.run(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'owner', 'x', 1)",
  );
  for (const id of ['p', 'q']) {
    sqlite.run(
      'INSERT INTO work_package (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)' +
        ` VALUES ('${id}', 'Work package ${id}', 'u', 0, 'pert', NULL, 0, 1)`,
    );
  }
});

afterEach(() => {
  try {
    raw?.close();
    raw = undefined;
  } finally {
    connection?.close();
    connection = undefined;
  }
  rmSync(dir, { recursive: true, force: true });
});

/** A step as an older release writes it: no `code` in the column list. */
function oldWriterStep(id: string, workPackageId: string, name: string, position: number): void {
  sqlite.run(
    `INSERT INTO step (id, work_package_id, name, position) VALUES ('${id}', '${workPackageId}', '${name}', ${String(position)})`,
  );
}

function codedStep(
  id: string,
  workPackageId: string,
  name: string,
  position: number,
  code: string,
) {
  sqlite.run(
    `INSERT INTO step (id, work_package_id, name, position, code) VALUES ('${id}', '${workPackageId}', '${name}', ${String(position)}, '${code}')`,
  );
}

function codes(): { id: string; code: string | null; updatedAt: number | null }[] {
  return sqlite
    .query<{ id: string; code: string | null; updatedAt: number | null }, []>(
      'SELECT id, code, updated_at AS updatedAt FROM step ORDER BY work_package_id, position',
    )
    .all();
}

function revisions(): Record<string, number> {
  const rows = sqlite
    .query<{ id: string; revision: number }, []>(
      'SELECT id, revision FROM work_package ORDER BY id',
    )
    .all();
  return Object.fromEntries(rows.map((row) => [row.id, row.revision]));
}

describe('backfillStepCodes', () => {
  it('codes every uncoded step in step order, against the codes its work package already holds', () => {
    codedStep('p-review', 'p', 'Peer review', 10, 'review');
    oldWriterStep('p-review-2', 'p', 'Review!', 20);
    oldWriterStep('p-qa', 'p', 'QA', 30);
    // Position order, not insertion or name order: `Analysis` is inserted last
    // and sorts first by name, but it sits after `Build`.
    oldWriterStep('q-build', 'q', 'Build', 10);
    oldWriterStep('q-analysis', 'q', 'Analysis', 20);
    oldWriterStep('q-analysis-2', 'q', 'analysis', 30);

    const coded = backfillStepCodes(db, new DrizzleEventLogStore(db, OPEN), 5_000);

    expect(coded).toEqual([
      { workPackageId: 'p', stepId: 'p-review-2', code: 'review-2' },
      { workPackageId: 'p', stepId: 'p-qa', code: 'qa' },
      { workPackageId: 'q', stepId: 'q-build', code: 'build' },
      { workPackageId: 'q', stepId: 'q-analysis', code: 'analysis' },
      { workPackageId: 'q', stepId: 'q-analysis-2', code: 'analysis-2' },
    ]);
    expect(codes()).toEqual([
      { id: 'p-review', code: 'review', updatedAt: null },
      { id: 'p-review-2', code: 'review-2', updatedAt: 5_000 },
      { id: 'p-qa', code: 'qa', updatedAt: 5_000 },
      { id: 'q-build', code: 'build', updatedAt: 5_000 },
      { id: 'q-analysis', code: 'analysis', updatedAt: 5_000 },
      { id: 'q-analysis-2', code: 'analysis-2', updatedAt: 5_000 },
    ]);
  });

  it('announces each coded step in its work package’s durable log, with the code', () => {
    oldWriterStep('p-dev', 'p', 'Dev', 10);

    backfillStepCodes(db, new DrizzleEventLogStore(db, OPEN), 5_000);

    const logged = sqlite
      .query<{ subscription: string; message: string; created_at: number }, []>(
        'SELECT subscription, message, created_at FROM event_log',
      )
      .all()
      .map((row) => ({ ...row, message: JSON.parse(row.message) as unknown }));
    expect(logged).toEqual([
      {
        subscription: 'work-package:p',
        message: {
          type: 'step_renamed',
          step: {
            id: 'p-dev',
            workPackageId: 'p',
            name: 'Dev',
            position: 10,
            code: 'dev',
            allowancePercent: 0,
            estimateUnit: 'workdays' as const,
          },
        },
        created_at: 5_000,
      },
    ]);
  });

  it('moves the revision of each work package it coded a step in, once, and no other', () => {
    oldWriterStep('p-dev', 'p', 'Dev', 10);
    oldWriterStep('p-qa', 'p', 'QA', 20);
    codedStep('q-dev', 'q', 'Dev', 10, 'dev');

    backfillStepCodes(db, new DrizzleEventLogStore(db, OPEN), 5_000);

    expect(revisions()).toEqual({ p: 1, q: 0 });
  });

  it('never persists a code in the reserved alias namespace, however the name is cut', () => {
    oldWriterStep('p-long', 'p', `s${'1'.repeat(31)}x`, 10);

    expect(
      backfillStepCodes(db, new DrizzleEventLogStore(db, OPEN), 5_000).map((coded) => coded.code),
    ).toEqual([`step-s${'1'.repeat(26)}`]);
  });

  it('is idempotent: a second run codes nothing and moves nothing', () => {
    oldWriterStep('p-dev', 'p', 'Dev', 10);
    backfillStepCodes(db, new DrizzleEventLogStore(db, OPEN), 5_000);
    const after = { codes: codes(), revisions: revisions() };

    expect(backfillStepCodes(db, new DrizzleEventLogStore(db, OPEN), 9_000)).toEqual([]);
    expect({ codes: codes(), revisions: revisions() }).toEqual(after);
  });

  it('codes nothing in a database with no uncoded step', () => {
    codedStep('p-dev', 'p', 'Dev', 10, 'dev');

    expect(backfillStepCodes(db, new DrizzleEventLogStore(db, OPEN), 5_000)).toEqual([]);
    expect(revisions()).toEqual({ p: 0, q: 0 });
  });
});
