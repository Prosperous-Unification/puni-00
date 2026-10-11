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

/**
 * The file `step-node-attempt-rollback-cli.ts save` writes before a code
 * rollback to a release that cannot read attempt outcomes, or a schema rollback
 * past `_add_step_node_attempts`, whose `down.sql` refuses while any attempt is
 * stored (docs/runbook-prod-deploy.md#step-node-attempt-rollback).
 *
 * Written against the table by name rather than through `schema.ts`: the CLI
 * must answer on a database the migration never reached, with a refusal that
 * says so, and on one it did.
 */
export interface SavedStepNodeAttempts {
  format: 'step-node-attempt-save';
  version: 1;
  rows: SavedStepNodeAttempt[];
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

/** Validates the versioned file at the CLI boundary before a transaction starts. */
function readSaved(saved: unknown): SavedStepNodeAttempts {
  if (
    !isRecord(saved) ||
    saved['format'] !== 'step-node-attempt-save' ||
    saved['version'] !== 1 ||
    Object.keys(saved).length !== 3 ||
    !Array.isArray(saved['rows'])
  ) {
    throw new Error('invalid step node attempt save format or version');
  }
  return { format: 'step-node-attempt-save', version: 1, rows: saved['rows'].map(readRow) };
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

const keyOf = (row: SavedStepNodeAttempt): string =>
  JSON.stringify([row.work_item_id, row.step_id, row.attempt_number]);

/** Captures every attempt, every column, in key order. */
export function saveStepNodeAttempts(db: Drizzle): SavedStepNodeAttempts {
  return { format: 'step-node-attempt-save', version: 1, rows: currentRows(db) };
}

/**
 * Deletes every attempt in one transaction, refusing unless the save still
 * equals the table column for column: an attempt written or ended after the
 * save would otherwise be dropped with no copy anywhere.
 */
export function removeSavedStepNodeAttempts(db: Drizzle, saved: unknown): number {
  const { rows } = readSaved(saved);
  return db.transaction((tx) => {
    const current = currentRows(tx);
    const expected = new Map(rows.map((row) => [keyOf(row), row]));
    if (
      current.length !== rows.length ||
      current.some((row) => {
        const twin = expected.get(keyOf(row));
        return twin === undefined || COLUMNS.some((column) => row[column] !== twin[column]);
      })
    ) {
      throw new Error('step node attempt save does not match the current table');
    }
    tx.run(sql`DELETE FROM step_node_attempt`);
    return current.length;
  });
}

/**
 * Writes the saved attempts back verbatim, numbers included, all or none. A
 * saved work item that is gone or has become a parent, or a step that is gone,
 * refuses the whole restore: attempts live on leaves' step nodes.
 */
export function restoreStepNodeAttempts(db: Drizzle, saved: unknown): number {
  const { rows } = readSaved(saved);
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
    return rows.length;
  });
}
