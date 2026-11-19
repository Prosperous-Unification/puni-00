import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

it('keeps the full current parent schema and irreversible window independently of historical fixtures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-current-migrations-')),
    path = join(directory, 'store.db');
  try {
    runMigrations(path, FOLDER);
    const sqlite = openDatabase(path);
    try {
      const ledger = () =>
        sqlite
          .query<{ name: string; hash: string }, []>(
            'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
          )
          .all();
      const schema = () =>
        sqlite
          .query<{ type: string; name: string; tbl_name: string; sql: string | null }, []>(
            'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name',
          )
          .all();
      const applied = ledger(),
        before = schema(),
        columns = sqlite
          .query<{ name: string; notnull: number }, []>('PRAGMA table_info(work_package)')
          .all();
      expect(applied).toEqual(
        readMigrationFolders(FOLDER).map(({ name, hash }) => ({ name, hash })),
      );
      expect(
        applied.some(({ name }) => name === '20261110100000_rename_project_to_work_package'),
      ).toBe(true);
      expect(applied.some(({ name }) => name === '20261110110000_add_project')).toBe(true);
      expect(
        applied.some(({ name }) => name === '20261110110100_widen_organization_audit_projects'),
      ).toBe(true);
      expect(before.some(({ type, name }) => type === 'table' && name === 'project')).toBe(true);
      expect(columns.find(({ name }) => name === 'project_id')?.notnull).toBe(1);
      expect(columns.find(({ name }) => name === 'created_by')?.notnull).toBe(1);
      expect(columns.some(({ name }) => name === 'owner_id')).toBe(false);
      expect(() => rollbackTo(path, FOLDER, '20261103110000_add_initial_access_offers')).toThrow(
        'audit project rollback requires restoring the verified window snapshot',
      );
      expect(ledger()).toEqual(applied);
      expect(schema()).toEqual(before);
    } finally {
      sqlite.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
