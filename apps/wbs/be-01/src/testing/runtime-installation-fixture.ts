import { readFileSync } from 'node:fs';

import { expect } from 'bun:test';

import { openDatabase } from '../repository/db';

/**
 * Destructively replaces only runtime history in a test database. Reuses the
 * exact current table/index/trigger definitions and the immutable migration's
 * fresh-marker INSERT, preserving the complete applied ledger. This is not an
 * operator rollback or a recovery procedure across the rename migration.
 */
export function reconstructRuntimeInstallation(dbPath: string): void {
  const native = openDatabase(dbPath);
  try {
    const readSchema = () =>
      native
        .query<{ type: string; name: string; sql: string }, []>(
          "SELECT type,name,sql FROM sqlite_master WHERE tbl_name IN ('runtime_command_receipt','runtime_claim_binding','runtime_authority','runtime_ledger') AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 ELSE 3 END,name",
        )
        .all();
    const beforeSchema = readSchema();
    expect(beforeSchema.filter((entry) => entry.type === 'table')).toHaveLength(4);
    const beforeLedger = native.query('SELECT * FROM __drizzle_migrations ORDER BY id').all();
    const installation = readFileSync(
      new URL('../../drizzle/20261022121000_add_runtime_commands/migration.sql', import.meta.url),
      'utf8',
    );
    const markers = installation
      .split('--> statement-breakpoint')
      .filter((statement) => statement.trim().startsWith('INSERT INTO runtime_ledger '));
    const marker = markers.at(0);
    if (markers.length !== 1 || marker === undefined)
      throw new Error('immutable runtime marker INSERT missing or ambiguous');
    native.transaction(() => {
      for (const table of [
        'runtime_command_receipt',
        'runtime_claim_binding',
        'runtime_authority',
        'runtime_ledger',
      ])
        native.run(`DROP TABLE ${table}`);
      for (const entry of beforeSchema) native.run(entry.sql);
      native.run(marker);
      expect(readSchema()).toEqual(beforeSchema);
      expect(native.query('SELECT * FROM __drizzle_migrations ORDER BY id').all()).toEqual(
        beforeLedger,
      );
    })();
  } finally {
    native.close();
  }
}
