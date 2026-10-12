import { type AttemptOutcome, isAttemptOutcome } from '@wbs/domain';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';

/** One attempt row as saved: every column, audit columns included, under its column name. */
export interface SavedStepNodeAttempt {
  work_item_id: string;
  step_id: string;
  attempt_number: number;
  started_at: number;
  ended_at: number | null;
  outcome: AttemptOutcome | null;
  executor_person_id: string | null;
  reference: string | null;
  note: string | null;
  created_at: number | null;
  updated_at: number | null;
  created_by: string | null;
}

/** One node's attempt-number mark as saved (`step_node_attempt_issued`, A42). */
export interface SavedStepNodeAttemptMark {
  work_item_id: string;
  step_id: string;
  issued: number;
}

/**
 * The file `step-node-attempt-rollback-cli.ts save` writes before a code
 * rollback to a release that cannot read attempt outcomes, or a schema rollback
 * past `_add_step_node_attempts`, whose `down.sql` refuses while any attempt is
 * stored (docs/runbook-prod-deploy.md#step-node-attempt-rollback).
 *
 * Written against the table by name rather than through `schema.ts`: the CLI
 * must answer on a database the migration never reached, with a refusal that
 * says so, and on one it did.
 *
 * Version 2 carries the nodes' marks beside the rows: `down.sql` drops
 * `step_node_attempt_issued` with the table, and a node whose highest attempt
 * was removed would otherwise issue that number again after the restore.
 * Version 1 never left an unmerged branch, so it is refused like any other.
 */
export interface SavedStepNodeAttempts {
  format: 'step-node-attempt-save';
  version: 2;
  rows: SavedStepNodeAttempt[];
  marks: SavedStepNodeAttemptMark[];
}

/** What `remove` and `restore` wrote, for the CLI's one line. */
export interface StepNodeAttemptCounts {
  rows: number;
  marks: number;
}

const COLUMNS = [
  'work_item_id',
  'step_id',
  'attempt_number',
  'started_at',
  'ended_at',
  'outcome',
  'executor_person_id',
  'reference',
  'note',
  'created_at',
  'updated_at',
  'created_by',
] as const;

const MARK_COLUMNS = ['work_item_id', 'step_id', 'issued'] as const;

type Reader = Pick<Drizzle, 'all' | 'get'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown, column: string, nullable: boolean): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'string') throw new Error(`saved attempt ${column} must be text`);
  return value;
}

function readInteger(value: unknown, column: string, nullable: boolean): number | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`saved attempt ${column} must be an integer`);
  }
  return value;
}

function required<T>(value: T | null, column: string): T {
  if (value === null) throw new Error(`saved attempt ${column} must not be null`);
  return value;
}

/**
 * One row from the file or the table, every column checked. A table row that
 * fails this is a database edited past its `CHECK`s, and saving it would
 * restore a lie, so both directions share the check.
 */
function readRow(candidate: unknown): SavedStepNodeAttempt {
  if (
    !isRecord(candidate) ||
    Object.keys(candidate).length !== COLUMNS.length ||
    !COLUMNS.every((column) => Object.hasOwn(candidate, column))
  ) {
    throw new Error('invalid step node attempt saved row columns');
  }
  const outcome = candidate['outcome'];
  if (outcome !== null && !isAttemptOutcome(outcome)) {
    throw new Error(`saved attempt outcome is not one: ${JSON.stringify(outcome)}`);
  }
  return {
    work_item_id: required(
      readText(candidate['work_item_id'], 'work_item_id', false),
      'work_item_id',
    ),
    step_id: required(readText(candidate['step_id'], 'step_id', false), 'step_id'),
    attempt_number: required(
      readInteger(candidate['attempt_number'], 'attempt_number', false),
      'attempt_number',
    ),
    started_at: required(readInteger(candidate['started_at'], 'started_at', false), 'started_at'),
    ended_at: readInteger(candidate['ended_at'], 'ended_at', true),
    outcome,
    executor_person_id: readText(candidate['executor_person_id'], 'executor_person_id', true),
    reference: readText(candidate['reference'], 'reference', true),
    note: readText(candidate['note'], 'note', true),
    created_at: readInteger(candidate['created_at'], 'created_at', true),
    updated_at: readInteger(candidate['updated_at'], 'updated_at', true),
    created_by: readText(candidate['created_by'], 'created_by', true),
  };
}

