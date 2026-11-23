import { deepStrictEqual, strictEqual } from 'node:assert';
import { cpSync } from 'node:fs';
import { join } from 'node:path';

import { type Drizzle, openExistingConnection } from '../db';
import { runMigrations } from '../migrate';
import { readMigrationFolders } from '../migrate-down';
import { applyStepCatalogue } from '../step-catalogue-apply';
import { reportStepCatalogue } from '../step-catalogue-report';
import { assertWindowBackup, createWindowBackup } from '../window-backup';
import { copyRecoveryPrefix } from './recovery-state';
import { MIGRATIONS_FOLDER } from './space-database';

/** Actual lower acquisition/close uncertainty is latched into the enclosing fixture owner. */
export interface CatalogueFixtureCustody {
  hasUnknownOwner: boolean;
}

/**
 * Empty exclusively owned fixture database: normal116, actual report/E37/private117,
 * then ordinary additive118 and119. Exact name/hash ledgers and absent legacy inventory
 * are checked before a Source opens. It supplies no host/session/barrier authority
 * and never grants pending117 to the default migrator.
 */
export function migrateEmptyCatalogueFixture(
  {
    path,
    directory,
    reportedAt,
  }: { readonly path: string; readonly directory: string; readonly reportedAt: number },
  custody: CatalogueFixtureCustody,
): void {
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
          'catalogue fixture operation and close failed',
          { cause: cleanup },
        );
      throw cleanup;
    }
    if (!observed.ok) throw observed.cause;
    return observed.value;
  }
  const predecessor = '20261115120000_add_step_migration_report',
    catalogue = '20261115130000_add_step_catalogue';
  const parents = readMigrationFolders(MIGRATIONS_FOLDER).filter(({ name }) => name <= predecessor);
  strictEqual(parents.length, 116);
  const migrations = copyRecoveryPrefix(directory, predecessor);
  try {
    runMigrations(path, migrations);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  const addition = readMigrationFolders(MIGRATIONS_FOLDER).filter(({ name }) => name === catalogue);
  strictEqual(addition.length, 1);
  cpSync(join(MIGRATIONS_FOLDER, catalogue), join(migrations, catalogue), { recursive: true });
  const report = withinConnection((db) => reportStepCatalogue(db, reportedAt));
  deepStrictEqual(report.rows, []);
  const window = {
    sourcePath: path,
    migrationsFolder: migrations,
    snapshotPath: join(directory, 'before-catalogue.db'),
    reportPath: join(directory, 'before-catalogue.json'),
  };
  try {
    const backup = createWindowBackup(window);
    deepStrictEqual(assertWindowBackup(window), backup.report);
    applyStepCatalogue({
      window,
      rulesJson: JSON.stringify({
        version: 1,
        fingerprint: report.fingerprint,
        organizations: {},
      }),
      appliedAt: '2026-11-18T00:00:00.000Z',
    });
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  withinConnection((db) => {
    deepStrictEqual(
      db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name'),
      [...parents, ...addition].map(({ name, hash }) => ({ name, hash })),
    );
  });
  // The real additive118 follows the real explicit117 owner; the ordinary
  // migrator still receives no bypass for pending catalogue storage.
  const locations = readMigrationFolders(MIGRATIONS_FOLDER).filter(
    ({ name }) => name === '20261118180000_add_resource_use_locations',
  );
  strictEqual(locations.length, 1);
  cpSync(
    join(MIGRATIONS_FOLDER, '20261118180000_add_resource_use_locations'),
    join(migrations, '20261118180000_add_resource_use_locations'),
    { recursive: true },
  );
  try {
    runMigrations(path, migrations);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  const retirement = '20261118210000_add_step_retirements';
  const retirements = readMigrationFolders(MIGRATIONS_FOLDER).filter(
    ({ name }) => name === retirement,
  );
  strictEqual(retirements.length, 1);
  cpSync(join(MIGRATIONS_FOLDER, retirement), join(migrations, retirement), { recursive: true });
  try {
    runMigrations(path, migrations);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  withinConnection((db) => {
    deepStrictEqual(
      db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name'),
      [...parents, ...addition, ...locations, ...retirements].map(({ name, hash }) => ({
        name,
        hash,
      })),
    );
    deepStrictEqual(
      db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='step'"),
      [],
    );
    deepStrictEqual(db.all('SELECT id FROM step_definition'), []);
  });
}
