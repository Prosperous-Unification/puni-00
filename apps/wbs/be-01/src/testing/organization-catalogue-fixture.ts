import { dirname } from 'node:path';

import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';
import { applyHistoricalCatalogueFixture } from '@wbs/store-sqlite/testing/historical-catalogue';
import { copyRecoveryPrefix } from '@wbs/store-sqlite/testing/recovery-state';

import { openReadOnlyDatabase } from '../repository/db';
import { runMigrations } from '../repository/migrate';

/**
 * Migrates an exclusively owned empty HTTP fixture through the real catalogue
 * report, backup and atomic apply, then additive migrations. Lower helpers
 * verify complete ledgers and absence of legacy storage before returning.
 * Failure retains the fixture directory; this grants no live activation authority.
 */
export function migrateOrganizationCatalogueFixture(path: string): void {
  migrateEmptyCatalogueFixture(
    { path, directory: dirname(path), reportedAt: 1 },
    { hasUnknownOwner: false },
  );
}

/** Migrates a restored runtime database through rename111, exposes the read-only rename checkpoint, then applies the explicit catalogue migration to its historical steps. */
export function migrateRenamedRuntimeCatalogueFixture(
  path: string,
  inspectRename?: (database: ReturnType<typeof openReadOnlyDatabase>) => void,
): void {
  const directory = dirname(path);
  runMigrations(
    path,
    copyRecoveryPrefix(directory, '20261110100000_rename_project_to_work_package'),
  );
  if (inspectRename !== undefined) {
    const database = openReadOnlyDatabase(path);
    try {
      inspectRename(database);
    } finally {
      database.close();
    }
  }
  applyHistoricalCatalogueFixture(path, directory, {});
}
