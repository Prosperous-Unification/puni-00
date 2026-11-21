import { createHash } from 'node:crypto';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from 'bun:test';

import { type Drizzle, openExistingConnection } from '../db';
import { runMigrations } from '../migrate';
import { readMigrationFolders } from '../migrate-down';
import { applyStepCatalogue } from '../step-catalogue-apply';
import { reportStepCatalogue } from '../step-catalogue-report';
import { createWindowBackup } from '../window-backup';
import type { CatalogueFixtureCustody } from './catalogue-database';
import provenance from './fixtures/legacy-delete.json';
import { copyRecoveryPrefix } from './recovery-state';
import { MIGRATIONS_FOLDER } from './space-database';

export type LegacyDeleteCase = keyof typeof provenance.cases;

/**
 * Migrates authentic old deletion bytes through actual116/report/E37/private117/118/119.
 * Only fixture migrations are admitted; no Source, journal or authority is fabricated.
 * The caller owns the directory. Uncertain migration/acquisition/close custody retains it.
 */
export function prepareLegacyDeleteDatabase(
  directory: string,
  kind: LegacyDeleteCase,
  custody: CatalogueFixtureCustody,
): string {
  function withinConnection<Value>(use: (db: Drizzle) => Value): Value {
    let connection: ReturnType<typeof openExistingConnection>;
    try {
      connection = openExistingConnection(path);
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
    let observed: { ok: true; value: Value } | { ok: false; cause: unknown };
    try {
      observed = { ok: true, value: use(connection.db) };
    } catch (cause: unknown) {
      observed = { ok: false, cause };
    }
    try {
      connection.close();
    } catch (cleanup: unknown) {
      custody.hasUnknownOwner = true;
      if (!observed.ok)
        throw new AggregateError(
          [observed.cause, cleanup],
          'legacy deletion operation and close failed',
          { cause: cleanup },
        );
      throw cleanup;
    }
    if (!observed.ok) throw observed.cause;
    return observed.value;
  }
  function migrate(): void {
    try {
      runMigrations(path, migrations);
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
  }
  const selected = provenance.cases[kind];
  const compressed = readFileSync(new URL('./fixtures/' + selected.file, import.meta.url));
  expect(createHash('sha256').update(compressed).digest('hex')).toBe(selected.gzipSha256);
  const bytes = Bun.gunzipSync(compressed);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(selected.databaseSha256);
  const path = join(directory, 'legacy.db');
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  const migrations = copyRecoveryPrefix(directory, '20261115120000_add_step_migration_report');
  const predecessors = readMigrationFolders(migrations);
  expect(predecessors).toHaveLength(116);
  withinConnection((db) => {
    expect(db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name')).toEqual(
      predecessors.slice(0, 110).map(({ name, hash }) => ({ name, hash })),
    );
  });
  migrate();
  const readHistory = (db: Drizzle) => ({
    journal: db.all('SELECT * FROM command_journal ORDER BY seq'),
    events: db.all('SELECT * FROM plan_event ORDER BY rowid'),
  });
  const history = withinConnection(readHistory);
  const report = withinConnection((db) => reportStepCatalogue(db, 1));
  expect(report.rows).toEqual([]);
  const catalogue = '20261115130000_add_step_catalogue';
  cpSync(join(MIGRATIONS_FOLDER, catalogue), join(migrations, catalogue), { recursive: true });
  const window = {
    sourcePath: path,
    migrationsFolder: migrations,
    snapshotPath: join(directory, 'before-catalogue.db'),
    reportPath: join(directory, 'before-catalogue.json'),
  };
  try {
    createWindowBackup(window);
    const ledger = applyStepCatalogue({
      window,
      rulesJson: JSON.stringify({ version: 1, fingerprint: report.fingerprint, organizations: {} }),
      appliedAt: '2026-11-20T00:00:00.000Z',
    });
    expect(ledger).toHaveLength(117);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  for (const name of [
    '20261118180000_add_resource_use_locations',
    '20261118210000_add_step_retirements',
  ]) {
    cpSync(join(MIGRATIONS_FOLDER, name), join(migrations, name), { recursive: true });
    migrate();
  }
  withinConnection((db) => {
    expect(db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name')).toEqual(
      readMigrationFolders(migrations).map(({ name, hash }) => ({ name, hash })),
    );
    expect(readHistory(db)).toEqual(history);
    expect(db.all('SELECT work_item_id,step_id,state,stated_at FROM step_progress')).toEqual([
      { work_item_id: 'parent', step_id: 'legacy-dev', state: 'done', stated_at: 20 },
    ]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  return path;
}
