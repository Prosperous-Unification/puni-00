import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Gives the local quiet-load server its own fresh database before real main boots.
 * Allocation happens only when this startup module runs, never during config
 * discovery. The private directory stays retained, including on startup failure;
 * real main retains optimizer, supervisor and disposal ownership. This is not an
 * upgrade-admission, activation or private-directory cleanup claim.
 */
async function startLocalBrowser(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'wbs-local-browser-'));
  process.env['DB_PATH'] = join(directory, 'test.db');
  process.env['MIGRATE_ON_STARTUP'] = 'true';
  console.log('Local browser database: ' + process.env['DB_PATH']);
  await import('../main');
}

await startLocalBrowser();