/** One mark from the file or the table, every column checked, `issued` at least 1. */
function readMark(candidate: unknown): SavedStepNodeAttemptMark {
  if (
    !isRecord(candidate) ||
    Object.keys(candidate).length !== MARK_COLUMNS.length ||
    !MARK_COLUMNS.every((column) => Object.hasOwn(candidate, column))
  ) {
    throw new Error('invalid step node attempt saved mark columns');
  }
  const issued = required(readInteger(candidate['issued'], 'issued', false), 'issued');
  if (issued < 1)
    throw new Error(`saved attempt mark issued must be at least 1: ${String(issued)}`);
  return {
    work_item_id: required(
      readText(candidate['work_item_id'], 'work_item_id', false),
      'work_item_id',
    ),
    step_id: required(readText(candidate['step_id'], 'step_id', false), 'step_id'),
    issued,
  };
}

/** Validates the versioned file at the CLI boundary before a transaction starts. */
function readSaved(saved: unknown): SavedStepNodeAttempts {
  if (
    !isRecord(saved) ||
    saved['format'] !== 'step-node-attempt-save' ||
    saved['version'] !== 2 ||
    Object.keys(saved).length !== 4 ||
    !Array.isArray(saved['rows']) ||
    !Array.isArray(saved['marks'])
  ) {
    throw new Error('invalid step node attempt save format or version');
  }
  return {
    format: 'step-node-attempt-save',
    version: 2,
    rows: saved['rows'].map(readRow),
    marks: saved['marks'].map(readMark),
  };
}

/**
 * Refuses a database the attempts migration has not reached: there is nothing
 * to save, and a save file of no rows would read as "saved, and there were
 * none" to an operator about to roll back a different database.
 */
function assertTableExists(db: Reader): void {
  const found = db.get<{ name: string } | undefined>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'step_node_attempt'`,
  );
  // Proof: this check made unreachable and `guards the attempt rollback CLI
  // usage and refuses a database without attempts` failed: stderr carried
  // drizzle's `no such table` stack instead of the named refusal; watched 2026-10-12.
  if (found === undefined) {
    throw new Error(
      'step_node_attempt does not exist: this database is not migrated to _add_step_node_attempts',
    );
  }
}

function currentRows(db: Reader): SavedStepNodeAttempt[] {
  assertTableExists(db);
  return db
    .all<Record<string, unknown>>(
      sql`SELECT work_item_id, step_id, attempt_number, started_at, ended_at, outcome,
            executor_person_id, reference, note, created_at, updated_at, created_by
          FROM step_node_attempt ORDER BY work_item_id, step_id, attempt_number`,
    )
    .map(readRow);
}

function currentMarks(db: Reader): SavedStepNodeAttemptMark[] {
  return db
    .all<Record<string, unknown>>(
      sql`SELECT work_item_id, step_id, issued FROM step_node_attempt_issued
          ORDER BY work_item_id, step_id`,
    )
    .map(readMark);
}

const keyOf = (row: SavedStepNodeAttempt): string =>
  JSON.stringify([row.work_item_id, row.step_id, row.attempt_number]);

const markKeyOf = (mark: SavedStepNodeAttemptMark): string =>
  JSON.stringify([mark.work_item_id, mark.step_id]);

/** Captures every attempt, every column, and every node's mark, in key order. */
export function saveStepNodeAttempts(db: Drizzle): SavedStepNodeAttempts {
  const rows = currentRows(db);
  return { format: 'step-node-attempt-save', version: 2, rows, marks: currentMarks(db) };
}

/**
 * Deletes every attempt and every mark in one transaction, refusing unless the
 * save still equals both tables column for column: an attempt written, ended
 * or started after the save would otherwise be dropped with no copy anywhere,
 * and its number issued again after the restore.
 */
