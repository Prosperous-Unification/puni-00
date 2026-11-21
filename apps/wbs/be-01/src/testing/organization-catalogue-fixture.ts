import { dirname } from 'node:path';

import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';

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
