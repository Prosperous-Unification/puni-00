import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { typedDependency, type TypedDependencyRow } from './schema';
import { assertEndpointsHeld, readTypedDependency } from './typed-dependency';

export interface SavedTypedDependencies {
  format: 'typed-dependency-save';
  version: 1;
  rows: TypedDependencyRow[];
}

const ROW_KEYS = [
  'id',
  'projectId',
  'predecessorWorkItemId',
  'predecessorScope',
  'predecessorStepId',
  'successorWorkItemId',
  'successorScope',
  'successorStepId',
  'type',
  'createdAt',
  'updatedAt',
  'createdBy',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string')
    throw new Error(`saved typed dependency ${field} must be a string`);
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  return value === null ? null : readString(value, field);
}

function readNullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`saved typed dependency ${field} must be an integer or null`);
  }
  return value;
}

/**
 * Validates the versioned file at the CLI boundary before a transaction starts.
 *
 * Proof: each check here and in the three `read*` helpers above disabled in
 * turn made its own case of `refuses a malformed save with the parser’s own
 * reason and restores nothing` fail — the format, version and key-count
 * checks and the column count, `readString` and `readNullableNumber` on
 * `(restored without refusing)`, the column names on `createdBy must be a
 * string` and `readNullableString` on `names step 7 outside project p`, each
 * a later check answering in the parser's place; watched 2026-09-27.
 */
function readSavedTypedDependencies(saved: unknown): SavedTypedDependencies {
  // Proof: accepting version 2 made `refuses malformed saved input` fail on
  // `Received function did not throw` (it removed 2 rows); watched 2026-09-27.
  if (
    !isRecord(saved) ||
    saved['format'] !== 'typed-dependency-save' ||
    saved['version'] !== 1 ||
    Object.keys(saved).length !== 3 ||
    !Array.isArray(saved['rows'])
  ) {
    throw new Error('invalid typed dependency save format or version');
  }
  const rows: TypedDependencyRow[] = saved['rows'].map((candidate: unknown) => {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).length !== ROW_KEYS.length ||
      !ROW_KEYS.every((key) => Object.hasOwn(candidate, key))
    ) {
      throw new Error('invalid typed dependency saved row columns');
    }
    return {
      id: readString(candidate['id'], 'id'),
      projectId: readString(candidate['projectId'], 'projectId'),
      predecessorWorkItemId: readString(
        candidate['predecessorWorkItemId'],
        'predecessorWorkItemId',
      ),
      predecessorScope: readString(candidate['predecessorScope'], 'predecessorScope'),
      predecessorStepId: readNullableString(candidate['predecessorStepId'], 'predecessorStepId'),
      successorWorkItemId: readString(candidate['successorWorkItemId'], 'successorWorkItemId'),
      successorScope: readString(candidate['successorScope'], 'successorScope'),
      successorStepId: readNullableString(candidate['successorStepId'], 'successorStepId'),
      type: readString(candidate['type'], 'type'),
      createdAt: readNullableNumber(candidate['createdAt'], 'createdAt'),
      updatedAt: readNullableNumber(candidate['updatedAt'], 'updatedAt'),
      createdBy: readNullableString(candidate['createdBy'], 'createdBy'),
    };
  });
  return { format: 'typed-dependency-save', version: 1, rows };
}

/** Captures every raw column, including audit columns, in stable id order. */
export function saveTypedDependencies(db: Drizzle): SavedTypedDependencies {
  const rows = db.select().from(typedDependency).orderBy(typedDependency.id).all();
  return { format: 'typed-dependency-save', version: 1, rows };
}

/** Deletes only the exact saved table image in one transaction. */
export function removeSavedTypedDependencies(db: Drizzle, saved: unknown): number {
  const { rows } = readSavedTypedDependencies(saved);
  return db.transaction((tx) => {
    const current = tx.select().from(typedDependency).orderBy(typedDependency.id).all();
    // Bytewise, the order `ORDER BY id` reads in.
    const expected = [...rows].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
    // Proof: replacing the row comparison with a count comparison made
    // `refuses a same-count save with a different id or column` fail on
    // `Received function did not throw`; watched 2026-09-27.
    if (
      current.length !== expected.length ||
      current.some((row, index) => ROW_KEYS.some((key) => row[key] !== expected[index]?.[key]))
    ) {
      throw new Error('typed dependency save does not match current table');
    }
    tx.delete(typedDependency)
      .where(sql`1 = 1`)
      .run();
    return current.length;
  });
}

/** Restores saved rows atomically after read and endpoint validation. */
export function restoreTypedDependencies(db: Drizzle, saved: unknown): number {
  const { rows } = readSavedTypedDependencies(saved);
  return db.transaction((tx) => {
    for (const row of rows) {
      // Proof: masking the stored SS type as FS before this read made `refuses
      // the whole restore when a saved row has an unreadable relationship`
      // fail on `Received function did not throw` (2 rows); watched 2026-09-27.
      const link = readTypedDependency(row);
      // Proof: skipping this endpoint check made `refuses the whole restore
      // when a node endpoint became a parent` fail on `Received function did
      // not throw`; watched 2026-09-27.
      assertEndpointsHeld(tx, link);
    }
    for (const row of rows) tx.insert(typedDependency).values(row).run();
    return rows.length;
  });
}
