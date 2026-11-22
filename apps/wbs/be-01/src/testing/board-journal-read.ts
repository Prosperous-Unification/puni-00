import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { openReadOnlyDatabase } from '@wbs/store-sqlite/db';

interface JournalRow {
  id: string;
  workPackageId: string;
  userId: string;
  personId: string | null;
  seq: number;
  kind: string;
  inverse: string;
  undone: number;
}

const databasePath = process.argv[2];
const workPackageId = process.argv[3];
if (process.argv.length < 4 || !isAbsolute(databasePath))
  throw new Error('Board journal reader requires an absolute database path');
if (databasePath !== process.env['E2E_TEST_DATABASE'])
  throw new Error('Board journal reader path differs from this run database');
if (workPackageId.length === 0)
  throw new Error('Board journal reader requires the seeded work package ID');
if (!statSync(databasePath).isFile()) throw new Error('Board journal database is not a file');

const database = openReadOnlyDatabase(databasePath);
try {
  const rows = database
    .query<JournalRow, [string]>(
      'SELECT id, work_package_id AS workPackageId, user_id AS userId, person_id AS personId, seq, kind, inverse, undone FROM command_journal WHERE work_package_id = ? ORDER BY seq',
    )
    .all(workPackageId);
  if (rows.length === 0) throw new Error('Seeded work package has no journal baseline');
  for (const row of rows) {
    if (
      typeof row.id !== 'string' ||
      row.workPackageId !== workPackageId ||
      typeof row.userId !== 'string' ||
      (row.personId !== null && typeof row.personId !== 'string') ||
      !Number.isInteger(row.seq) ||
      row.seq < 1 ||
      typeof row.kind !== 'string' ||
      typeof row.inverse !== 'string' ||
      (row.undone !== 0 && row.undone !== 1)
    )
      throw new Error('Board journal row is malformed');
  }
  process.stdout.write(JSON.stringify(rows));
} finally {
  database.close();
}
