import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BoardJournalRow {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly personId: string | null;
  readonly seq: number;
  readonly kind: string;
  readonly inverse: string;
  readonly undone: 0 | 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads only the selected disposable project's real SQLite undo rows. */
export function readBoardJournal(projectId: string): readonly BoardJournalRow[] {
  const databasePath = process.env['E2E_TEST_DATABASE'];
  if (databasePath === undefined || !isAbsolute(databasePath))
    throw new Error('E2E_TEST_DATABASE must name this run’s absolute database path');
  if (!statSync(databasePath).isFile()) throw new Error('Board journal database is not a file');
  if (projectId.length === 0) throw new Error('Board journal project ID is empty');
  const reader = fileURLToPath(
    new URL('../../be-01/src/testing/board-journal-read.ts', import.meta.url),
  );
  const output = execFileSync('bun', [reader, databasePath, projectId], {
    encoding: 'utf8',
    env: { ...process.env, E2E_TEST_DATABASE: databasePath },
  });
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Error('Board journal reader returned no baseline rows');
  const values: unknown[] = parsed;
  const rows: BoardJournalRow[] = [];
  for (const value of values) {
    if (!isRecord(value)) throw new Error('Board journal row is not an object');
    const row = value;
    if (
      typeof row['id'] !== 'string' ||
      row['projectId'] !== projectId ||
      typeof row['userId'] !== 'string' ||
      (row['personId'] !== null && typeof row['personId'] !== 'string') ||
      typeof row['seq'] !== 'number' ||
      !Number.isInteger(row['seq']) ||
      typeof row['kind'] !== 'string' ||
      typeof row['inverse'] !== 'string' ||
      (row['undone'] !== 0 && row['undone'] !== 1)
    )
      throw new Error('Board journal reader returned a malformed row');
    rows.push({
      id: row['id'],
      projectId,
      userId: row['userId'],
      personId: row['personId'],
      seq: row['seq'],
      kind: row['kind'],
      inverse: row['inverse'],
      undone: row['undone'],
    });
  }
  return rows;
}

/** Finds exactly one new row by ID, preserving its true stack and sequence identity. */
export function addedBoardJournalRow(
  before: readonly BoardJournalRow[],
  after: readonly BoardJournalRow[],
): BoardJournalRow {
  const prior = new Set(before.map((row) => row.id));
  const added = after.filter((row) => !prior.has(row.id));
  if (added.length !== 1)
    throw new Error(`Expected one Board journal row, found ${String(added.length)}`);
  const row = added[0];
  const stack = before.filter((entry) => entry.personId === null);
  const users = new Set(stack.map((entry) => entry.userId));
  if (users.size !== 1 || !users.has(row.userId) || row.personId !== null)
    throw new Error('Board journal row is outside the seeded human stack');
  return row;
}
