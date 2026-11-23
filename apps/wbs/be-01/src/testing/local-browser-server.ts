import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';

/**
 * Gives the local quiet-load server its own current empty catalogue before real main boots.
 * Allocation happens only when this startup module runs, never during config
 * discovery. The private directory stays retained, including on startup failure;
 * real main retains optimizer, supervisor and disposal ownership. This is not an
 * upgrade-admission, activation or private-directory cleanup claim.
 */
async function startLocalBrowser(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'wbs-local-browser-'));
  const path = join(directory, 'test.db');
  migrateEmptyCatalogueFixture(
    { path, directory, reportedAt: Date.now() },
    { hasUnknownOwner: false },
  );
  process.env['DB_PATH'] = path;
  process.env['MIGRATE_ON_STARTUP'] = 'true';
  console.log('Local browser database: ' + process.env['DB_PATH']);
  await import('../main');
}

await startLocalBrowser();
