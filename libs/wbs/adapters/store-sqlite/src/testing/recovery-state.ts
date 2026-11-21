import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { openDatabase } from '../db';
import { MIGRATIONS_FOLDER } from './space-database';

/** Test-only physical state, including all rows/schema/ledger; no current repository interpretation. */
export function readRecoveryState(path: string) {
  const sqlite = openDatabase(path);
  try {
    const schema = sqlite
      .query<{ type: string; name: string; tbl_name: string; sql: string | null }, []>(
        'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name',
      )
      .all();
    const tables = schema
      .filter((each) => each.type === 'table')
      .map((each) => ({
        name: each.name,
        rows: sqlite
          .query('SELECT * FROM "' + each.name.replaceAll('"', '""') + '" ORDER BY rowid')
          .all(),
      }));
    return { schema, tables };
  } finally {
    sqlite.close();
  }
}

/** Copies only actual immutable folders at/before the selected historical epoch; never current rename111. */
export function copyRecoveryPrefix(directory: string, through: string): string {
  const folder = join(directory, 'migrations');
  mkdirSync(folder);
  const names = readdirSync(MIGRATIONS_FOLDER, { withFileTypes: true })
    .filter((each) => each.isDirectory() && each.name <= through)
    .map((each) => each.name)
    .sort();
  if (names.at(-1) !== through) throw Error('historical recovery prefix not found ' + through);
  for (const name of names) {
    const target = join(folder, name);
    mkdirSync(target);
    for (const file of ['migration.sql', 'down.sql'])
      copyFileSync(join(MIGRATIONS_FOLDER, name, file), join(target, file));
  }
  return folder;
}