export function removeSavedStepNodeAttempts(db: Drizzle, saved: unknown): StepNodeAttemptCounts {
  const { rows, marks } = readSaved(saved);
  return db.transaction((tx) => {
    const current = currentRows(tx);
    const expected = new Map(rows.map((row) => [keyOf(row), row]));
    const currentMarked = currentMarks(tx);
    const expectedMarks = new Map(marks.map((mark) => [markKeyOf(mark), mark]));
    if (
      current.length !== rows.length ||
      current.some((row) => {
        const twin = expected.get(keyOf(row));
        return twin === undefined || COLUMNS.some((column) => row[column] !== twin[column]);
      }) ||
      currentMarked.length !== marks.length ||
      currentMarked.some((mark) => expectedMarks.get(markKeyOf(mark))?.issued !== mark.issued)
    ) {
      throw new Error('step node attempt save does not match the current table');
    }
    tx.run(sql`DELETE FROM step_node_attempt`);
    tx.run(sql`DELETE FROM step_node_attempt_issued`);
    return { rows: current.length, marks: currentMarked.length };
  });
}

/**
 * Writes the saved attempts and marks back verbatim, numbers included, all or
 * none. A saved attempt's work item that is gone or has become a parent, or a
 * step that is gone, refuses the whole restore: attempts live on leaves' step
 * nodes. A mark needs only its work item and step, as a parent keeps the marks
 * it handed down. Every node is then raised to at least its highest restored
 * attempt, so the store's invariant holds whatever the file carried.
 */
export function restoreStepNodeAttempts(db: Drizzle, saved: unknown): StepNodeAttemptCounts {
  const { rows, marks } = readSaved(saved);
  return db.transaction((tx) => {
    assertTableExists(tx);
    for (const row of rows) {
      const leaf = tx.get<{ id: string } | undefined>(
        sql`SELECT id FROM work_item WHERE id = ${row.work_item_id}`,
      );
      if (leaf === undefined) {
        throw new Error(`saved attempt on ${row.work_item_id}, which is no longer a work item`);
      }
      const child = tx.get<{ id: string } | undefined>(
        sql`SELECT id FROM work_item WHERE parent_id = ${row.work_item_id} LIMIT 1`,
      );
      if (child !== undefined) {
        throw new Error(`saved attempt on ${row.work_item_id}, which is no longer a leaf`);
      }
      const step = tx.get<{ id: string } | undefined>(
        sql`SELECT id FROM step WHERE id = ${row.step_id}`,
      );
      if (step === undefined) {
        throw new Error(`saved attempt on step ${row.step_id}, which is no longer a step`);
      }
    }
    for (const mark of marks) {
      const held = tx.get<{ id: string } | undefined>(
        sql`SELECT id FROM work_item WHERE id = ${mark.work_item_id}`,
      );
      if (held === undefined) {
        throw new Error(
          `saved attempt mark on ${mark.work_item_id}, which is no longer a work item`,
        );
      }
      const step = tx.get<{ id: string } | undefined>(
        sql`SELECT id FROM step WHERE id = ${mark.step_id}`,
      );
      if (step === undefined) {
        throw new Error(`saved attempt mark on step ${mark.step_id}, which is no longer a step`);
      }
    }
    for (const row of rows) {
      tx.run(
        sql`INSERT INTO step_node_attempt (work_item_id, step_id, attempt_number, started_at,
              ended_at, outcome, executor_person_id, reference, note, created_at, updated_at,
              created_by)
            VALUES (${row.work_item_id}, ${row.step_id}, ${row.attempt_number}, ${row.started_at},
              ${row.ended_at}, ${row.outcome}, ${row.executor_person_id}, ${row.reference},
              ${row.note}, ${row.created_at}, ${row.updated_at}, ${row.created_by})`,
      );
    }
    // Proof, watched 2026-10-12: this loop removed, `saves, removes and restores
    // attempts through the rollback CLI` read QA's mark `"issued": 1` where 2
    // was saved: the raise below sees only the attempts.
    for (const mark of marks) {
      tx.run(
        sql`INSERT INTO step_node_attempt_issued (work_item_id, step_id, issued)
            VALUES (${mark.work_item_id}, ${mark.step_id}, ${mark.issued})`,
      );
    }
    // `WHERE true` is SQLite's required spelling for an upsert from a SELECT.
    tx.run(
      sql`INSERT INTO step_node_attempt_issued (work_item_id, step_id, issued)
          SELECT work_item_id, step_id, max(attempt_number) FROM step_node_attempt WHERE true
          GROUP BY work_item_id, step_id
          ON CONFLICT (work_item_id, step_id) DO UPDATE SET issued = max(issued, excluded.issued)`,
    );
    return { rows: rows.length, marks: marks.length };
  });
}
